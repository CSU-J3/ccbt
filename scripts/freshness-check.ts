// Freshness check: is the daily completing, or dying silently mid-batch?
// Read-only. Run: npx tsx scripts/freshness-check.ts
import "dotenv/config";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  const total = await db.execute("SELECT COUNT(*) AS n FROM bills");
  const unsummarized = await db.execute(
    "SELECT COUNT(*) AS n FROM bills WHERE summary IS NULL"
  );
  const newestSummary = await db.execute(
    "SELECT MAX(summary_updated_at) AS ts FROM bills WHERE summary_updated_at IS NOT NULL"
  );
  const lastIngest = await db.execute(
    "SELECT MAX(update_date) AS ts FROM bills"
  );
  const lastAction = await db.execute(
    "SELECT MAX(latest_action_date) AS ts FROM bills"
  );
  // age distribution of the unsummarized backlog (how stale is it?)
  const backlogAge = await db.execute(
    `SELECT MIN(update_date) AS oldest, MAX(update_date) AS newest
     FROM bills WHERE summary IS NULL`
  );

  const n = (r: any) => Number(r.rows[0].n);
  const ts = (r: any) => r.rows[0].ts ?? "(none)";
  console.log("=== CCBT freshness ===");
  console.log(`total bills:            ${n(total)}`);
  console.log(`unsummarized (summary NULL): ${n(unsummarized)}`);
  console.log(`newest summary_updated_at:   ${ts(newestSummary)}`);
  console.log(`last ingest (max update_date):     ${ts(lastIngest)}`);
  console.log(`last action (max latest_action):   ${ts(lastAction)}`);
  console.log(
    `unsummarized backlog update_date span: ${backlogAge.rows[0].oldest ?? "-"}  ->  ${backlogAge.rows[0].newest ?? "-"}`
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
