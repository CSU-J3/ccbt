import { GoogleGenAI } from "@google/genai";
import { getDb } from "./db";
import {
  pickAbstract,
  summarizeBill,
  SUMMARY_MODEL,
  type BillRow,
  type SummarizeResult,
} from "./summarize";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const DEFAULT_LIMIT = 50;

export type SummarizeStats = {
  ok: number;
  failed: number;
  abstractsPresent: number;
  abstractsFallback: number;
  stageDisagreements: number;
  promptTokens: number;
  outputTokens: number;
  samples: Array<{ bill: BillRow; result: SummarizeResult }>;
};

export type SummarizeOptions = {
  /**
   * Maximum number of bills to process. Defaults to 50 (matches the cron tick).
   * Pass 0 to disable the limit (used by the standalone script for manual drains).
   */
  limit?: number;
  types?: string[];
};

type Candidate = {
  bill: BillRow;
  deterministicStage: string | null;
};

export async function runSummarize(
  options: SummarizeOptions = {},
): Promise<SummarizeStats> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not set");

  const db = getDb();
  const client = new GoogleGenAI({ apiKey: geminiKey });

  const limit = options.limit ?? DEFAULT_LIMIT;

  const where: string[] = ["summary IS NULL"];
  const args: (string | number)[] = [];
  if (options.types && options.types.length > 0) {
    where.push(`bill_type IN (${options.types.map(() => "?").join(",")})`);
    args.push(...options.types.map((t) => t.toUpperCase()));
  }
  let sql = `SELECT id, bill_type, bill_number, title, latest_action_text, stage, raw_json
    FROM bills WHERE ${where.join(" AND ")} ORDER BY update_date DESC`;
  if (limit > 0) {
    sql += ` LIMIT ?`;
    args.push(limit);
  }
  const rs = await db.execute({ sql, args });

  const candidates: Candidate[] = rs.rows.map((r) => {
    const rawStr = r.raw_json as string;
    let raw: unknown = null;
    try {
      raw = JSON.parse(rawStr);
    } catch {
      raw = null;
    }
    const identifier =
      raw && typeof raw === "object" && "identifier" in raw
        ? String((raw as { identifier?: unknown }).identifier ?? "")
        : "";
    const abstract_text = pickAbstract(raw);
    return {
      bill: {
        id: r.id as string,
        identifier,
        title: r.title as string,
        latest_action_text: (r.latest_action_text as string | null) ?? null,
        abstract_text,
      },
      deterministicStage: (r.stage as string | null) ?? null,
    };
  });

  console.log(
    `processing ${candidates.length} bill(s) ${limit > 0 ? `(limit ${limit})` : "(all)"}`,
  );

  const stats: SummarizeStats = {
    ok: 0,
    failed: 0,
    abstractsPresent: 0,
    abstractsFallback: 0,
    stageDisagreements: 0,
    promptTokens: 0,
    outputTokens: 0,
    samples: [],
  };

  for (const c of candidates) {
    if (c.bill.abstract_text) stats.abstractsPresent++;
    else stats.abstractsFallback++;
  }

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (c) => {
        try {
          const out = await summarizeBill(client, c.bill);
          stats.promptTokens += out.promptTokens;
          stats.outputTokens += out.outputTokens;
          if (!out.result) {
            console.warn(`parse-fail: ${c.bill.id}`);
            return { c, result: null };
          }
          if (
            c.deterministicStage &&
            out.result.stage !== c.deterministicStage
          ) {
            stats.stageDisagreements++;
            console.warn(
              `stage-disagree ${c.bill.id}: llm="${out.result.stage}" deterministic="${c.deterministicStage}"`,
            );
          }
          await db.execute({
            sql: `UPDATE bills
                  SET summary = ?, summary_model = ?, summary_updated_at = ?, topics = ?
                  WHERE id = ?`,
            args: [
              out.result.summary,
              SUMMARY_MODEL,
              new Date().toISOString(),
              JSON.stringify(out.result.topics),
              c.bill.id,
            ],
          });
          console.log(
            `summarized ${c.bill.id}: [${out.result.topics.join(",")}] / ${out.result.stage}`,
          );
          return { c, result: out.result };
        } catch (e) {
          console.error(`error ${c.bill.id}:`, (e as Error).message);
          return { c, result: null };
        }
      }),
    );

    for (const r of results) {
      if (r.result) {
        stats.ok++;
        if (stats.samples.length < 5) {
          stats.samples.push({ bill: r.c.bill, result: r.result });
        }
      } else {
        stats.failed++;
      }
    }

    if (i + BATCH_SIZE < candidates.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(
    `summarized=${stats.ok} failed=${stats.failed} abstract_present=${stats.abstractsPresent} abstract_fallback=${stats.abstractsFallback} stage_disagree=${stats.stageDisagreements}`,
  );
  return stats;
}
