import { getDb } from "./db";
import { stageFromActions, type Action } from "./stage";

const API_BASE = "https://v3.openstates.org";
const PAGE_SIZE = 20;
const REQUEST_GAP_MS = 6500;
const JURISDICTION = "co";
const JURISDICTION_OCD = "ocd-jurisdiction/country:us/state:co/government";

type Sponsorship = {
  name?: string | null;
  classification?: string | null;
  person?: {
    id?: string | null;
    party?: string | null;
    current_role?: {
      district?: string | number | null;
      org_classification?: string | null;
    } | null;
  } | null;
};

type Abstract = {
  abstract?: string | null;
  note?: string | null;
};

type ListBill = {
  id: string;
  identifier: string;
  title: string;
  session: string;
  jurisdiction?: { id?: string; classification?: string } | null;
  from_organization?: { classification?: string | null } | null;
  first_action_date?: string | null;
  latest_action_date?: string | null;
  latest_action_description?: string | null;
  updated_at: string;
  sponsorships?: Sponsorship[] | null;
  abstracts?: Abstract[] | null;
  actions?: Action[] | null;
  sources?: Array<{ url?: string }> | null;
};

type ListResponse = {
  results?: ListBill[];
  pagination?: {
    page?: number;
    per_page?: number;
    total_items?: number;
    max_page?: number;
  };
};

export type SyncStats = {
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  session: string;
  updatedSince: string | null;
};

const PARTY_MAP: Record<string, "D" | "R" | "I"> = {
  D: "D",
  DEM: "D",
  DEMOCRAT: "D",
  DEMOCRATIC: "D",
  R: "R",
  REP: "R",
  REPUBLICAN: "R",
  I: "I",
  IND: "I",
  INDEPENDENT: "I",
};

function normalizeParty(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  if (!key) return null;
  return PARTY_MAP[key] ?? "I";
}

function parseIdentifier(identifier: string): { type: string; number: number } | null {
  const trimmed = identifier.trim();
  const match = trimmed.match(/^([A-Z]+)\s+\d{2}-(\d+)$/);
  if (!match) return null;
  const [, type, number] = match;
  if (!type || !number) return null;
  return { type: type.toUpperCase(), number: Number(number) };
}

function buildBillId(session: string, billType: string, billNumber: number): string {
  return `${JURISDICTION}-${session.toLowerCase()}-${billType.toLowerCase()}-${billNumber}`;
}

export function deriveSponsorIdFallback(
  name: string | null,
  district: string | null,
): string | null {
  if (!name) return null;
  const noPrefix = name.replace(/^(rep\.|sen\.|del\.|res\.)\s*/i, "").trim();
  const slug = noPrefix
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return null;
  const districtSlug = district
    ? district.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    : null;
  return districtSlug ? `slug:${slug}-${districtSlug}` : `slug:${slug}`;
}

export function pickPrimarySponsor(
  sponsorships: Sponsorship[] | null | undefined,
):
  | {
      id: string | null;
      name: string | null;
      party: string | null;
      district: string | null;
    }
  | null {
  if (!sponsorships || sponsorships.length === 0) return null;
  const primary =
    sponsorships.find((s) => s.classification === "primary") ?? sponsorships[0];
  if (!primary) return null;
  const role = primary.person?.current_role ?? null;
  let district: string | null = null;
  if (role?.district !== undefined && role?.district !== null) {
    const orgClass = role.org_classification ?? "";
    const prefix =
      orgClass === "lower" ? "HD-" : orgClass === "upper" ? "SD-" : "";
    district = `${prefix}${role.district}`;
  }
  const name = primary.name ?? null;
  const personId = primary.person?.id ?? null;
  const id = personId ?? deriveSponsorIdFallback(name, district);
  return {
    id,
    name,
    party: normalizeParty(primary.person?.party ?? null),
    district,
  };
}

function pickLongestAbstract(abstracts: Abstract[] | null | undefined): string | null {
  if (!abstracts || abstracts.length === 0) return null;
  let best: string | null = null;
  for (const a of abstracts) {
    const text = a.abstract ?? "";
    if (text && (best === null || text.length > best.length)) {
      best = text;
    }
  }
  return best;
}

