function sessionYearTwoDigit(session: string): string {
  const m = session.match(/^(\d{4})/);
  if (!m) return "";
  return m[1]!.slice(2);
}

export function formatBillId(row: {
  bill_type: string;
  bill_number: number;
  session: string;
}): string {
  const yy = sessionYearTwoDigit(row.session);
  return yy
    ? `${row.bill_type.toUpperCase()} ${yy}-${row.bill_number}`
    : `${row.bill_type.toUpperCase()} ${row.bill_number}`;
}

export function formatSponsor(row: {
  sponsor_name: string | null;
  sponsor_party: string | null;
  sponsor_district: string | null;
}): string {
  if (!row.sponsor_name) return "";
  const name = lastNamePart(row.sponsor_name);
  if (!row.sponsor_party && !row.sponsor_district) return name;
  if (row.sponsor_party && row.sponsor_district) {
    return `${name} (${row.sponsor_party}, ${row.sponsor_district})`;
  }
  return `${name} (${row.sponsor_party ?? row.sponsor_district})`;
}

function lastNamePart(name: string): string {
  const noPrefix = name.replace(/^(Rep\.|Sen\.|Del\.|Res\.)\s*/i, "").trim();
  const lastName = noPrefix.split(",")[0]?.trim();
  return lastName ?? noPrefix;
}

export function openStatesUrl(row: {
  jurisdiction: string;
  session: string;
  bill_type: string;
  bill_number: number;
}): string {
  return `https://openstates.org/${row.jurisdiction.toLowerCase()}/bills/${row.session}/${row.bill_type.toUpperCase()}${row.bill_number}/`;
}

export function billSourceUrl(
  row: {
    jurisdiction: string;
    session: string;
    bill_type: string;
    bill_number: number;
  },
  rawJson: string,
): string {
  try {
    const raw = JSON.parse(rawJson) as {
      sources?: Array<{ url?: string }>;
    };
    const first = raw.sources?.[0]?.url;
    if (first && typeof first === "string") return first;
  } catch {
    // fall through
  }
  return openStatesUrl(row);
}

// "MM-DD-YY" — feed list, dense
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const part = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return part || "—";
  return `${part.slice(5, 7)}-${part.slice(8, 10)}-${part.slice(2, 4)}`;
}

// "YYYY-MM-DD" — detail page, expanded panel
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const part = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return part || "—";
  return part;
}

// "HH:MM MT" in America/Denver — header bar last-updated
const mountainTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatLastUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${mountainTimeFormatter.format(d)} MT`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const part = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return 0;
  const t = Date.parse(`${part}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - t) / MS_PER_DAY));
}

export function parseTopics(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
}
