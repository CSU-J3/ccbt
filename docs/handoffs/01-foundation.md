# 01 — Foundation: fork CBT, swap data layer to OpenStates (Colorado-only)

## Context

This is the first handoff for **CCBT** (Colorado Capitol Bill Terminal), a sibling project to CBT (https://github.com/CSU-J3/cbt). CBT pulls federal bills from Congress.gov; CCBT pulls Colorado state bills from the Plural Open (OpenStates) v3 API. The architecture is the same: Next.js 15 App Router, TypeScript, Tailwind, Turso (libSQL), Gemini for summarization, Vercel + Cron for hosting.

Read `SKILL.md` from CBT for the full architecture context — most of it carries over verbatim. This handoff covers only the changes needed to get a working sync + database for Colorado.

If you don't have CCBT bootstrapped yet, **fork CBT into a new repo first**. Either `gh repo create` or `git clone` + push to a new origin. Keep all the existing project structure (`app/`, `components/`, `lib/`, `scripts/`). UI work happens in a later handoff; you'll see it run with empty data for now.

## Scope of this handoff

1. New schema with `jurisdiction` and `session` columns and a state-flavored stage taxonomy
2. Updated `lib/sync.ts` and `scripts/sync.ts` that hit OpenStates v3 instead of Congress.gov
3. Updated `lib/enums.ts` with state-appropriate stages and topics
4. Updated `.env.example` with new keys
5. Updated `migrate` script for new schema
6. README updated for the Colorado scope

**Out of scope** (later handoffs): summarization changes, UI/dashboard, cron route, bill detail pages, watchlist.

## OpenStates v3 API basics

- Base URL: `https://v3.openstates.org`
- Auth: `X-API-KEY: <key>` header (or `?apikey=...` query param)
- Get a free key at https://open.pluralpolicy.com (separate signup from `pluralpolicy.com` itself)
- Default tier: 500 requests/day, 10/sec. Free upgrade to "bronze" tier (5,000/day) by emailing `contact@openstates.org` once we know we need it. For Colorado-only on a daily incremental cron, default tier is plenty.
- Interactive docs: https://v3.openstates.org/docs#/

### Endpoints we use

**List bills (incremental):**
```
GET /bills?
  jurisdiction=ocd-jurisdiction/country:us/state:co/government
  &session={current_session}
  &updated_since={ISO 8601 datetime}
  &sort=updated_desc
  &include=sponsorships
  &include=abstracts
  &include=actions
  &include=sources
  &per_page=20
  &page={n}
```

The `include=` flags pull related data inline. With `sponsorships`, `abstracts`, `actions`, and `sources` included, the list response has enough data to populate the `bills` table without a second per-bill fetch. **Verify this against an actual API response before deciding** — if `actions` only includes a count, you'll need `/bills/{id}` for the action history.

**Get current session for Colorado:**
```
GET /jurisdictions/ocd-jurisdiction/country:us/state:co/government?include=legislative_sessions
```

The response includes a `legislative_sessions` array. Find the one where `start_date` is in the past and `end_date` is in the future (or null). Cache the session identifier (something like `2025A`) in an env var or a `lib/constants.ts` file rather than fetching it every sync. Document the value you find in the README so future-me can update it when sessions roll over.

### Field mapping

| OpenStates field | Our column |
|---|---|
| `id` (e.g. `ocd-bill/abc-123`) | `openstates_id` |
| `identifier` (e.g. `"HB 1234"`) | split into `bill_type` and `bill_number` |
| `title` | `title` |
| `session` | `session` |
| `jurisdiction.classification` (state name) | derived → `jurisdiction` = `"co"` |
| `from_organization.classification` | chamber (don't store separately; implicit in `bill_type`) |
| `first_action_date` | `introduced_date` |
| `latest_action_date` | `latest_action_date` |
| `latest_action_description` | `latest_action_text` |
| `sponsorships[]` where `classification == "primary"` | `sponsor_name`, `sponsor_party`, `sponsor_district` |
| `abstracts[]` | save the longest one in `raw_json`, use as input to LLM later |
| `updated_at` | `update_date` |
| full response | `raw_json` |

**Bill ID format:** `{jurisdiction}-{session_lower}-{bill_type_lower}-{number}`, e.g. `co-2025a-hb-1234`. Strip the space from `identifier` and lowercase everything.

**Sponsor party:** OpenStates returns party as a string like `"Democratic"` or `"Republican"` on the person record. Normalize to single-letter codes (`D`, `R`, `I`) for consistency with CBT's UI components.

## Schema

`scripts/migrate.ts`:

```sql
CREATE TABLE bills (
  id TEXT PRIMARY KEY,              -- "co-2025a-hb-1234"
  jurisdiction TEXT NOT NULL,       -- "co" (future-proofs for multi-state)
  session TEXT NOT NULL,            -- "2025A"
  bill_type TEXT NOT NULL,          -- "HB", "SB", "HJR", "SJR", "HCR", "SCR", "HM", "SM"
  bill_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  introduced_date TEXT,
  latest_action_date TEXT,
  latest_action_text TEXT,
  sponsor_name TEXT,
  sponsor_party TEXT,               -- "D" / "R" / "I" / NULL
  sponsor_district TEXT,            -- e.g. "HD-2" or "SD-15"
  update_date TEXT NOT NULL,
  openstates_id TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  summary TEXT,
  summary_model TEXT,
  summary_updated_at TEXT,
  topics TEXT,
  stage TEXT
);

CREATE INDEX idx_bills_update_date ON bills(update_date DESC);
CREATE INDEX idx_bills_latest_action ON bills(latest_action_date DESC);
CREATE INDEX idx_bills_jurisdiction_session ON bills(jurisdiction, session);

CREATE TABLE watchlist (
  bill_id TEXT PRIMARY KEY REFERENCES bills(id),
  added_at TEXT NOT NULL,
  notes TEXT
);
```

Migration script should be idempotent — `CREATE TABLE IF NOT EXISTS` and skip the `CREATE INDEX` if it already exists.

## Enums

`lib/enums.ts` — replace CBT's enums with these:

```typescript
export const STAGES = [
  'introduced',           // assigned bill number
  'in_committee',         // referred to committee
  'passed_first_chamber', // passed origin chamber
  'passed_second_chamber',// passed both chambers
  'signed',               // governor signed
  'vetoed',               // governor vetoed
  'enacted',              // became law (signed or veto override)
  'dead',                 // failed, postponed indefinitely, withdrawn
] as const;

export const TOPICS = [
  'healthcare',
  'taxes',
  'energy',
  'environment',
  'education',
  'labor',
  'technology',
  'civil_rights',
  'criminal_justice',
  'agriculture',
  'housing',
  'transportation',
  'veterans',
  'elections',
  'budget',
  'financial_services',
  'consumer_protection',
  'government_operations',
  'public_safety',
  'licensing',          // occupational, alcohol, cannabis, professional
  'municipal_affairs',  // local government, special districts
  'cannabis',           // Colorado-specific given how much of it there is
  'water',              // huge in Colorado
  'immigration',
  'other',
] as const;
```

Same validator pattern as CBT: out-of-enum topics get logged and dropped, falling back to `["other"]` if all invalid; out-of-enum stages fall back to `introduced`.

## Stage inference

OpenStates doesn't give you a clean stage field — you derive it from the actions list. Write a `stageFromActions(actions: Action[]): Stage` function in `lib/stage.ts`. Logic:

- Look at action `classification` arrays. OpenStates uses standard tags like `introduction`, `referral-committee`, `passage`, `executive-signature`, `executive-veto`, `failure`.
- Walk the actions newest-first; the first one that matches a stage wins.
- Order of precedence (most-advanced wins): `enacted` → `vetoed` → `signed` → `passed_second_chamber` → `passed_first_chamber` → `in_committee` → `introduced`.
- `dead` is detected by classifications like `withdrawal`, `failure`, or text matching "postponed indefinitely" / "lost" — Colorado uses "Postpone Indefinitely" liberally.

Reference: https://docs.openstates.org/data/bill/#actions for the full classification taxonomy.

## Sync logic

`lib/sync.ts` mirrors CBT's structure:

1. Read `MAX(update_date)` from `bills WHERE jurisdiction = 'co' AND session = '{current_session}'`. If empty, default to the session's start date.
2. Loop pages of `/bills?...&updated_since=...&sort=updated_desc&per_page=20`, with `include=` flags for sponsorships, abstracts, actions, sources.
3. For each bill in the response:
   - Compute our `id` from `identifier` and `session`
   - Compare `updated_at` against stored `update_date`. If unchanged, skip.
   - If changed (or new), upsert into `bills`. **If `updated_at` is newer than what's stored, clear `summary`, `topics`, `stage`** so the summarization step (next handoff) picks them up.
4. Stop paginating when a page returns bills all older than our `MAX(update_date)`.
5. Log `Fetched X, new Y, updated Z, unchanged W` per run.

Rate limit: at 10 req/sec ceiling, sleep 150ms between requests for safety. Colorado has ~700 bills per regular session; full backfill is ~35 paginated requests at `per_page=20`.

`scripts/sync.ts` is the standalone CLI entry — same shape as CBT's, just imports from the updated `lib/sync.ts`.

## Env vars

`.env.example`:

```
OPENSTATES_API_KEY=
GEMINI_API_KEY=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
CRON_SECRET=
CO_CURRENT_SESSION=2025A
```

Drop `CONGRESS_API_KEY`. The session identifier is in env so we can roll over without a code change.

## README updates

Update the README to reflect:
- Project is now CCBT, Colorado-scoped
- OpenStates API key (link to https://open.pluralpolicy.com)
- New session env var
- Sync volume estimate: ~700 bills per regular session
- Backfill cost estimate (deferred, fill in after summarization handoff)

Keep the acknowledgments section, swap "Congress.gov API" for "Plural Open / OpenStates API" with attribution.

## Acceptance criteria

- [ ] `npm install` succeeds with no new top-level dependencies (we should still be on `@libsql/client`, `@google/genai`, etc. — no new HTTP client, just `fetch`)
- [ ] `npm run migrate` creates the new schema cleanly on a fresh Turso database
- [ ] `npm run sync` runs without errors against a real OpenStates API key, populates the `bills` table
- [ ] `sqlite> SELECT COUNT(*) FROM bills WHERE jurisdiction='co';` returns a sensible number (300+ if mid-session, more if late session)
- [ ] Spot-check 3 bills:
  - IDs match the `co-2025a-hb-1234` format
  - `sponsor_party` is `D` / `R` / `I` / NULL, never `"Democratic"`
  - `stage` is one of the eight enum values
  - `raw_json` is valid JSON containing the full OpenStates response
- [ ] Re-running `npm run sync` immediately reports `unchanged` for all bills (no spurious updates)
- [ ] One bill that has been updated since the last sync gets correctly detected as updated, and its `summary` field is cleared

## Things to flag back to me

- If the list endpoint with `include=actions` doesn't return enough action data to do stage inference, you'll need a per-bill detail fetch and the rate-limit math gets tighter. Tell me what you found.
- If Colorado uses bill type abbreviations I didn't list above (`HB`, `SB`, `HJR`, `SJR`, `HCR`, `SCR`, `HM`, `SM`), add them and let me know.
- If the current session identifier from OpenStates doesn't match the `2025A` shape I assumed, use whatever they actually return and update the env var default.

Don't add new dependencies, don't touch the UI yet, don't write the summarization logic. Get sync working, prove the schema, hand back.
