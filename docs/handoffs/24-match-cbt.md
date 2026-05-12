# Match CCBT to today's CBT work (v2)

CCBT is the sister project to CBT (Congress Bill Tracker). Today CBT
got a long list of UI, schema, and feature changes. Bring CCBT to
parity where the changes apply at the state level. Where federal
concepts don't translate (`bioguide_id`, "DESK / President"), adapt as
described below.

Live references:
- CCBT: https://ccbt-eta.vercel.app
- CBT (target visual / UX state at end of day): https://cbt-chi-silk.vercel.app

This is a consolidated handoff covering CBT changes 25–40. Take the
sections in order — each is independently shippable.

---

## 1. Title / sponsor row layout

CBT change: title on line 1 (truncate), sponsor + party-state badge on
line 2 (badge `shrink-0` so it never clips).

**CCBT**: from the live site, CCBT already stacks title + sponsor.
Verify the badge `(D, SD-34)` / `(R, HD-39)` is `shrink-0` — if any
long-titled bills clip the district, apply the same fix.

---

## 2. Pagination

Numbered pagination, 100 bills per page, URL via `?page=N`, every
filter resets page to 1.

- Add `LIMIT / OFFSET` to the feed query, paired with a `COUNT(*)` query that shares the same WHERE builder.
- New `<Pagination />` server component. Render at top (under topics) AND bottom of the feed.
- Ellipsis rule: render `…` only when the gap between shown pages is greater than 1; if the gap is exactly 1, render the missing page number. (E.g. `1 2 3 4 5 6 7 … 8` not `1 · 3 4 5 6 7 … 8`.)
- Filters that must `params.delete("page")` on change: topic chips, stage dropdown, sort, search, watchlist filter, chamber toggle (added in §10), sponsor sort toggle (added in §11).

733 bills currently → ~8 pages.

---

## 3. Header count matches feed count

Audit: if the header bill count is over-reporting because the list
query filters `summary IS NOT NULL` but the count query doesn't, fix
the count source to share the feed's WHERE builder so the number in
the header equals what pagination can actually surface.

---

## 4. Bigger feed text

Bump each text element in the feed row one Tailwind step (`text-sm` →
`text-base` for primary, `text-xs` → `text-sm` for secondary). Bill ID
column widened to fit the larger monospace.

Verify long bill IDs (`HB 25-1327`, `SJR`-equivalents) don't clip after
the bump. Widen the bill ID column if they do.

---

## 5. Move legend out of the footer

Both the stage legend and the party color key (`■ R · ■ D · ■ I`)
move from footer to a single thin muted line above the feed's column
header row.

CCBT's stage labels are different — the legend should read:

```
▸ INTRO · ▸ COMMITTEE · ▸▸ PASSED 1ST · ▸▸▸ PASSED BOTH · ✓ SIGNED · ✗ VETOED · — DEAD
```

Each glyph colored to match the corresponding stage indicator color in
the rows below.

---

## 6. Nav icons

CBT got `👥 SPONSORS` and `✒ DESK`. CCBT only has `★ WATCHLIST`
visible. If you add `SPONSORS` (per §11), give it `👥 SPONSORS`. CCBT
has no equivalent of `DESK` — the Governor signs directly, no
sub-page needed unless you want a `/governor` view of bills awaiting
signature. Skip for v1.

If `STALE` exists on CCBT, leave its icon as-is.

---

## 7. Topic chip tooltips

Add `title` attributes on every topic chip (filter row + per-row
chips) showing the full human-readable label.

CCBT's topic set:

