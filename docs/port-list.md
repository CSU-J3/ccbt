# CCBT port list — fixes proven in CBT (Congress Bill Terminal), pending here

CCBT and CBT share a stack (Next.js + Turso + LLM summarize + Vercel cron) and
keep hitting the same failure classes. CBT has already diagnosed and fixed
several; this file tracks the ports CCBT still owes, with the donor handoff(s)
named so the future build can lift the rehearsed pattern instead of re-deriving.

Donor handoffs live in the CBT repo under `docs/handoffs/`.

---

## Freshness snapshot (2026-06-12, measured) — scopes the items below

```
total bills:                 1482
unsummarized (summary NULL):  202   (13.6%)
oldest unsummarized update:   2026-05-19   <- 3+ weeks stale
newest summary_updated_at:    2026-06-12T19:34Z  (from a MANUAL trigger, not the daily)
last ingest (max update_date):2026-06-12T18:16Z  (ingestion current)
last action (latest_action):  2026-06-04         (CO session wound down)
```

**Read:** ingestion (`runSync`/OpenStates) is current; the backlog is entirely
on the **summarize** side. 202 bills going back to May 19 never got summaries.
This is a **standing backlog**, not a cold one-off — i.e. the daily `/api/sync`
has been **dying silently mid-summarize-batch** for weeks, with no `cron_runs`
table to surface it. The 2026-06-12 manual trigger that returned 504 mid-
summarize (HO 238 port validation) is the same mechanism caught in the act.

Query that produced these numbers: `scripts/freshness-check.ts` (read-only).

---

## a. Port `cron_runs` + `wrapCronRoute` — kill the silent-504 class

**Priority: do this first.** CCBT has **no** durable cron logging, so every
mid-batch death is invisible. Without it we can't even confirm whether item (b)
worked.

- **Donor:** CBT **HO 105** (`cron_runs` table + `lib/cron-log.ts` with
  `startCronRun(route)` / `finishCronRun(id, status, payload, errorMessage?)`,
  wired into every cron route). Vercel Hobby caps live logs at 30 min, so a
  Turso-backed run log is the only durable record.
- **Scope here:** add `cron_runs` to `scripts/migrate.ts`; add the log helper;
  wrap CCBT's single cron route `/api/sync`. Status vocabulary must include
  `running` (start) → `success`/`error`, so an orphaned `running` row with no
  finish timestamp reads as the implicit-timeout (the 504 we can't otherwise
  see).
- **Exit:** a query like CBT's cron-health diagnostic shows per-run status +
  elapsed_ms for `/api/sync`; a mid-batch 504 leaves a detectable orphan.

## b. Port the 60s-fit arc — bounded runSync + summarize time-budget/split

**Triggered by the freshness numbers above (standing backlog confirmed).**
The summarize stage can't clear its batch inside the 60s function ceiling, so
the daily 504s before finishing and the backlog accrues.

- **Donors (CBT's exact mirror of this bug):**
  - **HO 115** — `/api/sync` summarize step hung inside 60s `maxDuration`; fix
    split summarize off the critical path and gave it a **time budget** +
    per-LLM `AbortController` + failure tracking. This is the closest donor —
    CBT's symptom was identical ("summaries stale 4+ days, daily silently
    failing since a date").
  - **HO 116** — `runSync` itself still overshot 60s; fix added a **deadline /
    time budget** and batched the per-changed-bill detail fetch (the serial
    fetch was the structural bottleneck). Less urgent for CCBT since ingestion
    is currently keeping up, but the bound is cheap insurance.
  - **HO 120** — the same `deadlineMs` + `AbortController` + timing-
    instrumentation pattern applied to another route; useful as the clean,
    well-rehearsed template.
- **Scope here:** give CCBT's summarize loop a wall-clock budget so it exits
  cleanly under 60s and resumes next tick (cursor/most-stale-first ordering so
  the May-19 backlog drains), rather than running to the ceiling and dying.
  Depends on (a) being in place to measure the before/after.
- **Exit:** `unsummarized` count trends to ~0 and stays bounded; `/api/sync`
  cron_runs rows show `success` with elapsed_ms comfortably under 60000.

---

## c. (already shipped, for context) HO 238 — bounded Turso + pdx1

Done 2026-06-12 (commit on `main`). Bounded every Turso request
(`AbortSignal.timeout` 10s + retry-once) and pinned functions to pdx1 to
co-locate with the aws-us-west-2 DB. Not a pending item — listed so the port
lineage is complete. Donor: CBT HO 238.
