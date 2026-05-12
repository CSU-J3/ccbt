import "dotenv/config";
import { getDb } from "../lib/db";
import { pickPrimarySponsor } from "../lib/sync";

type RawBill = {
  sponsorships?: Parameters<typeof pickPrimarySponsor>[0];
};

async function main() {
  const db = getDb();
  const rs = await db.execute({
    sql: "SELECT id, raw_json FROM bills",
    args: [],
  });

  let scanned = 0;
  let updated = 0;
  let nullSponsor = 0;
  let parseFail = 0;

  for (const row of rs.rows) {
    scanned++;
    const id = row.id as string;
    const rawJson = row.raw_json as string;
    let raw: RawBill;
    try {
      raw = JSON.parse(rawJson) as RawBill;
    } catch {
      parseFail++;
      continue;
    }

    const sponsor = pickPrimarySponsor(raw.sponsorships);
    if (!sponsor?.id) {
      nullSponsor++;
      continue;
    }

    await db.execute({
      sql: "UPDATE bills SET sponsor_id = ? WHERE id = ?",
      args: [sponsor.id, id],
    });
    updated++;
  }

  console.log(
    `done: scanned=${scanned} updated=${updated} null_sponsor=${nullSponsor} parse_fail=${parseFail}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