| Code | Label                  |
|------|------------------------|
| HLTH | Healthcare             |
| TAX  | Taxes                  |
| ENRG | Energy                 |
| ENV  | Environment            |
| EDU  | Education              |
| LAB  | Labor                  |
| TECH | Technology             |
| CIV  | Civil rights           |
| CRIM | Criminal justice       |
| AGR  | Agriculture            |
| HSG  | Housing                |
| TRNS | Transportation         |
| VET  | Veterans               |
| ELEC | Elections              |
| BDGT | Budget                 |
| FIN  | Financial services     |
| CONS | Consumer protection    |
| GOV  | Government operations  |
| SAFE | Public safety          |
| LIC  | Licensing              |
| MUNI | Municipal affairs      |
| CNBS | Cannabis               |
| WTR  | Water                  |
| IMM  | Immigration            |
| OTHR | Other                  |

---

## 8. Header metadata layout

Move `UPDATED HH:MM MT` and bill count from the right side of the
header to a single muted caption line directly under the wordmark.
Right side becomes just nav links.

```
CCBT // CO 2025A
733 BILLS · UPDATED 01:43 MT
```

Verify the timestamp source is global (unconditional `MAX(update_date)`
or sync metadata row), not derived from the filtered set — it must
not change when the user filters by topic.

---

## 9. Filter bar tidy-up + top pagination

