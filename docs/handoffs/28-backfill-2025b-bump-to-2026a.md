# 28 — Backfill 2025B, advance to 2026A

## Why

CCBT's `CO_CURRENT_SESSION` env var is still `2025A`. That session ended May 7, 2025; every signed date on the current feed is on or before June 4, 2025 (the governor's signing window for 2025A). Since then, Colorado has held two sessions CCBT has never seen:

- 2025 Extraordinary Session (Aug 21–26, 2025) — about a week of work on a narrow agenda
- 2026 Regular Session — convened January 14, 2026; currently in session and adding bills daily

The daily cron has been faithfully checking 2025A for updates and finding none ever since, which is exactly the signal SKILL.md tells you to watch for. Goal of this handoff: pull the missing 2025B, advance the active session to 2026A, leave the 733 existing 2025A rows in place for history.

## Step 1 — Verify session identifiers

Don't trust my guesses about session strings. Hit OpenStates and read what they actually call them. Two-line node script or curl:

```powershell
curl -s -H "X-API-KEY: $env:OPENSTATES_API_KEY" `
  "https://v3.openstates.org/jurisdictions/ocd-jurisdiction/country:us/state:co/government?include=legislative_sessions" `
  | ConvertFrom-Json `
  | Select-Object -ExpandProperty legislative_sessions `
  | Where-Object { $_.start_date -ge "2025-08-01" } `
  | Select-Object identifier, name, start_date, end_date `
  | Format-Table
```

Confirm three things from the output:

1. The 2025 extraordinary session's `identifier` (almost certainly `2025B`, but verify).
2. The 2026 regular session's `identifier` (almost certainly `2026A`).
3. Both have a non-null `start_date` and the 2026A session's `end_date` is null or in the future.

If either identifier differs from my guesses, use the actual string in the rest of this handoff. Paste the verified identifiers back before continuing.

## Step 2 — Backfill 2025B locally

This is a one-shot. Done from your local shell against prod Turso, so the standalone scripts handle it (no cron 60s ceiling).

```powershell
# Snapshot current .env value so you can restore it
$originalSession = (Get-Content .env | Select-String "^CO_CURRENT_SESSION=").Line

# Point local .env at 2025B
(Get-Content .env) -replace "^CO_CURRENT_SESSION=.*", "CO_CURRENT_SESSION=2025B" | Set-Content .env

# Sync
npm run sync

# Summarize
npm run summarize

# Verify rows landed
turso db shell ccbt "SELECT COUNT(*) AS n, MIN(introduced_date), MAX(latest_action_date) FROM bills WHERE jurisdiction='co' AND session='2025B'"
```

Expected: a small count (anywhere from 5 to about 40 bills depending on what the extraordinary session covered). If it's zero, something went wrong: either the identifier is wrong, OpenStates doesn't have that session, or sync errored silently. Don't proceed until 2025B rows are visible.

The 503 retry wrapper from handoff 26 should handle Gemini's transient unavailability. Summarize for ~40 bills serial at 400ms throttle is roughly 30 seconds, plus retries.

## Step 3 — Advance to 2026A

Once 2025B is in and verified:

```powershell
# Point local .env at 2026A
(Get-Content .env) -replace "^CO_CURRENT_SESSION=.*", "CO_CURRENT_SESSION=2026A" | Set-Content .env

# Sync the current session locally first (don't make Vercel cron do the cold-start lift)
npm run sync
npm run summarize

# Verify
turso db shell ccbt "SELECT session, COUNT(*) FROM bills WHERE jurisdiction='co' GROUP BY session ORDER BY session"
```

Expected: three sessions present. 2025A around 733, 2025B small, 2026A in the hundreds (HB26 numbering on leg.colorado.gov is already past 1400 as of mid-May 2026, though only a fraction will be introduced and most are not yet signed).

This is where the cost shows up. A full 2026A sync against ~400 bills via Gemini Flash is roughly $0.30. Add ~$0.02 for 2025B. Total under $0.50.

Then bump Vercel:

1. Vercel dashboard → Project Settings → Environments → Production → Environment Variables.
2. Click the `⋯` next to `CO_CURRENT_SESSION`, edit, change value to `2026A`. Apply to Production, Preview, Development.
3. Save. Don't manually redeploy yet — see Step 4.

## Step 4 — Decide feed-filter behavior

Before redeploying, an open question. The current `getFeedBills` / `buildFeedWhere` in `lib/queries.ts` may or may not filter on `session`. If it doesn't, bumping the env var will mix all three sessions in the feed by date, which contradicts the "CO 2026A" header label.

Grep first:

```powershell
Select-String -Path lib\queries.ts -Pattern "session"
```

Three outcomes:

1. **Already filters on session via env var.** No change needed. Redeploy and the feed shows only 2026A.
2. **Doesn't filter on session at all.** Add a `session = $1` clause to `buildFeedWhere`, bound to `process.env.CO_CURRENT_SESSION`. Test locally that the feed shows only 2026A bills, then redeploy.
3. **Filters on session but with a hardcoded string.** Replace the hardcoded value with `process.env.CO_CURRENT_SESSION`. Test, redeploy.

The intent: feed defaults to the active session matching the header label. Multi-session browsing (a session picker, `?session=2025A` URL param) is out of scope here. Worth doing eventually, not today. The historical 2025A and 2025B rows stay in the DB and become reachable once you build that UI; they're not lost, just not in the default view.

## Step 5 — Redeploy and verify

After the env var change and any session-filter fix is pushed:

```powershell
# If you made code changes, push to main and let auto-deploy fire
git add lib/queries.ts
git commit -m "28: filter feed by CO_CURRENT_SESSION"
git push

# If env-only change, trigger redeploy from the Vercel dashboard (Deployments → latest → ⋯ → Redeploy, fresh build)
```

Acceptance:

```powershell
curl -s https://ccbt-eta.vercel.app/ | Select-String "CO 2026A"
curl -s https://ccbt-eta.vercel.app/ | Select-String "bills · updated"
curl -s -o $null -w "%{http_code}`n" "https://ccbt-eta.vercel.app/?chamber=house"
curl -s -o $null -w "%{http_code}`n" "https://ccbt-eta.vercel.app/?chamber=senate"
```

The header should now read `CCBT // CO 2026A`, the count should reflect 2026A's bill total (not 733), and the chamber pages should sum to that count. Topic counts should look reasonable (no 0%, no 100%).

## Don't

- Don't bump Vercel before local sync confirms 2026A is real and pulls non-zero rows. If you change Vercel first and the cron fires before you've synced locally, you get a working deployment with an empty feed (the cron will catch up eventually, but the in-between state looks broken).
- Don't run the cron and a local sync against the same session at the same time. The watermark logic is incremental, not concurrent. Pause cron or just do this outside the 09:00 UTC window.
- Don't summarize from inside a Vercel function. The standalone `npm run summarize` is unbounded; the cron summarize is sliced to 50/tick precisely because the function ceiling is 60s.
- Don't delete 2025A rows. The schema's keyed on jurisdiction + session, queries can filter, and history is cheap. Drop only if Turso storage becomes a real cost concern, which it won't at this scale.
- Don't widen the regex or any input validators. Session strings are short text and existing parsing handles them.

## Cost

- 2025B summarize: ~$0.02 (small session)
- 2026A summarize: ~$0.30 (depends on current count)
- Future daily syncs against 2026A: sub-cent per day
- Total one-shot: under $0.50
