# 26 — Serialize the summarize runner

## Context

A full-database summarize backfill on CBT (the federal sibling) exposed three issues. Audit on CCBT:

- §2 — header count = feed count: **done.** `buildFeedWhere` is shared between `getFeedCount` and `getFeedBills` in `lib/queries.ts`. Neither path filters on `summary IS NOT NULL`, so they agree. Handoff 24 must have landed this.
- §3 — 503 retry: **partially in place, in an unexpected location.** `lib/summarize.ts` has `generateWithRetry` + `isOverloadError` catching 503/UNAVAILABLE/overloaded at the per-call level, 3 retries at 5/10/20s. The gap is 429 (rate-limit) retry, which doesn't exist anywhere.
- §1 — serialize runner: **not done.** `lib/summarize-runner.ts` does `Promise.all` over batches of 10 with 1s between batches.

CBT handoffs for the original diagnosis: 46 (the backfill where the runner fix was discovered), 48 (the retry shape). CBT live: https://cbt-chi-silk.vercel.app.

This handoff folds §1 and §3 into a single change: serialize the runner, and move retry policy entirely into the runner. The per-call retry in `summarize.ts` gets deleted. Two retry layers with different backoffs (5/10/20s vs 2/4/8/16s) would compound badly during a real 429+503 storm and make debugging painful.

## The change

### `lib/summarize-runner.ts`

Delete the constants `BATCH_SIZE` and `BATCH_DELAY_MS`. Add:

```ts
const THROTTLE_MS = 400;
const RETRY_BACKOFFS_MS = [2000, 4000, 8000, 16000];

function isRetryable(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  return /\b429\b|\b503\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|rate limit|quota/i.test(
    msg,
  );
}

async function withRetry<T>(fn: () => Promise<T>, billId: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === RETRY_BACKOFFS_MS.length) {
        throw err;
      }
      const wait = RETRY_BACKOFFS_MS[attempt];
      const msg = (err as Error).message ?? "";
      console.warn(
        `retry ${billId} attempt ${attempt + 1}/${RETRY_BACKOFFS_MS.length}, wait ${wait}ms: ${msg.slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
```

Replace the existing `for (let i = 0; i < candidates.length; i += BATCH_SIZE)` block with a serial loop, one candidate at a time. Inside the loop body:

1. Call `summarizeBill(client, c.bill)` wrapped in `withRetry(() => summarizeBill(client, c.bill), c.bill.id)`.
2. Keep all existing logic — token accumulation, parse-fail handling, unparseable-stage tracking, in-enum divergence warning, the DB `UPDATE` of `summary`/`summary_model`/`summary_updated_at`/`topics`, sample collection — exactly as in the current code. Just move it out of the `Promise.all` map and inline into the loop.
3. After each bill (except the last), `await new Promise((r) => setTimeout(r, THROTTLE_MS))`.
4. The outer `try/catch` around `summarizeBill` stays. After `withRetry` exhausts or hits a non-retryable error, it throws, and the existing `catch` block logs and increments `stats.failed`.

### `lib/summarize.ts`

Delete `isOverloadError` and `generateWithRetry`. In `summarizeBill`, replace:

```ts
const response = await generateWithRetry(client, userPrompt);
```

with the direct call that `generateWithRetry` was wrapping:

```ts
const response = await client.models.generateContent({
  model: SUMMARY_MODEL,
  contents: userPrompt,
  config: {
    systemInstruction: SYSTEM_PROMPT,
    thinkingConfig: { thinkingBudget: 0 },
  },
});
```

`summarizeBill` now throws on any error. The runner's `withRetry` is the only retry layer.

## Acceptance

```bash
npm run typecheck
```

Then a small re-summarize against prod Turso to verify the throttle holds and retry fires on real 429s if they happen:

```bash
turso db shell ccbt "UPDATE bills SET summary = NULL WHERE id IN (SELECT id FROM bills WHERE summary IS NOT NULL ORDER BY RANDOM() LIMIT 20)"
npm run summarize
```

Expected: log lines roughly 400ms apart, retry warnings if Gemini throttles, post-run `null_summary` returns to 0.

```sql
SELECT COUNT(*) AS total, COUNT(summary) AS with_summary, COUNT(*) - COUNT(summary) AS null_summary FROM bills;
```

## Don't

- Don't leave both retry layers in place. The point of this handoff is one retry policy in one place.
- Don't widen the retry regex past 429+503 markers. Other 5xxs from Gemini usually mean request-shape problems, not transient capacity.
- Don't change `summarizeBill`'s return type or `SummarizeOutput` shape. The runner depends on `result`, `llmStageRaw`, `promptTokens`, `outputTokens`.
- Don't kick off a full re-summarize unless this change ships first. Without it, you're rolling the same dice CBT rolled at 15,656 rows.

## Cost

- The change itself: $0.
- Optional 20-bill verification re-summarize: ~$0.01.
- Optional full 733-bill re-summarize: ~$0.50. Skip if existing summaries are fine; the runner change still applies to future daily syncs and any future session rollover backfill.