- Stage dropdown moved to the same horizontal row as the sort dropdown.
- "STAGE" label removed (the dropdown's `ALL STAGES` placeholder is enough). "SORT" label kept.
- Pagination rendered above the feed too (right under the topics chip row), not just below.

---

## 10. Chamber toggle (House / Senate / All)

New `?chamber=house|senate` URL param, three-segment toggle in the
filter row.

Bill type prefixes for CCBT (verify against your sync data):

- `house`: `bill_type IN ('hb','hjr','hcr','hm')`
- `senate`: `bill_type IN ('sb','sjr','scr','sm')`

Toggle UI:

```
[ALL]  [HOUSE]  [SENATE]
```

Selected segment uses `--accent-amber-bright`. Resets `page` to 1 on
change. Applies to `/`, `/watchlist`, `/sponsors`, etc.

---

## 11. Sponsors page (volume + pass rate combined)

**This is a single merged page**, not the two-page split CBT initially
shipped. CBT consolidated `/sponsors` and `/sponsors/pass-rate` into
one `/sponsors` page with a sort toggle. Build it that way from the
start on CCBT.

### Phase A — sponsor identity

Add a stable sponsor ID column to the `bills` table, paralleling what
CBT did with `sponsor_bioguide_id`. State-side, the equivalent is
either OpenStates' `person_id` or a slug derived from the legislator's
name. If your sync data already includes an OpenStates identifier,
use it; otherwise generate a deterministic slug (e.g. lowercase
`first-last`, with district disambiguation if needed).

```sql
ALTER TABLE bills ADD COLUMN sponsor_id TEXT;
CREATE INDEX idx_bills_sponsor_id ON bills(sponsor_id);
```

Update sync to write this on upsert. Backfill existing rows from
`raw_json` in a one-shot `scripts/backfill-sponsor-id.ts`.

All sponsor aggregation queries now `GROUP BY sponsor_id` (with
`MAX(sponsor_name)` etc. as representative aggregates).

**Important deploy step**: when you ship, run the migration AND the
backfill against the **prod** Turso DB before hitting the new pages.
CBT shipped 38 without this and the live `/sponsors` page 500'd.
Order: `npm run migrate` then `npx tsx scripts/backfill-sponsor-id.ts`,
both with `.env` pointed at prod credentials.

### Phase B — single combined page

Route: `/sponsors`. Replaces any existing `/sponsors` and any
pass-rate-specific URL.

#### URL state

`?sort=volume` (default) or `?sort=passrate`. Same `params.delete("page")`
on change.

#### Toggle UI

Place near the chamber toggle. Same three-segment styling:

```
SORT BY  [VOLUME]  [PASS RATE]
```

#### Single query (combined volume + pass rate)

```sql
SELECT
  sponsor_id,
  MAX(sponsor_name) AS sponsor_name,
  MAX(sponsor_party) AS sponsor_party,
  MAX(sponsor_district) AS sponsor_district,
  COUNT(*) AS total,
  SUM(CASE WHEN stage = 'signed' THEN 1 ELSE 0 END) AS signed_count,
  CAST(SUM(CASE WHEN stage = 'signed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS passrate
FROM bills
WHERE [chamber filter if set]
GROUP BY sponsor_id
ORDER BY
  CASE WHEN ? = 'passrate' THEN passrate END DESC,
  CASE WHEN ? = 'passrate' THEN total END DESC,
  CASE WHEN ? = 'volume' THEN total END DESC
LIMIT 100
```

Note: CCBT's "passed" stage is `signed`, not `enacted` like CBT. Adjust
all `CASE WHEN stage = ...` accordingly.

#### Threshold

Drop any `HAVING total >= N` cutoff. Show every sponsor in the top 100
regardless of bill count. Pass rates for low-volume sponsors are
inherently noisy; the raw counts (`3✓ / 5`) tell that story.

#### Row layout

Two parallel bars per row, raw counts on the right:

```
RANK  NAME                              VOLUME              PASS RATE          COUNTS
 1    Julie Gonzales (D, SD-34)         [████████  47]      [██████   62%]    29✓ / 47
 2    Marc Catlin (R, SD-5)             [██████    32]      [████     48%]    15✓ / 32
```

- Volume bar — width = `(bill_count / max_volume) * 100%`. Party-colored.
- Pass-rate bar — width = `(passrate / 100) * 100%`. Color matches CCBT's signed-stage color.
- Show only one party-state indicator per row (CBT shipped this with a duplicate badge in v1; don't repeat that mistake).
- Make sure the longest volume bar fills ~100% of the bar track, not a fraction of it. Width math denominator must be the bar track's width, not the row's width.
- On mobile, stack the pass-rate bar below the volume bar within the same row.

Click row → expansion (see §13).

#### Page header

```
SPONSORS                                     ALL · HOUSE · SENATE  |  VOLUME · PASS RATE
TOP 100 BY {volume|pass rate} (CO 2025A)
```

Subtitle updates with the active sort.

#### Caveat note

CCBT's stages are mostly terminal (signed/vetoed/dead) so pass rates
are more meaningful than CBT's. Show this note only when
`sort=passrate`:

> *Pass rate = bills currently at `signed` stage. Excludes bills still
> in progress.*

---

## 12. (intentionally empty — merged into §11)

CBT initially had a separate pass-rate route. CCBT shouldn't bother;
build the merged page from the start.

---

## 13. Sponsor row expansion (with all bills, scrollable, readable)

Click a sponsor row → expand inline. Mirror the bill-feed expansion
pattern. URL state: `?expanded={sponsor_id}`.

### Layout

```
▾  1   Julie Gonzales (D, SD-34)         [████████ 47]   [██████ 62%]   29✓ / 47

   ┌─────────┐    TOTAL BILLS     47
   │ [photo] │    SIGNED          29  (62%)
   │  150px  │    STAGES          ▸ INTRO 4 · ▸ COMMITTEE 9 · ▸▸ PASSED 1ST 2 · ▸▸▸ PASSED BOTH 3 · ✓ SIGNED 29 · ✗ VETOED 0 · — DEAD 0
   │  200px  │    TOPICS          HLTH (8) · ENV (5) · TAX (3)
   └─────────┘
                  ALL BILLS  (scrolls)
                  ┌──────────────────────────────────────────────────────────────┐
                  │ SB 25-75   License to Sell Vehicles Criminal Offense  — DEAD │
                  │ SB 25-70   Online Marketplaces & Third-Party Sellers  ✓ SIGN │
                  │ ... (47 rows total, scrolls within the container)            │
                  └──────────────────────────────────────────────────────────────┘
                  OPEN IN FEED →
```

### Photo

Colorado has no equivalent of bioguide.congress.gov photos. Two
options:

- **v1 (recommended)**: monogram fallback only. Initials in a muted
  square the same size where the photo would go (~150–200px).
- **v2 (later)**: integrate OpenStates' image URLs (`https://data.openstates.org/images/…`)
  if you wire up OpenStates IDs as the sponsor identifier. Defer.

### State flag

CBT shows the sponsor's state flag in the expansion because each
sponsor is from a different state. On CCBT every sponsor is from
Colorado — a per-row CO flag would be redundant.

Optional: place a single Colorado flag in the page-level wordmark or
header as branding (`https://flagcdn.com/w80/us-co.png`). Not required.

Per-sponsor flag in the expansion: skip.

### Stats panel

Same metrics as the row, broken down by stage and topic:

- TOTAL BILLS
- SIGNED count + percentage
- STAGES — breakdown using `▸ / ▸▸ / ▸▸▸ / ✓ / ✗ / —` glyphs and stage colors
- TOPICS — top 3 by count, comma-separated, each clickable to `/?sponsor={sponsor_id}&topics={topic}`

#### Readability

- Stat labels: `text-sm`, muted (`var(--text-muted)`).
- Stat values: `text-base`, primary (`var(--text-primary)`).
- Vertical breathing room between rows (`gap-y-3`).
- Indent values to a clean column from labels.
- Keep monospace.

### All bills list (scrollable)

No `LIMIT`. Order by `latest_action_date DESC`. Wrap in a scrollable
container:

```tsx
<div className="max-h-80 overflow-y-auto pr-2">
  {bills.map(b => <BillRow ... />)}
</div>
```

`max-h-80` = 320px. Should fit ~8–10 rows; large lists scroll within
the container without bubbling out to the page.

Each row in this list reuses the existing CCBT bill row component
where possible — bill ID, title, stage indicator, action date.

### Footer link

Below the scrollable list:

```
OPEN IN FEED →
```

Routes to `/?sponsor={sponsor_id}` (or whatever the existing CCBT
sponsor-filter URL pattern is). Useful for applying additional filters
once in the main feed view.

### Mobile

Photo + stats stack vertically. Bills scroll container is full-width.

---

## What NOT to bring over from CBT

- The `FOR → FRGN` topic rename. Doesn't apply.
- `/president` route or "DESK" nav link. CCBT has no equivalent.
- The two-page split for sponsors. CBT shipped `/sponsors` and `/sponsors/pass-rate` separately at first then merged. Build merged from the start on CCBT.
- The mid-Congress caveat language. CCBT's signed/vetoed/dead stages mean the page is meaningful from day one; only show the lighter "excludes in-progress" note when sort is by pass rate.
- Federal-specific copy ("Congress.gov", "119th Congress", etc.) — CCBT already uses CO-specific copy; don't accidentally federalize it.
- Per-sponsor state flags in the expansion (every sponsor is CO; redundant).
- The duplicate party-state badge bug from CBT 36 — render the badge once.

## Cost note

No new LLM calls. All aggregation queries hit Turso directly. Free.

## Verify (top-level)

- Pagination renders top + bottom on `/`, both work, all filters reset to page 1 when changed.
- Header reads `CCBT // CO 2025A` with `733 BILLS · UPDATED 01:43 MT` underneath.
- Both legends (stages + party colors) sit above the feed; footer is empty or removed.
- Topic chips have hover tooltips with full labels.
- Chamber toggle filters HB/SB correctly on every feed.
- `/sponsors` shows top 100 with both volume and pass-rate bars per row; sort toggle re-orders without losing chamber/page state.
- Top-rank volume bar fills ~100% of the bar track horizontally.
- Each row shows exactly one party-state indicator.
- Clicking a sponsor expands inline with monogram photo, stats, and full scrollable bill list.
- Stats text is readably-sized, with breathing room between rows.
- "Open in feed →" link routes to the sponsor-filtered feed.
- After deploy: migration and backfill ran against prod Turso before traffic hits the new pages.
- No console errors, no type errors, no new npm dependencies.
