import { GoogleGenAI } from "@google/genai";
import {
  ALLOWED_STAGES,
  ALLOWED_STAGES_SET,
  ALLOWED_TOPICS,
  ALLOWED_TOPICS_SET,
} from "./enums";

export { ALLOWED_STAGES, ALLOWED_TOPICS };

export const SUMMARY_MODEL = "gemini-2.5-flash";

export const ABSTRACT_LIMIT = 6000;
export const ABSTRACT_FALLBACK =
  "(none yet — only the title and latest action are available)";

const SYSTEM_PROMPT = `You are summarizing a Colorado state bill for a personal tracking dashboard. Write a 2-3 sentence summary in plain English that explains what the bill would actually change if enacted. Avoid legalese, avoid the bill's marketing title, avoid editorial language. State who is affected and how.

Then output a JSON block with:
- topics: array of 1-3 topic tags from this list: [${ALLOWED_TOPICS.join(", ")}]
- stage: one of [${ALLOWED_STAGES.join(", ")}]

Respond in this exact format:

SUMMARY:
<2-3 sentences>

JSON:
{"topics": [...], "stage": "..."}`;

export type BillRow = {
  id: string;
  identifier: string;
  title: string;
  latest_action_text: string | null;
  abstract_text: string | null;
};

export type SummarizeResult = {
  summary: string;
  topics: string[];
  stage: string;
};

export type SummarizeOutput = {
  result: SummarizeResult | null;
  promptTokens: number;
  outputTokens: number;
};

type RawAbstract = {
  abstract?: string | null;
  note?: string | null;
};

export function pickAbstract(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const list = (raw as { abstracts?: RawAbstract[] }).abstracts ?? [];
  if (list.length === 0) return null;

  const noted = list.filter((a) => a.note === "summary" && a.abstract);
  const pool = noted.length > 0 ? noted : list;

  let best: string | null = null;
  for (const a of pool) {
    const text = a.abstract ?? "";
    if (text && (best === null || text.length > best.length)) best = text;
  }
  if (!best) return null;
  return best.length > ABSTRACT_LIMIT ? best.slice(0, ABSTRACT_LIMIT) : best;
}

function parseResponse(text: string): SummarizeResult | null {
  const idx = text.indexOf("JSON:");
  if (idx < 0) return null;

  const summaryPart = text.slice(0, idx);
  const summaryMatch = summaryPart.match(/SUMMARY:\s*([\s\S]*)/i);
  const summary = (summaryMatch?.[1] ?? "").trim();
  if (!summary) return null;

  const jsonPart = text.slice(idx + "JSON:".length);
  const jsonMatch = jsonPart.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as { topics?: unknown; stage?: unknown };
  const topics = Array.isArray(obj.topics)
    ? obj.topics.filter((t): t is string => typeof t === "string")
    : null;
  const stage = typeof obj.stage === "string" ? obj.stage : null;
  if (!topics || topics.length === 0 || !stage) return null;

  return { summary, topics, stage };
}

export function validateResult(
  parsed: SummarizeResult,
  billId: string,
): SummarizeResult {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of parsed.topics) {
    if (ALLOWED_TOPICS_SET.has(t)) valid.push(t);
    else invalid.push(t);
  }
  if (invalid.length > 0) {
    console.warn(`invalid-topic ${billId}: dropped ${invalid.join(",")}`);
  }
  const topics = valid.length > 0 ? valid : ["other"];

  let stage = parsed.stage;
  if (!ALLOWED_STAGES_SET.has(stage)) {
    console.warn(`invalid-stage ${billId}: dropped "${stage}"`);
    stage = "introduced";
  }

  return { summary: parsed.summary, topics, stage };
}

function isOverloadError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  return /\b503\b|UNAVAILABLE|overloaded|high demand/i.test(msg);
}

async function generateWithRetry(
  client: GoogleGenAI,
  userPrompt: string,
  attempt = 0,
): ReturnType<GoogleGenAI["models"]["generateContent"]> {
  try {
    return await client.models.generateContent({
      model: SUMMARY_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (err) {
    if (attempt < 3 && isOverloadError(err)) {
      const wait = 5000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
      return generateWithRetry(client, userPrompt, attempt + 1);
    }
    throw err;
  }
}

export async function summarizeBill(
  client: GoogleGenAI,
  bill: BillRow,
): Promise<SummarizeOutput> {
  const userPrompt = `Bill identifier: ${bill.identifier}
Bill title: ${bill.title}
Latest action: ${bill.latest_action_text ?? "(none)"}
Official abstract (if any): ${bill.abstract_text ?? ABSTRACT_FALLBACK}`;

  const response = await generateWithRetry(client, userPrompt);

  const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

  const text = response.text;
  if (!text) return { result: null, promptTokens, outputTokens };
  const parsed = parseResponse(text);
  if (!parsed) return { result: null, promptTokens, outputTokens };

  return {
    result: validateResult(parsed, bill.id),
    promptTokens,
    outputTokens,
  };
}
