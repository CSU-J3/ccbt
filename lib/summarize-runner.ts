import { GoogleGenAI } from "@google/genai";
import { getDb } from "./db";
import { ALLOWED_STAGES_SET } from "./enums";
import {
  pickAbstract,
  summarizeBill,
  SUMMARY_MODEL,
  type BillRow,
  type SummarizeResult,
} from "./summarize";

const THROTTLE_MS = 400;
const RETRY_BACKOFFS_MS = [2000, 4000, 8000, 16000];
const DEFAULT_LIMIT = 50;

function isRetryable(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  return /\b429\b|\b503\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|rate limit|quota/i.test(
    msg,
  );
}

async function withRetry<T>(fn: () => Promise<T>, billId: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === RETRY_BACKOFFS_MS.length) {
        throw err;
      }
      const wait = RETRY_BACKOFFS_MS[attempt];
      const msg = (err as Error).message ?? "";
      console.warn(
        `retry ${billId} attempt ${attempt + 1}/${RETRY_BACKOFFS_MS.length}, wait ${wait}ms: ${msg.slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export type SummarizeStats = {
  ok: number;
  failed: number;
  abstractsPresent: number;
  abstractsFallback: number;
  /** Bills where the LLM emitted a valid in-enum stage that differed from the deterministic stage. */
  inEnumStageDivergences: number;
  /** Bills where the LLM emitted an out-of-enum stage string (e.g. "sent_to_governor"). */
  unparseableLlmStages: number;
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
    inEnumStageDivergences: 0,
    unparseableLlmStages: 0,
    promptTokens: 0,
    outputTokens: 0,
    samples: [],
  };

  for (const c of candidates) {
    if (c.bill.abstract_text) stats.abstractsPresent++;
    else stats.abstractsFallback++;
  }

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    try {
      const out = await withRetry(
        () => summarizeBill(client, c.bill),
        c.bill.id,
      );
      stats.promptTokens += out.promptTokens;
      stats.outputTokens += out.outputTokens;
      if (!out.result) {
        console.warn(`parse-fail: ${c.bill.id}`);
        stats.failed++;
      } else {
        const rawStage = out.llmStageRaw;
        if (rawStage && !ALLOWED_STAGES_SET.has(rawStage)) {
          stats.unparseableLlmStages++;
        } else if (
          rawStage &&
          c.deterministicStage &&
          rawStage !== c.deterministicStage
        ) {
          stats.inEnumStageDivergences++;
          console.warn(
            `stage-disagree ${c.bill.id}: llm="${rawStage}" deterministic="${c.deterministicStage}"`,
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
        stats.ok++;
        if (stats.samples.length < 5) {
          stats.samples.push({ bill: c.bill, result: out.result });
        }
      }
    } catch (e) {
      console.error(`error ${c.bill.id}:`, (e as Error).message);
      stats.failed++;
    }

    if (i < candidates.length - 1) {
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  const total = candidates.length || 1;
  const pct = (n: number) => ((n / total) * 100).toFixed(1);
  console.log(
    `${stats.ok} summarized, ${stats.failed} failed
abstract coverage: ${stats.abstractsPresent}/${candidates.length} (${pct(stats.abstractsPresent)}%)
in-enum stage divergences: ${stats.inEnumStageDivergences}/${candidates.length} (${pct(stats.inEnumStageDivergences)}%)
unparseable LLM stage: ${stats.unparseableLlmStages}/${candidates.length} (${pct(stats.unparseableLlmStages)}%)`,
  );
  return stats;
}
