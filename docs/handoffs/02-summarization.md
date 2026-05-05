# 02 — Summarization (Gemini 2.5 Flash)

## Context

Handoff 01 landed: 733 Colorado bills in Turso, stage inference working, OpenStates abstracts populated inline via `include=abstracts`. This handoff adds the LLM summarization layer (CBT's `lib/summarize.ts` + `scripts/summarize.ts` ported across) and fixes two small things from handoff 01 that we deferred until we had real data.

Read CBT's `lib/summarize.ts` and `scripts/summarize.ts` first. Most of the structure carries over verbatim — only the input fields and the enums change.

## Scope

1. Drop `enacted` from `STAGES` enum (lib/enums.ts)
2. Update precedence in lib/stage.ts so `signed` outranks `vetoed`
3. lib/summarize.ts — Gemini call with OpenStates fields as input
4. lib/summarize-runner.ts — batch processor for `summary IS NULL` rows
5. scripts/summarize.ts — standalone unbounded CLI entry
6. Run backfill on the existing 733 bills, spot-check output quality

Out of scope: cron route (handoff 03), UI port (handoff 04), external bill-text fetching from leg.colorado.gov (deferred until we see if abstracts are enough).

## Stage taxonomy update

`lib/enums.ts`:

```typescript
export const STAGES = [
  'introduced',
  'in_committee',
  'passed_first_chamber',
  'passed_second_chamber',
  'signed',          // governor signed; terminal success in CO
  'vetoed',
  'dead',
] as const;
```

That's 7 stages, down from 8. Drop `enacted` everywhere it's referenced (validator fallback, queries.ts STALE_FILTER_STAGES, anywhere else it leaked).

## Stage inference update

`lib/stage.ts`: swap the precedence so `signed` wins over `vetoed`. Reasoning: in Colorado, if both `executive-signature` and `executive-veto` appear in the action chain, the only way that happens is veto-override succeeded → bill became law. OpenStates may not emit a distinct override-success classification, so we infer.

New precedence (most-advanced wins):

```
signed → vetoed → passed_second_chamber → passed_first_chamber → in_committee → introduced
```

`dead` detection unchanged (withdrawal/failure classifications + "postponed indefinitely"/"lost" text).

If a bill has both `executive-signature` and `executive-veto` in its action history, log a `console.warn` with the bill_id and action classifications. We can refine the heuristic later if it actually fires.

## Prompt

```
You are summarizing a Colorado state bill for a personal tracking dashboard. Write a 2-3 sentence summary in plain English that explains what the bill would actually change if enacted. Avoid legalese, avoid the bill's marketing title, avoid editorial language. State who is affected and how.

Then output a JSON block with:
- topics: array of 1-3 topic tags from this list: [healthcare, taxes, energy, environment, education, labor, technology, civil_rights, criminal_justice, agriculture, housing, transportation, veterans, elections, budget, financial_services, consumer_protection, government_operations, public_safety, licensing, municipal_affairs, cannabis, water, immigration, other]
- stage: one of [introduced, in_committee, passed_first_chamber, passed_second_chamber, signed, vetoed, dead]

Bill identifier: {identifier}
Bill title: {title}
Latest action: {latest_action_text}
Official abstract (if any): {abstract_text}

Respond in this exact format:

SUMMARY:
<2-3 sentences>

JSON:
{"topics": [...], "stage": "..."}
```

Keep the prompt in source (`lib/summarize.ts`), not in the database. Same convention as CBT.

## Input field extraction

For each row where `summary IS NULL`, parse `raw_json` and pull:

- `identifier` → top-level `identifier` field, e.g. `"HB 25-1234"`
- `title` → top-level `title`
- `latest_action_text` → already a column on the bills row, no need to dig
- `abstract_text` → walk `abstracts[]`, prefer the entry where `note == "summary"`. If multiple match or none has that note, pick the longest `abstract` field. Trim to 6,000 chars before substituting into the prompt.

If `abstracts[]` is empty or all entries are blank, substitute `"(none yet — only the title and latest action are available)"` into the prompt. Don't skip the bill; the LLM falls back on title + latest action.

Do **not** fetch external bill text from leg.colorado.gov. We're betting the OpenStates abstract is sufficient. If summary quality is bad in spot-checks, handoff 03 will add the full-text fetcher.

## Validator (carry over from CBT)

After parsing the JSON block:

- `topics`: filter to values in `TOPICS` enum. Log dropped values via `console.warn` with the bill_id. If all topics are out-of-enum, fall back to `["other"]`.
- `stage`: if not in `STAGES`, fall back to `introduced` and log.

The LLM's `stage` is informational. The canonical `stage` in the bills table comes from the deterministic `stageFromActions()` and is set during sync. Don't overwrite it from the LLM. If you want to compare for debugging, log when they diverge but keep the deterministic value.

Store on each row:
- `summary` → the parsed SUMMARY block, trimmed
- `topics` → JSON-stringified array
- `summary_model` → e.g. `"gemini-2.5-flash"`
- `summary_updated_at` → ISO timestamp

## Batching and rate

Use the same Gemini setup as CBT (`@google/genai`, model `gemini-2.5-flash`). Process in batches of 10 concurrent requests with a 1-second delay between batches. Paid-tier rate limits won't be the bottleneck.

`scripts/summarize.ts` is unbounded — runs until `summary IS NULL` count is zero. Log per-bill: `summarized co-2025a-hb-1234: [topics] / stage`. Log aggregate at end: `N summarized, M failed`.

`lib/summarize-runner.ts` exports a `runSummarize({ limit }: { limit?: number })` function. The cron route (handoff 03) will call it with `limit: 50` to fit the Vercel Hobby 60-second function ceiling. The standalone script calls it with no limit.

## Cost

Gemini 2.5 Flash backfill on 733 bills: roughly $0.15 total (input ~2k tokens × 733 + output ~200 tokens × 733). Daily incremental cost once we're caught up: under $0.01/day.

## Acceptance criteria

- [ ] `npx tsc --noEmit` clean after enum changes
- [ ] `enacted` no longer appears anywhere in source
- [ ] `npm run summarize` runs the full 733-bill backfill without errors
- [ ] `SELECT COUNT(*) FROM bills WHERE summary IS NULL;` → 0 (or single-digit if the LLM choked on a few)
- [ ] Spot-check 10 random bills:
  - Summary is 2-3 sentences, plain English, doesn't parrot the marketing title
  - `topics` parses as a JSON array, all values in the enum
  - `stage` column (deterministic) is in the new 7-stage enum
- [ ] Topic distribution check:
  ```sql
  SELECT json_each.value AS topic, COUNT(*) AS n
  FROM bills, json_each(bills.topics)
  GROUP BY topic
  ORDER BY n DESC;
  ```
  Cannabis, water, healthcare, taxes, education, public_safety should all appear with non-zero counts. If any single topic claims more than ~30% of bills, flag for prompt tuning.

## Things to flag back

1. **Abstract coverage** — out of 733 bills, how many had a usable abstract vs how many fell through to the title-only fallback? If the fallback rate is above ~15%, handoff 03 needs to add full-text fetching.
2. **Stage disagreement** — count of bills where the LLM-emitted stage differs from the deterministic stage. If it's above 5%, there's likely a bug in stageFromActions for some action pattern we haven't seen yet.
3. **Topic hot spots** — anything dominating the distribution unreasonably. The federal CBT version had `government_operations` and `consumer_protection` drift after the initial backfill; expect some calibration here too.

Don't add full-text fetching, don't touch the UI, don't write the cron route. Backfill, prove the output, hand back.
