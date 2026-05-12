import "dotenv/config";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  const rs = await db.execute(`
    SELECT
      SUM(CASE WHEN sponsor_id IS NOT NULL THEN 1 ELSE 0 END) AS with_id,
      SUM(CASE WHEN sponsor_id IS NULL THEN 1 ELSE 0 END) AS without_id,
      COUNT(*) AS total
    FROM bills
  `);
  const row = rs.rows[0]!;
  console.log(`with_id:    ${row.with_id}`);
  console.log(`without_id: ${row.without_id}`);
  console.log(`total:      ${row.total}`);

  const distinct = await db.execute(
    "SELECT COUNT(DISTINCT sponsor_id) AS n FROM bills WHERE sponsor_id IS NOT NULL",
  );
  console.log(`distinct sponsors: ${distinct.rows[0]?.n}`);

  const sample = await db.execute(
    "SELECT sponsor_id, sponsor_name FROM bills WHERE sponsor_id IS NOT NULL LIMIT 3",
  );
  console.log("\nsample rows:");
  for (const r of sample.rows) {
    console.log(`  ${r.sponsor_id as string}  ${r.sponsor_name as string}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
