# 03 — UI port for Colorado state bill display

## Context

Handoffs 01 and 02 landed: 733 Colorado bills in Turso, all summarized, all stages classified deterministically. The dashboard UI from CBT is still in-tree but broken — it queries removed columns (`congress`, `sponsor_state`) and renders federal-style bill IDs. This handoff brings the UI from "compiles but explodes at runtime" to "renders the 733-bill database correctly."

Read CBT's `app/page.tsx`, `app/bill/[id]/page.tsx`, `lib/queries.ts`, `lib/format.ts`, and the `components/` directory before starting. Most of the structure carries over; the changes are field-level renames and Colorado-specific formatting.

## Scope

1. Small fix: tighten the LLM-vs-deterministic stage divergence metric in `lib/summarize-runner.ts`
2. `lib/queries.ts` — rewrite for new schema (jurisdiction, session, sponsor_district)
3. `lib/format.ts` — bill ID and sponsor display in CO style
4. `lib/topic-colors.ts` — add color groups for the new topic tags
5. `components/HeaderBar.tsx` — rebrand to CCBT
6. `components/BillRow.tsx` — new field bindings, updated grid columns if needed
7. `components/FooterLegend.tsx` — match the 7-stage enum
8. `app/page.tsx` — feed scoped to `jurisdiction='co' AND session=$CURRENT`
9. `app/bill/[id]/page.tsx` — detail page with abstract + actions display + external link
10. `app/watchlist/page.tsx` — verify it works with the new components
11. Smoke test against the live Turso database

Out of scope: cron route, Vercel deployment, watchlist toggle bug fixes if any (handle in handoff 04).

## 1. Stage divergence metric fix

`lib/summarize-runner.ts`: when comparing LLM stage to deterministic stage for the divergence count, **only count the divergence if the LLM-emitted stage is already in the STAGES enum**. If the LLM emitted something out-of-enum (which the validator falls back to `introduced`), classify it separately as `unparseable_llm_stage` and exclude from the divergence count.

The aggregate log line at end of summarize should report:

```
733 summarized, 0 failed
abstract coverage: X/733 (Y%)
in-enum stage divergences: A/733 (B%)
unparseable LLM stage: C/733 (D%)
```

This makes the divergence metric actually mean something — bills where Gemini and stageFromActions both produced a valid stage but disagreed.

## 2. `lib/queries.ts`

Rewrite from scratch using the new columns. Functions to provide:

```typescript
getRecentBills({
  limit?: number,
  topic?: Topic,
  stage?: Stage,
  q?: string,
}): Promise<BillRow[]>

getBillById(id: string): Promise<BillRow | null>

getWatchlistBills(): Promise<BillRow[]>
```

All queries scope to `WHERE jurisdiction = 'co' AND session = ?` using the `CO_CURRENT_SESSION` env var. Default sort: `latest_action_date DESC NULLS LAST, id DESC`.

`q` searches `title` and `summary` with `LIKE '%' || ? || '%'` (case-insensitive via `LOWER()` on both sides). Don't add FTS — overkill for 733 rows.

Drop everything that referenced `congress` or `sponsor_state`. The `STALE_FILTER_STAGES` array Code updated in handoff 01 should already be using the new pre-terminal stages — verify and adjust to the 7-stage enum if needed.

## 3. `lib/format.ts`

Two functions to update:

**`formatBillId(row)`** — display Colorado-style. Input row has `bill_type` and `bill_number`; produce `"HB 25-1234"`. Map session `2025A` → `25` for the year prefix. Format:

```
${bill_type} ${session_year_2digit}-${bill_number}
```

The internal row `id` (e.g. `co-2025a-hb-1234`) stays the URL slug; this is purely for display.

**`formatSponsor(row)`** — `"Smith (D, HD-2)"`. If `sponsor_party` is null, omit the parens entirely and show only the name. If `sponsor_district` is null but `sponsor_party` is present, show `"Smith (D)"`.

Date formatting (`Intl.DateTimeFormat`) stays as-is from CBT.

## 4. `lib/topic-colors.ts`

Add the new topic tags into the existing color groups. From the 7 group definitions in SKILL.md:

- `licensing` → financial/commerce (purple)
- `municipal_affairs` → infrastructure/ops (amber)
- `public_safety` → justice/civil (red-pink)
- `cannabis` → social/labor (pink) — it's a regulated commerce topic, but in the CO context cannabis is closer to social/health than financial
- `water` → environment/energy/agriculture (green)

Drop any references to `foreign_policy`, `defense`, `social_security`, `trade` if they're still in the file. Keep `veterans`, `immigration`, `taxes` since those still appear in the new TOPICS list.

## 5. `components/HeaderBar.tsx`

- Title: `"COLORADO CAPITOL BILL TERMINAL"` (uppercase, monospace, in keeping with the Bloomberg aesthetic)
- Subtitle/tagline: `"CO 2025A · ${bill_count} bills tracked"` — pull count from a small server query in the header server component
- Drop any "119th Congress" or similar federal references