async function fetchPage(
  session: string,
  page: number,
  apiKey: string,
  updatedSince: string | null,
): Promise<ListResponse> {
  const params = new URLSearchParams();
  params.set("jurisdiction", JURISDICTION_OCD);
  params.set("session", session);
  if (updatedSince) params.set("updated_since", updatedSince);
  params.set("sort", "updated_desc");
  params.append("include", "sponsorships");
  params.append("include", "abstracts");
  params.append("include", "actions");
  params.append("include", "sources");
  params.set("per_page", String(PAGE_SIZE));
  params.set("page", String(page));

  const url = `${API_BASE}/bills?${params.toString()}`;
  const res = await fetchWithRetry(url, apiKey);
  return (await res.json()) as ListResponse;
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  attempt = 0,
): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
  });
  if (res.status === 429 && attempt < 3) {
    const wait = 2000 * (attempt + 1);
    console.warn(`rate limited, sleeping ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return fetchWithRetry(url, apiKey, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fetch ${url} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

async function getWatermark(
  db: ReturnType<typeof getDb>,
  session: string,
): Promise<string | null> {
  const r = await db.execute({
    sql:
      "SELECT MAX(update_date) AS m FROM bills WHERE jurisdiction = ? AND session = ?",
    args: [JURISDICTION, session],
  });
  const m = r.rows[0]?.m as string | null | undefined;
  return m ?? null;
}

async function getStoredUpdate(
  db: ReturnType<typeof getDb>,
  id: string,
): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT update_date FROM bills WHERE id = ?",
    args: [id],
  });
  const row = r.rows[0];
  if (!row) return null;
  return (row.update_date as string | null) ?? null;
}

const UPSERT_SQL = `
INSERT INTO bills (
  id, jurisdiction, session, bill_type, bill_number, title,
  introduced_date, latest_action_date, latest_action_text,
  sponsor_name, sponsor_party, sponsor_district, sponsor_id,
  update_date, openstates_id, raw_json, stage
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  jurisdiction = excluded.jurisdiction,
  session = excluded.session,
  bill_type = excluded.bill_type,
  bill_number = excluded.bill_number,
  title = excluded.title,
  introduced_date = excluded.introduced_date,
  latest_action_date = excluded.latest_action_date,
  latest_action_text = excluded.latest_action_text,
  sponsor_name = excluded.sponsor_name,
  sponsor_party = excluded.sponsor_party,
  sponsor_district = excluded.sponsor_district,
  sponsor_id = excluded.sponsor_id,
  update_date = excluded.update_date,
  openstates_id = excluded.openstates_id,
  raw_json = excluded.raw_json,
  stage = CASE WHEN excluded.update_date != bills.update_date THEN excluded.stage ELSE bills.stage END,
  summary = CASE WHEN excluded.update_date != bills.update_date THEN NULL ELSE bills.summary END,
  summary_model = CASE WHEN excluded.update_date != bills.update_date THEN NULL ELSE bills.summary_model END,
  summary_updated_at = CASE WHEN excluded.update_date != bills.update_date THEN NULL ELSE bills.summary_updated_at END,
  topics = CASE WHEN excluded.update_date != bills.update_date THEN NULL ELSE bills.topics END
`;

async function upsertBill(
  db: ReturnType<typeof getDb>,
  bill: ListBill,
  parsed: { type: string; number: number },
  id: string,
): Promise<void> {
  const sponsor = pickPrimarySponsor(bill.sponsorships);
  const stage = stageFromActions(bill.actions ?? [], id);

  await db.execute({
    sql: UPSERT_SQL,
    args: [
      id,
      JURISDICTION,
      bill.session,
      parsed.type,
      parsed.number,
      bill.title,
      bill.first_action_date ?? null,
      bill.latest_action_date ?? null,
      bill.latest_action_description ?? null,
      sponsor?.name ?? null,
      sponsor?.party ?? null,
      sponsor?.district ?? null,
      sponsor?.id ?? null,
      bill.updated_at,
      bill.id,
      JSON.stringify(bill),
      stage,
    ],
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runSync(): Promise<SyncStats> {
  const apiKey = process.env.OPENSTATES_API_KEY;
  if (!apiKey) throw new Error("OPENSTATES_API_KEY is not set");
  const session = process.env.CO_CURRENT_SESSION;
  if (!session) throw new Error("CO_CURRENT_SESSION is not set");

  const db = getDb();
  const updatedSince = await getWatermark(db, session);
  console.log(
    `syncing CO ${session} bills updated since ${updatedSince ?? "(start of session)"}`,
  );

  const stats: SyncStats = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    session,
    updatedSince,
  };

  let page = 1;
  let maxPage = 1;
  while (true) {
    const resp = await fetchPage(session, page, apiKey, updatedSince);
    const results = resp.results ?? [];
    if (resp.pagination?.max_page) maxPage = resp.pagination.max_page;

    if (results.length === 0) break;

    let pageHadNewer = false;
    console.log(
      `page ${page}/${maxPage}: ${results.length} bills (updated_since=${updatedSince ?? "—"})`,
    );

    for (const bill of results) {
      stats.fetched++;
      const parsed = parseIdentifier(bill.identifier);
      if (!parsed) {
        console.warn(`skip ${bill.id}: cannot parse identifier "${bill.identifier}"`);
        stats.failed++;
        continue;
      }
      const id = buildBillId(bill.session, parsed.type, parsed.number);
      const stored = await getStoredUpdate(db, id);

      if (stored && stored >= bill.updated_at) {
        stats.unchanged++;
        continue;
      }

      try {
        await upsertBill(db, bill, parsed, id);
        if (stored) stats.updated++;
        else stats.inserted++;
        pageHadNewer = true;
      } catch (err) {
        console.error(`failed ${id}:`, (err as Error).message);
        stats.failed++;
      }
    }

    if (updatedSince && !pageHadNewer) break;
    if (page >= maxPage) break;
    if (results.length < PAGE_SIZE) break;

    page++;
    await sleep(REQUEST_GAP_MS);
  }

  console.log(
    `done: fetched=${stats.fetched} new=${stats.inserted} updated=${stats.updated} unchanged=${stats.unchanged} failed=${stats.failed}`,
  );
  return stats;
}
