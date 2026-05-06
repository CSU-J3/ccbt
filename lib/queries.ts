import { getDb } from "./db";
import { ALLOWED_STAGES_SET, ALLOWED_TOPICS_SET } from "./enums";

const JURISDICTION = "co";

function getCurrentSession(): string {
  const s = process.env.CO_CURRENT_SESSION;
  if (!s) throw new Error("CO_CURRENT_SESSION is not set");
  return s;
}

export type FeedBill = {
  id: string;
  jurisdiction: string;
  session: string;
  bill_type: string;
  bill_number: number;
  title: string;
  sponsor_name: string | null;
  sponsor_party: string | null;
  sponsor_district: string | null;
  introduced_date: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  update_date: string;
  summary: string | null;
  topics: string | null;
  stage: string | null;
};

export type BillDetail = FeedBill & {
  raw_json: string;
  summary_model: string | null;
  summary_updated_at: string | null;
};

export const SORT_KEYS = ["action", "introduced"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
const SORT_KEYS_SET = new Set<string>(SORT_KEYS);

export type FeedFilters = {
  topics?: string[];
  stage?: string;
  q?: string;
  sort?: SortKey;
};

const FEED_COLUMNS = `id, jurisdiction, session, bill_type, bill_number, title,
  sponsor_name, sponsor_party, sponsor_district,
  introduced_date, latest_action_date, latest_action_text,
  update_date, summary, topics, stage`;

function buildFeedWhere(filters: FeedFilters): {
  clauses: string[];
  args: (string | number)[];
} {
  const clauses: string[] = [
    "jurisdiction = ?",
    "session = ?",
  ];
  const args: (string | number)[] = [JURISDICTION, getCurrentSession()];

  if (filters.stage) {
    clauses.push("stage = ?");
    args.push(filters.stage);
  }

  if (filters.topics && filters.topics.length > 0) {
    const topicClauses = filters.topics.map(() => "topics LIKE ?");
    clauses.push(`(${topicClauses.join(" OR ")})`);
    for (const t of filters.topics) {
      args.push(`%"${t}"%`);
    }
  }

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    clauses.push(
      `(LOWER(title) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(sponsor_name) LIKE ?)`,
    );
    args.push(like, like, like);
  }

  return { clauses, args };
}

export function sanitizeTopics(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ALLOWED_TOPICS_SET.has(t));
}

export function sanitizeStage(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return ALLOWED_STAGES_SET.has(input) ? input : undefined;
}

export function sanitizeSort(raw: string | null | undefined): SortKey {
  if (raw && SORT_KEYS_SET.has(raw)) return raw as SortKey;
  return "action";
}

export type FeedStats = {
  total: number;
  lastUpdated: string | null;
};

export async function getFeedStats(): Promise<FeedStats> {
  const db = getDb();
  const r = await db.execute({
    sql: "SELECT COUNT(*) AS total, MAX(update_date) AS last FROM bills WHERE jurisdiction = ? AND session = ?",
    args: [JURISDICTION, getCurrentSession()],
  });
  const row = r.rows[0];
  return {
    total: Number(row?.total ?? 0),
    lastUpdated: (row?.last as string | null) ?? null,
  };
}

export type FeedCount = {
  total: number;
  filtered: number;
};

export async function getFeedCount(filters: FeedFilters): Promise<FeedCount> {
  const db = getDb();
  const { clauses, args } = buildFeedWhere(filters);
  const totalRs = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM bills WHERE jurisdiction = ? AND session = ?",
    args: [JURISDICTION, getCurrentSession()],
  });
  const filteredRs = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM bills WHERE ${clauses.join(" AND ")}`,
    args,
  });
  return {
    total: Number(totalRs.rows[0]?.n ?? 0),
    filtered: Number(filteredRs.rows[0]?.n ?? 0),
  };
}

function rowToFeedBill(r: Record<string, unknown>): FeedBill {
  return {
    id: r.id as string,
    jurisdiction: r.jurisdiction as string,
    session: r.session as string,
    bill_type: r.bill_type as string,
    bill_number: r.bill_number as number,
    title: r.title as string,
    sponsor_name: (r.sponsor_name as string | null) ?? null,
    sponsor_party: (r.sponsor_party as string | null) ?? null,
    sponsor_district: (r.sponsor_district as string | null) ?? null,
    introduced_date: (r.introduced_date as string | null) ?? null,
    latest_action_date: (r.latest_action_date as string | null) ?? null,
    latest_action_text: (r.latest_action_text as string | null) ?? null,
    update_date: r.update_date as string,
    summary: (r.summary as string | null) ?? null,
    topics: (r.topics as string | null) ?? null,
    stage: (r.stage as string | null) ?? null,
  };
}

export async function getFeedBills(
  filters: FeedFilters,
  limit = 100,
): Promise<FeedBill[]> {
  const db = getDb();
  const { clauses, args } = buildFeedWhere(filters);
  args.push(limit);

  const sortColumn =
    filters.sort === "introduced" ? "introduced_date" : "latest_action_date";

  const sql = `SELECT ${FEED_COLUMNS}
    FROM bills
    WHERE ${clauses.join(" AND ")}
    ORDER BY ${sortColumn} DESC NULLS LAST, id DESC
    LIMIT ?`;

  const rs = await db.execute({ sql, args });
  return rs.rows.map(rowToFeedBill);
}

export async function getBillById(id: string): Promise<BillDetail | null> {
  const db = getDb();
  const rs = await db.execute({
    sql: `SELECT ${FEED_COLUMNS}, raw_json, summary_model, summary_updated_at
      FROM bills WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const r = rs.rows[0];
  if (!r) return null;
  return {
    ...rowToFeedBill(r),
    raw_json: r.raw_json as string,
    summary_model: (r.summary_model as string | null) ?? null,
    summary_updated_at: (r.summary_updated_at as string | null) ?? null,
  };
}

export async function getWatchlistBills(
  sort: SortKey = "action",
): Promise<FeedBill[]> {
  const db = getDb();
  const sortColumn =
    sort === "introduced" ? "b.introduced_date" : "b.latest_action_date";
  const sql = `SELECT b.id, b.jurisdiction, b.session, b.bill_type, b.bill_number, b.title,
      b.sponsor_name, b.sponsor_party, b.sponsor_district,
      b.introduced_date, b.latest_action_date, b.latest_action_text,
      b.update_date, b.summary, b.topics, b.stage
    FROM bills b
    INNER JOIN watchlist w ON w.bill_id = b.id
    WHERE b.jurisdiction = ? AND b.session = ?
    ORDER BY ${sortColumn} DESC NULLS LAST, b.id DESC`;
  const rs = await db.execute({
    sql,
    args: [JURISDICTION, getCurrentSession()],
  });
  return rs.rows.map(rowToFeedBill);
}

export async function isInWatchlist(billId: string): Promise<boolean> {
  const db = getDb();
  const rs = await db.execute({
    sql: "SELECT 1 FROM watchlist WHERE bill_id = ? LIMIT 1",
    args: [billId],
  });
  return rs.rows.length > 0;
}

export async function addToWatchlist(billId: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO watchlist (bill_id, added_at) VALUES (?, ?)",
    args: [billId, new Date().toISOString()],
  });
}

export async function removeFromWatchlist(billId: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM watchlist WHERE bill_id = ?",
    args: [billId],
  });
}
