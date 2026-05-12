import "dotenv/config";
import { getDb } from "../lib/db";

const statements = [
  `CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    jurisdiction TEXT NOT NULL,
    session TEXT NOT NULL,
    bill_type TEXT NOT NULL,
    bill_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    introduced_date TEXT,
    latest_action_date TEXT,
    latest_action_text TEXT,
    sponsor_name TEXT,
    sponsor_party TEXT,
    sponsor_district TEXT,
    sponsor_id TEXT,
    update_date TEXT NOT NULL,
    openstates_id TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    summary TEXT,
    summary_model TEXT,
    summary_updated_at TEXT,
    topics TEXT,
    stage TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bills_update_date ON bills(update_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bills_latest_action ON bills(latest_action_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_bills_jurisdiction_session ON bills(jurisdiction, session)`,
  `CREATE INDEX IF NOT EXISTS idx_bills_sponsor_id ON bills(sponsor_id)`,
  `CREATE TABLE IF NOT EXISTS watchlist (
    bill_id TEXT PRIMARY KEY REFERENCES bills(id),
    added_at TEXT NOT NULL,
    notes TEXT
  )`,
];

async function columnExists(
  db: ReturnType<typeof getDb>,
  table: string,
  column: string,
): Promise<boolean> {
  const r = await db.execute(`PRAGMA table_info(${table})`);
  return r.rows.some((row) => row.name === column);
}

async function main() {
  const db = getDb();
  for (const sql of statements) {
    await db.execute(sql);
    console.log("ok:", sql.split("\n")[0]);
  }

  if (!(await columnExists(db, "bills", "sponsor_id"))) {
    await db.execute(`ALTER TABLE bills ADD COLUMN sponsor_id TEXT`);
    console.log("ok: ALTER TABLE bills ADD COLUMN sponsor_id");
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_bills_sponsor_id ON bills(sponsor_id)`,
    );
    console.log("ok: idx_bills_sponsor_id (post-alter)");
  }

  console.log("migration complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
