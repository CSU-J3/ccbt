# 25 — Fix local .env, run sponsor_id backfill, verify prod recovery

## Context

Prod (https://ccbt-eta.vercel.app) is currently returning 500 on every route after the handoff 24 push. Root cause: `getSponsorAggregates` and other queries reference `bills.sponsor_id`, but the column was never added to the prod Turso database because `npm run migrate` ran against a different database than the one Vercel is reading from.

**Already done manually**: the column and index have been added to prod via the Turso SQL Console (`ccbt` database under `csu-j3` org):

```sql
ALTER TABLE bills ADD COLUMN sponsor_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bills_sponsor_id ON bills(sponsor_id);
```

That ran clean. Site is still 500ing because `sponsor_id` is `NULL` for every row (no backfill yet), and `/sponsors` filters out NULL sponsor_ids — so the page renders empty rather than 500, but anything that joins on it can still misbehave. More importantly, the home feed queries that reference `sponsor_id` need real data.

The remaining problem: when you tried to run `npx tsx scripts/backfill-sponsor-id.ts` locally, it errored with "no such column: sponsor_id" — which means the local `.env`'s `TURSO_DATABASE_URL` is pointing at a different database than prod. Most likely candidate: the federal CBT sister project's URL leaked into this `.env`, or there's a stale dev DB URL.

## Scope

1. Verify and fix `.env`'s `TURSO_DATABASE_URL` so it matches prod
2. Run the sponsor_id backfill
3. Confirm prod recovers

**Out of scope**: fixing the underlying bug in `scripts/migrate.ts` that allowed this to happen (the `PRAGMA table_info` idempotency guard is broken — `CREATE INDEX` ran before `ALTER TABLE` registered the new column). That's handoff 26.

## Steps

### 1. Diagnose current `.env`

```powershell
type .env | findstr TURSO_DATABASE_URL
```

Print the result. Expected prod URL (per Vercel runtime logs from the failed deploy):

```
libsql://ccbt-csu-j3.aws-us-west-2.turso.io
```

If `.env` shows a different URL — typically `cbt-csu-j3.aws-us-west-2.turso.io` (federal project) or some other `-dev` variant — that confirms the diagnosis. Stop and ask the user to paste the exact prod `TURSO_DATABASE_URL` value from Vercel → Project Settings → Environment Variables → reveal — don't guess.

### 2. Update `.env`

Replace the `TURSO_DATABASE_URL` line with the prod value the user provides. Leave `TURSO_AUTH_TOKEN` alone unless the user also flags it as wrong (the auth token is database-scoped, so a mismatched URL with a CBT token would also fail; ask if unsure).

Verify:

```powershell
type .env | findstr TURSO_DATABASE_URL
```

Should now show the prod URL.

### 3. Run the backfill

```powershell
npx tsx scripts/backfill-sponsor-id.ts
```

Expected output: a row count somewhere in the 700s being updated (current bill count is 733). If it still errors with "no such column," the URL update didn't take — re-check `.env` for typos or a duplicate line that an earlier line is overriding.

If it reports zero rows updated but exits clean, the connection is right but every bill's `raw_json.sponsorships` array is empty or malformed — that's a separate bug, flag it back.

### 4. Verify prod

```powershell
curl -I https://ccbt-eta.vercel.app
```

Should return `HTTP/2 200`. Then:

```powershell
curl -I https://ccbt-eta.vercel.app/sponsors
```

Same — `200`. If `/sponsors` still 500s after a successful backfill, capture the new digest from Vercel logs and paste it back. Possible cause: a query I'm not aware of that filters or joins on something else added in 24.

### 5. Spot-check sponsor data

Quick sanity query in the Turso SQL Console (or via a one-off `npx tsx` if you want):

```sql
SELECT COUNT(*) FILTER (WHERE sponsor_id IS NOT NULL) AS with_id,
       COUNT(*) FILTER (WHERE sponsor_id IS NULL) AS without_id,
       COUNT(*) AS total
FROM bills;
```

Expected: `with_id` ≈ 700+, `without_id` small (bills with no primary sponsor in `raw_json`), `total` = 733-ish.

## Acceptance criteria

- [ ] `.env`'s `TURSO_DATABASE_URL` matches the value in Vercel's `TURSO_DATABASE_URL` env var
- [ ] `npx tsx scripts/backfill-sponsor-id.ts` runs clean and reports a non-zero update count
- [ ] `https://ccbt-eta.vercel.app` returns 200 on `/`, `/sponsors`, `/watchlist`
- [ ] Sample query above shows `with_id` is the dominant value

## What to flag back

1. The exact diff between the old and new `TURSO_DATABASE_URL` in `.env` (so we know whether the old one was CBT's, a dev DB, or a typo).
2. Whether `TURSO_AUTH_TOKEN` also needed updating — if yes, that's a hint the dev environment was originally set up against the wrong DB from day one.
3. The backfill update count and the `with_id` / `without_id` split.
4. Whether `/sponsors` renders sponsor rows correctly after backfill — paste a screenshot or the first few rows' bill counts.
5. Don't touch `scripts/migrate.ts` in this handoff. The PRAGMA bug there is real but lives in handoff 26 so the fix gets its own review.

---

read docs/handoffs/25-fix-env-backfill.md and follow
