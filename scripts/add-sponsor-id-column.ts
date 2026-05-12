import "dotenv/config";
import { getDb } from "../lib/db";

async function columnExists(
  db: ReturnType<typeof getDb>,
  table: string,
  column: string,
): Promise<boolean> {
  const r = await db.execute(`PRAGMA table_info(${table})`);
  return r.rows.some((row) => row.name === column);
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "(unset)";
  const host = url.replace(/^libsql:\/\//, "").split(".")[0] ?? "(no host)";
  console.log(`target host fragment: ${host}`);

  const db = getDb();

  if (await columnExists(db, "bills", "sponsor_id")) {
    console.log("sponsor_id already present — skipping ALTER");
  } else {
    await db.execute("ALTER TABLE bills ADD COLUMN sponsor_id TEXT");
    console.log("ok: ALTER TABLE bills ADD COLUMN sponsor_id");
  }

  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_bills_sponsor_id ON bills(sponsor_id)",
  );
  console.log("ok: CREATE INDEX IF NOT EXISTS idx_bills_sponsor_id");

  // verify
  const cols = await db.execute("PRAGMA table_info(bills)");
  const names = cols.rows.map((r) => r.name as string);
  console.log(`\nverify: bills has ${names.length} columns`);
  console.log(
    `  sponsor_id present: ${names.includes("sponsor_id") ? "YES" : "NO"}`,
  );

  const idx = await db.execute("PRAGMA index_list(bills)");
  const idxNames = idx.rows.map((r) => r.name as string);
  console.log(
    `  idx_bills_sponsor_id present: ${idxNames.includes("idx_bills_sponsor_id") ? "YES" : "NO"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
