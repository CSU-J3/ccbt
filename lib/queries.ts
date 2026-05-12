import { getDb } from "./db";
import {
  ALLOWED_STAGES_SET,
  ALLOWED_TOPICS_SET,
  HOUSE_BILL_TYPES,
  SENATE_BILL_TYPES,
} from "./enums";

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
  sponsor_id: string | null;
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

export const CHAMBER_KEYS = ["house", "senate"] as const;
export type ChamberKey = (typeof CHAMBER_KEYS)[number];
const CHAMBER_KEYS_SET = new Set<string>(CHAMBER_KEYS);

export type FeedFilters = {
  topics?: string[];
  stage?: string;
  q?: string;
  sort?: SortKey;
  chamber?: ChamberKey;
  sponsor?: string;
};

const FEED_COLUMNS = `id, jurisdiction, session, bill_type, bill_number, title,
  sponsor_name, sponsor_party, sponsor_district, sponsor_id,
  introduced_date, latest_action_date, latest_action_text,
  update_date, summary, topics, stage`;

function buildFeedWhere(filters: FeedFilters): {
  clauses: string[];
  args: (string | number)[];
} {
  const clauses: string[] = ["jurisdiction = ?", "session = ?"];
  const args: (string | number)[] = [JURISDICTION, getCurrentSession()];

  if (filters.stage) {
    clauses.push("stage = ?");
    args.push(filters.stage);
  }

  if (filters.chamber) {
    const types =
      filters.chamber === "house" ? HOUSE_BILL_TYPES : SENATE_BILL_TYPES;
    const placeholders = types.map(() => "?").join(", ");
    clauses.push(`LOWER(bill_type) IN (${placeholders})`);
    for (const t of types) args.push(t);
  }

  if (filters.sponsor) {
    clauses.push("sponsor_id = ?");
    args.push(filters.sponsor);
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

export function sanitizeChamber(
  raw: string | null | undefined,
): ChamberKey | undefined {
  if (raw && CHAMBER_KEYS_SET.has(raw)) return raw as ChamberKey;
  return undefined;
}

export function sanitizePage(raw: string | null | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
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
    sponsor_id: (r.sponsor_id as string | null) ?? null,
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
  offset = 0,
): Promise<FeedBill[]> {
  const db = getDb();
  const { clauses, args } = buildFeedWhere(filters);
  args.push(limit);
  args.push(offset);

  const sortColumn =
    filters.sort === "introduced" ? "introduced_date" : "latest_action_date";

  const sql = `SELECT ${FEED_COLUMNS}
    FROM bills
    WHERE ${clauses.join(" AND ")}
    ORDER BY ${sortColumn} DESC NULLS LAST, id DESC
    LIMIT ? OFFSET ?`;

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
  chamber?: ChamberKey,
): Promise<FeedBill[]> {
  const db = getDb();
  const sortColumn =
    sort === "introduced" ? "b.introduced_date" : "b.latest_action_date";

  const args: (string | number)[] = [JURISDICTION, getCurrentSession()];
  let chamberClause = "";
  if (chamber) {
    const types = chamber === "house" ? HOUSE_BILL_TYPES : SENATE_BILL_TYPES;
    const placeholders = types.map(() => "?").join(", ");
    chamberClause = ` AND LOWER(b.bill_type) IN (${placeholders})`;
    for (const t of types) args.push(t);
  }

  const sql = `SELECT b.id, b.jurisdiction, b.session, b.bill_type, b.bill_number, b.title,
      b.sponsor_name, b.sponsor_party, b.sponsor_district, b.sponsor_id,
      b.introduced_date, b.latest_action_date, b.latest_action_text,
      b.update_date, b.summary, b.topics, b.stage
    FROM bills b
    INNER JOIN watchlist w ON w.bill_id = b.id
    WHERE b.jurisdiction = ? AND b.session = ?${chamberClause}
    ORDER BY ${sortColumn} DESC NULLS LAST, b.id DESC`;
  const rs = await db.execute({ sql, args });
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

// ----- sponsor aggregation -----------------------------------------------

export const SPONSOR_SORT_KEYS = ["volume", "passrate"] as const;
export type SponsorSortKey = (typeof SPONSOR_SORT_KEYS)[number];
const SPONSOR_SORT_KEYS_SET = new Set<string>(SPONSOR_SORT_KEYS);

export function sanitizeSponsorSort(
  raw: string | null | undefined,
): SponsorSortKey {
  if (raw && SPONSOR_SORT_KEYS_SET.has(raw)) return raw as SponsorSortKey;
  return "volume";
}

export type SponsorAggregate = {
  sponsor_id: string;
  sponsor_name: string | null;
  sponsor_party: string | null;
  sponsor_district: string | null;
  total: number;
  signed_count: number;
  passrate: number;
};

export async function getSponsorAggregates(
  sort: SponsorSortKey,
  chamber: ChamberKey | undefined,
  limit = 100,
): Promise<SponsorAggregate[]> {
  const db = getDb();

  const clauses: string[] = [
    "jurisdiction = ?",
    "session = ?",
    "sponsor_id IS NOT NULL",
  ];
  const args: (string | number)[] = [JURISDICTION, getCurrentSession()];

  if (chamber) {
    const types = chamber === "house" ? HOUSE_BILL_TYPES : SENATE_BILL_TYPES;
    const placeholders = types.map(() => "?").join(", ");
    clauses.push(`LOWER(bill_type) IN (${placeholders})`);
    for (const t of types) args.push(t);
  }

  const orderBy =
    sort === "passrate"
      ? "passrate DESC, total DESC"
      : "total DESC, passrate DESC";

  const sql = `SELECT
      sponsor_id,
      MAX(sponsor_name) AS sponsor_name,
      MAX(sponsor_party) AS sponsor_party,
      MAX(sponsor_district) AS sponsor_district,
      COUNT(*) AS total,
      SUM(CASE WHEN stage = 'signed' THEN 1 ELSE 0 END) AS signed_count,
      CAST(SUM(CASE WHEN stage = 'signed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS passrate
    FROM bills
    WHERE ${clauses.join(" AND ")}
    GROUP BY sponsor_id
    ORDER BY ${orderBy}
    LIMIT ?`;
  args.push(limit);

  const rs = await db.execute({ sql, args });
  return rs.rows.map((r) => ({
    sponsor_id: r.sponsor_id as string,
    sponsor_name: (r.sponsor_name as string | null) ?? null,
    sponsor_party: (r.sponsor_party as string | null) ?? null,
    sponsor_district: (r.sponsor_district as string | null) ?? null,
    total: Number(r.total ?? 0),
    signed_count: Number(r.signed_count ?? 0),
    passrate: Number(r.passrate ?? 0),
  }));
}

export type SponsorStageBreakdown = Record<string, number>;
export type SponsorTopicCount = { topic: string; count: number };

export type SponsorDetail = {
  sponsor_id: string;
  sponsor_name: string | null;
  sponsor_party: string | null;
  sponsor_district: string | null;
  total: number;
  signed_count: number;
  passrate: number;
  stages: SponsorStageBreakdown;
  topics: SponsorTopicCount[];
  bills: FeedBill[];
};

export async function getSponsorDetail(
  sponsorId: string,
  chamber: ChamberKey | undefined,
): Promise<SponsorDetail | null> {
  const db = getDb();
  const args: (string | number)[] = [
    JURISDICTION,
    getCurrentSession(),
    sponsorId,
  ];
  let chamberClause = "";
  if (chamber) {
    const types = chamber === "house" ? HOUSE_BILL_TYPES : SENATE_BILL_TYPES;
    const placeholders = types.map(() => "?").join(", ");
    chamberClause = ` AND LOWER(bill_type) IN (${placeholders})`;
    for (const t of types) args.push(t);
  }

  const rs = await db.execute({
    sql: `SELECT ${FEED_COLUMNS}
      FROM bills
      WHERE jurisdiction = ? AND session = ? AND sponsor_id = ?${chamberClause}
      ORDER BY latest_action_date DESC NULLS LAST, id DESC`,
    args,
  });

  const bills = rs.rows.map(rowToFeedBill);
  if (bills.length === 0) return null;

  const stages: SponsorStageBreakdown = {};
  const topicCounts = new Map<string, number>();
  let signed = 0;
  for (const b of bills) {
    if (b.stage) {
      stages[b.stage] = (stages[b.stage] ?? 0) + 1;
      if (b.stage === "signed") signed++;
    }
    if (b.topics) {
      try {
        const arr = JSON.parse(b.topics) as unknown;
        if (Array.isArray(arr)) {
          for (const t of arr) {
            if (typeof t === "string") {
              topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
            }
          }
        }
      } catch {
        // skip malformed
      }
    }
  }

  const topics: SponsorTopicCount[] = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

  const first = bills[0]!;
  return {
    sponsor_id: sponsorId,
    sponsor_name: first.sponsor_name,
    sponsor_party: first.sponsor_party,
    sponsor_district: first.sponsor_district,
    total: bills.length,
    signed_count: signed,
    passrate: bills.length > 0 ? signed / bills.length : 0,
    stages,
    topics,
    bills,
  };
}