## 6. `components/BillRow.tsx`

Field-level rebinds:
- `bill_id_display` from `formatBillId(row)` instead of the federal pattern
- Sponsor cell: `formatSponsor(row)` instead of `${name} (${party}, ${state})`
- Stage cell uses the existing `StageIndicator` (already updated in handoff 02)
- Topic cell uses `TopicTags` (already exists, just consumes the new colors)

Layout grid in SKILL.md was `24px 70px 1fr 90px 80px 110px` — verify the second column (bill ID) at 70px is still wide enough for `"HCR 25-1001"` (longest CO format, ~11 chars). If not, bump to 80px.

## 7. `components/FooterLegend.tsx`

Update the stage legend to match the 7-stage enum. CBT's federal version had:

```
introduced       ▸ INTRO
committee        ▸ COMMITTEE
floor            ▸▸ FLOOR
other_chamber    ▸▸▸ OTHER CHAMBER
president        ▸▸▸▸ PRESIDENT
enacted          ✓ ENACTED
```

Replace with:

```
introduced              ▸ INTRO
in_committee            ▸ COMMITTEE
passed_first_chamber    ▸▸ PASSED 1ST
passed_second_chamber   ▸▸▸ PASSED BOTH
signed                  ✓ SIGNED
vetoed                  ✗ VETOED
dead                    — DEAD
```

Match colors to the CSS vars already in `app/globals.css` (e.g. `--stage-enacted` becomes `--stage-signed` semantically; rename the var or just rebind).

## 8. `app/page.tsx` (feed)

Server component. Reads `getRecentBills({ limit: 100, topic, stage, q })` from URL search params. Renders the `HeaderBar`, filter controls, the `BillRow` list, and `FooterLegend`.

Inline expand pattern from CBT carries over: `?expanded=co-2025a-hb-1234` URL param, one row open at a time, expanded view shows summary + topic tags + sponsor details + "View detail" link.

If `q` param is present, render the search box pre-filled (the `SearchBox` client component handles this).

## 9. `app/bill/[id]/page.tsx` (detail)

Server component. Reads `getBillById(params.id)`. If null, return `notFound()`.

Sections in order:
1. **Header**: bill ID (large, formatted), full title, current stage badge
2. **Summary**: the LLM summary
3. **Sponsor**: name, party, district
4. **Latest action**: text + date
5. **Topics**: tag pills
6. **Action history**: full `actions[]` from `raw_json`, newest first, formatted as `[date] description (classification)`
7. **External link**: pull from `raw_json.sources[0].url` — that's the official state-leg page. If sources is empty, fall back to `https://openstates.org/co/bills/${session}/${bill_type}${bill_number}/` as a Plural Open detail link
8. **Watchlist toggle**: existing client component, just verify it accepts the new ID format
9. **Raw JSON**: collapsible `<details>` tag with `<pre>{JSON.stringify(JSON.parse(raw_json), null, 2)}</pre>`

The action history is the most useful state-bill addition. Federal bills are simpler; state bills go through 10–20 actions and the chronological view is genuinely informative.

## 10. `app/watchlist/page.tsx`

Should mostly be untouched — calls `getWatchlistBills()`, renders the same `BillRow` list. Verify it compiles and runs against the new schema.

## 11. Smoke test

Run `npm run dev`. Then:

- [ ] Home page loads, shows ~50–100 bills with new ID format
- [ ] Bill IDs render as `"HB 25-1234"`, not `"co-2025a-hb-1234"`
- [ ] Sponsor cells show `"Smith (D, HD-2)"` style
- [ ] Click any bill, inline expand works
- [ ] Click "View detail" or navigate to `/bill/co-2025a-hb-1234` — detail page loads, shows summary, sponsor, action history
- [ ] Topic filter works — try `?topic=cannabis`, `?topic=water`
- [ ] Stage filter works — try `?stage=signed`, `?stage=vetoed`
- [ ] Search works — try `?q=tax`, `?q=cannabis`
- [ ] Watchlist page loads (probably empty, that's fine)
- [ ] No console errors, no runtime errors from missing columns

## Acceptance criteria

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] All 11 smoke test items pass
- [ ] No reference to `congress`, `sponsor_state`, `enacted`, or any federal-isms in the UI source

## Things to flag back

1. If the action-history rendering on the detail page feels overwhelming for 15+ action bills, suggest a "show only major actions" filter (limit to actions with classifications in introduction/passage/executive-* — drop the procedural noise like "Refer Amended to Appropriations")
2. If any topic color in `topic-colors.ts` looks visually off in the rendered tags, flag specifically which one and we'll adjust
3. If the detail page external link from `raw_json.sources[0].url` doesn't actually point to leg.colorado.gov for some bills, tell me what it points to instead and we'll figure out a better fallback

Don't redesign anything. Don't change the Bloomberg Terminal aesthetic. Don't touch the cron route or deployment. Get the dashboard rendering against the existing 733-bill database, prove it works locally, hand back.
