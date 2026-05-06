# 04 — Deploy to Vercel + cron + action history cleanup

## Context

Handoff 03 landed: CCBT renders correctly against the 733-bill database locally. This handoff puts it into production — cron-driven daily sync, Vercel deploy, and one small UX fix on the detail page that came out of handoff 03's spot-checks.

Read CBT's `app/api/sync/route.ts` and `vercel.json` first. The cron pattern carries over almost identically.

## Scope

1. Major-actions filter on `/bill/[id]` so the default view isn't 15 lines of "Refer Amended to Appropriations"
2. `app/api/sync/route.ts` — cron-protected route running sync then summarize with `limit: 50`
3. `vercel.json` — daily cron at 09:00 UTC
4. README deploy instructions
5. Production deploy verification

Out of scope: session rollover automation (manual env var bump once a year is fine), observability/alerting beyond Vercel's default logs, multi-state expansion.

## 1. Major-actions filter

`app/bill/[id]/page.tsx`: action history currently dumps all actions. Replace with a curated list by default and a collapsible "Show all" block beneath.

Show by default any action whose `classification` array contains one of:

```
introduction
reading-1
reading-2
reading-3
referral-committee  (first occurrence only — repeated committee referrals are noise)
passage
executive-receipt
executive-signature
executive-veto
veto-override-passage
withdrawal
failure
```

Below the curated list, a native `<details>` element:

```html
<details>
  <summary>Show all {N} actions</summary>
  <ul>
    {/* full action list, newest first */}
  </ul>
</details>
```

`<details>` is plain HTML, no client component needed, no JS. Keeps the page server-rendered. If the curated count equals the full count, omit the `<details>` block entirely.

If a bill has fewer than 4 total actions, skip the filter and just render all of them — splitting 3 actions into "major" and "all" looks silly.

## 2. `app/api/sync/route.ts`

Port from CBT with these specifics:

```typescript
import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';
import { runSummarize } from '@/lib/summarize-runner';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const sync = await runSync();
    const summarize = await runSummarize({ limit: 50 });
    return NextResponse.json({ sync, summarize, ok: true });
  } catch (err) {
    console.error('cron sync failed', err);
    return NextResponse.json(
      { error: String(err), ok: false },
      { status: 500 }
    );
  }
}
```

Notes:
- `maxDuration = 60` matches Vercel Hobby ceiling
- `force-dynamic` prevents Next from trying to cache the route at build time
- Sync first, then summarize — same order as CBT
- `limit: 50` on summarize fits inside 60s including the OpenStates rate-limited sync (~6.5s/page, but daily incremental is usually 0–2 pages)

If sync returns more than ~50 new bills with NULL summaries, the next day's tick picks up the leftover. That's fine; CO doesn't introduce that many bills per day.

## 3. `vercel.json`

```json
{
  "crons": [
    { "path": "/api/sync", "schedule": "0 9 * * *" }
  ]
}
```

09:00 UTC = 02:00–03:00 MT depending on DST. Same time as CBT for consistency.

Hobby tier caps cron to once per day. Don't try to increase frequency.

## 4. Environment variables in Vercel

Set these in the Vercel dashboard (Project → Settings → Environment Variables) for **Production**:

```
OPENSTATES_API_KEY
GEMINI_API_KEY
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
CRON_SECRET
CO_CURRENT_SESSION=2025A
```

`CRON_SECRET` should be a fresh 32-byte hex string distinct from CBT's. Generate with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Don't reuse CBT's `CRON_SECRET`. Different project, different secret.

## 5. README updates

Replace CBT's deploy section with CCBT specifics:

```markdown
## Deployment

Deployed via `vercel --prod`. A daily Vercel Cron at 09:00 UTC (`vercel.json`) hits `/api/sync` with a `Bearer ${CRON_SECRET}` header; the route runs sync first, then summarizes any new NULL-summary rows (capped at 50/tick to fit the Hobby 60-second function ceiling).

When the Colorado legislative session rolls over (currently 2025A; next is 2025B for special session or 2026A for next regular session), update the `CO_CURRENT_SESSION` env var in Vercel and locally. No code change required.
```

Keep the existing "Running locally" section; just swap any references to congress.gov for OpenStates, and reflect the new CCBT scope.

## 6. Verification

Local first:
- [ ] `npm run build` succeeds
- [ ] `npx tsc --noEmit` clean
- [ ] Curl test the cron route locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync` returns `{ ok: true, sync: {...}, summarize: {...} }`
- [ ] Same curl without auth returns 401
- [ ] `/bill/co-2025a-sb-19` (the 13-action bill from handoff 03 spot-checks) shows ~5 curated actions by default and "Show all 13 actions" expanded shows the full list

Deploy:
- [ ] `vercel --prod` succeeds
- [ ] Production URL serves the feed correctly
- [ ] Vercel dashboard → Cron Jobs shows the daily registration
- [ ] Manual cron trigger from the Vercel dashboard succeeds (Project → Cron Jobs → Run)

After the first scheduled tick (next 09:00 UTC), check Vercel function logs for the sync output. Healthy log looks like the standalone `npm run sync` output: `Fetched X, new Y, updated Z, unchanged W` followed by summarize stats.

## Acceptance criteria

- [ ] All 9 verification items pass
- [ ] Production URL is in the README under a "Live demo" header
- [ ] No console errors in Vercel function logs after first manual trigger

## Things to flag back

1. **Cold start latency.** Vercel serverless functions can be slow on first hit. If the production homepage takes more than 3s to first paint, flag it — Turso edge replication or moving the project to a closer region might help, but probably isn't needed for personal use.
2. **Cron payload size.** If `summarize: { limit: 50 }` consistently leaves a backlog (i.e. NULL count grows day over day), bump to 100/tick. State sessions don't move that fast so this shouldn't happen, but worth watching the first few ticks.
3. **Session rollover.** When CO 2025A ends and the legislature comes back, the env var needs updating. If you remember the exact end date of CO 2025A, jot it in the README. Otherwise we'll find out by watching the daily sync return zero new bills for a week straight.

After this lands, CCBT is shipping. Commit + push, deploy, and we're done with the build phase.
