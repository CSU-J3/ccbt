import "dotenv/config";
import { getDb } from "../lib/db";

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "(unset)";
  const host = url.replace(/^libsql:\/\//, "").split(".")[0] ?? "(no host)";
  console.log(`connected via host fragment: ${host}`);

  const db = getDb();

  const cols = await db.execute("PRAGMA table_info(bills)");
  console.log(`\nbills columns (${cols.rows.length}):`);
  for (const r of cols.rows) {
    console.log(`  - ${r.name as string} (${r.type as string})`);
  }

  const idx = await db.execute("PRAGMA index_list(bills)");
  console.log(`\nbills indexes (${idx.rows.length}):`);
  for (const r of idx.rows) {
    console.log(`  - ${r.name as string}`);
  }

  const cnt = await db.execute("SELECT COUNT(*) AS n FROM bills");
  console.log(`\nbills row count: ${cnt.rows[0]?.n}`);
}

main().catch((err) => {
  console.error("diag failed:", err);
  process.exit(1);
});
