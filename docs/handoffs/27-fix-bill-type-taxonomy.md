# 27 — Fix bill-type taxonomy: include HM and SM

## Why

The "Active CO bill types" list in the project instructions is missing HM and SM, and the note "No HM/SM (CO does joint memorials only)" is incorrect. The official Colorado General Assembly Glossary of Legislative Terms (`https://content.leg.colorado.gov/sites/default/files/15glossary_of_legislative_terms_0311_1.pdf`) defines both:

- HM: Abbreviation for a memorial introduced in the House.
- SM: Abbreviation for a memorial introduced in the Senate.

Real CO measures of these types exist. Examples: `SM24-002 "Memorial E Marty Hatcher"` and `SM26-001 "High-Stakes Standardized Testing"`, both live on leg.colorado.gov. If OpenStates ever returns an HM or SM for the current session and the chamber toggle from handoff 24 uses a hardcoded list, those rows are silently dropped from chamber-filtered views.

The complete official set per CO glossary, lowercase for the `bill_type` column:

- House: `hb`, `hcr`, `hjr`, `hjm`, `hm`, `hr`
- Senate: `sb`, `scr`, `sjr`, `sjm`, `sm`, `sr`

Twelve types total. Handoff 24's chamber toggle had eight (four per chamber, per the diagnosis in chat: house=`'hb','hjr','hcr','hm'`, senate=`'sb','sjr','scr','sm'`). Four types are missing per chamber pair and the two that ARE listed (`hm`, `sm`) match the official taxonomy, not the project-instructions claim that they don't exist. So both the project instructions and the queries.ts code are wrong, in opposite directions.

## Audit before fixing

Don't assume the prod DB matches the official taxonomy. Run this in the Turso SQL Console (or `turso db shell ccbt`):

```sql
SELECT bill_type, COUNT(*) AS n
FROM bills
WHERE jurisdiction = 'co'
GROUP BY bill_type
ORDER BY n DESC;
```

Three possibilities:

1. All 12 types present. Sync is fine. The bug is only in the chamber filter. Proceed.
2. Only some types present. Figure out whether the missing ones simply weren't introduced this session (plausible: the 2025A had only 5 concurrent resolutions per the OLLS Digest, so the long tail is thin) or whether `lib/sync.ts` is filtering them. Check the type-handling around the regex parser.
3. HM or SM rows exist but the audit shows zero feed visibility. Confirms the chamber-filter bug. Note row counts; spot-check after the fix.

Paste the audit output back before changing code. Ground truth first.

## Fix

### Step 1 — chamber filter

Per handoff 24 notes, the chamber filter lives in `lib/queries.ts` (`buildFeedWhere` and `sanitizeChamber`). It may also be duplicated in `app/watchlist/page.tsx` and `app/sponsors/page.tsx` if those pages run their own clause rather than routing through `buildFeedWhere`.

Grep for hardcoded type lists:

```powershell
Select-String -Path lib\queries.ts,app\watchlist\page.tsx,app\sponsors\page.tsx,components\*.tsx -Pattern "'hb'|'sb'|HOUSE_BILL_TYPES|SENATE_BILL_TYPES"
```

For each match, replace with the complete sets. Better: factor the lists out to `lib/enums.ts` so the lists live in one place. Suggested addition to `lib/enums.ts`:

```ts
export const HOUSE_BILL_TYPES = ['hb', 'hcr', 'hjr', 'hjm', 'hm', 'hr'] as const;
export const SENATE_BILL_TYPES = ['sb', 'scr', 'sjr', 'sjm', 'sm', 'sr'] as const;
export const ALL_BILL_TYPES = [...HOUSE_BILL_TYPES, ...SENATE_BILL_TYPES] as const;
```

Then `buildFeedWhere`, the sponsors page, and the watchlist page all import the constant rather than rewriting the list inline. Future questions about what counts as a senate measure then have a single source of truth.

### Step 2 — Update SKILL.md and project instructions

Two edits.

In the project-instructions block (under "Things to watch for"), replace the bill-types line with:

> Active CO bill types: HB, SB, HCR, SCR, HJR, SJR, HJM, SJM, HM, SM, HR, SR. House: hb, hcr, hjr, hjm, hm, hr. Senate: sb, scr, sjr, sjm, sm, sr. Bills + concurrent resolutions are statutory; the rest (joint resolutions, joint memorials, memorials, simple resolutions) are non-statutory and don't appear in the OLLS Digest's count.

In `SKILL.md`, update the schema-comment in the `bills` table block:

```sql
bill_type TEXT NOT NULL,          -- "HB", "SB", "HCR", "SCR", "HJR", "SJR", "HJM", "SJM", "HM", "SM", "HR", "SR"
```

Drop the "No HM/SM (CO does joint memorials only)" assertion entirely. Don't leave it as a struck-through note; that invites someone to reintroduce the bug.

### Step 3 — anywhere else

If grep turns up hardcoded lists elsewhere (TopicFilter, BillRow, `formatBillId`, sanitizers), reconcile each to the new constants. `formatBillId` should already accept any string and not need changes, but verify by visiting `/bill/co-2025a-sm-XXXX` (substituting a real SM ID from the audit, if one exists) and confirming the page renders.

## Acceptance

Local dev:

1. `npm run typecheck` green.
2. `/` count in header equals `/?chamber=house` count + `/?chamber=senate` count, allowing for the handful (if any) of rows with malformed identifiers that don't classify to either chamber.
3. If the audit showed HM rows: one appears under `/?chamber=house` when sorted by `LATEST ACTION`. Same for SM under senate.
4. `/sponsors?chamber=house` and `/sponsors?chamber=senate` honor the new lists. Sum equals `/sponsors` total.
5. `/watchlist?chamber=house` and `/watchlist?chamber=senate` likewise.

Then push to main; Vercel auto-deploys.

## Don't

- Don't re-run sync or summarize. `bill_type` is set by sync from the OpenStates identifier; existing rows already have the right value. This handoff only changes WHERE clauses and docs.
- Don't change the parser regex in `lib/sync.ts` unless the audit shows a parsing problem. The current regex `^([A-Z]+)\s+\d{2}-(\d+)$` captures any letter prefix, so HM/SM/HJM/SJM all parse correctly.
- Don't widen any input validator's allowed-types set without also widening the chamber lists. They have to stay aligned.
- Don't try to map this to CBT's federal taxonomy. Federal has no memorial concept, and the H.RES./S.RES./H.CON.RES./S.CON.RES./H.J.RES./S.J.RES. set doesn't translate.

## Cost

$0. No LLM calls, no API hits, no schema migration. SQL audit + code edits + doc edits.
