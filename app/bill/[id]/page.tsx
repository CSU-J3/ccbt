import { notFound } from "next/navigation";
import { FooterLegend } from "@/components/FooterLegend";
import { HeaderBar } from "@/components/HeaderBar";
import { PartyTag } from "@/components/PartyTag";
import { StageIndicator } from "@/components/StageIndicator";
import { TopicTags } from "@/components/TopicTags";
import { WatchlistToggle } from "@/components/WatchlistToggle";
import {
  billSourceUrl,
  formatBillId,
  formatDateLong,
  parseTopics,
} from "@/lib/format";
import { getBillById, isInWatchlist } from "@/lib/queries";

const labelStyle: React.CSSProperties = {
  color: "var(--text-dim)",
  letterSpacing: "0.5px",
};
const valueStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
};

type RawAction = {
  date?: string;
  description?: string;
  classification?: string[];
};

const MAJOR_CLASSIFICATIONS = new Set<string>([
  "introduction",
  "reading-1",
  "reading-2",
  "reading-3",
  "referral-committee",
  "passage",
  "executive-receipt",
  "executive-signature",
  "executive-veto",
  "veto-override-passage",
  "withdrawal",
  "failure",
]);

/**
 * Pick the curated "major actions" view: dedupe repeated `referral-committee`
 * entries (keep only the first chronologically), keep everything else that
 * matches MAJOR_CLASSIFICATIONS. Returns newest-first to match the display.
 */
function pickMajorActions(chronological: RawAction[]): RawAction[] {
  const out: RawAction[] = [];
  let seenReferral = false;
  for (const a of chronological) {
    const cls = a.classification ?? [];
    const matches = cls.some((c) => MAJOR_CLASSIFICATIONS.has(c));
    if (!matches) continue;
    if (cls.includes("referral-committee")) {
      if (seenReferral) continue;
      seenReferral = true;
    }
    out.push(a);
  }
  return out.reverse();
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[124px_1fr] gap-x-4 py-1.5 text-[13px]">
      <dt className="text-[12px] uppercase" style={labelStyle}>
        {label}
      </dt>
      <dd style={valueStyle}>{children}</dd>
    </div>
  );
}

function Divider() {
  return (
    <div
      className="my-4 border-t"
      style={{ borderColor: "var(--border-strong)" }}
    />
  );
}

function ActionList({ actions }: { actions: RawAction[] }) {
  return (
    <ol
      className="space-y-1 text-[13px]"
      style={{ color: "var(--text-secondary)" }}
    >
      {actions.map((a, i) => (
        <li key={i} className="grid grid-cols-[100px_1fr] gap-x-4">
          <span
            className="tabular-nums"
            style={{ color: "var(--text-dim)" }}
          >
            {formatDateLong(a.date)}
          </span>
          <span>
            <span>{a.description ?? "—"}</span>
            {a.classification && a.classification.length > 0 ? (
              <span
                className="ml-2 text-[12px] uppercase tracking-[0.5px]"
                style={{ color: "var(--text-dim)" }}
              >
                ({a.classification.join(", ")})
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bill = await getBillById(id);
  if (!bill) notFound();

  const onWatchlist = await isInWatchlist(bill.id);
  const sourceUrl = billSourceUrl(bill, bill.raw_json);
  const topics = parseTopics(bill.topics);

  let raw: { actions?: RawAction[] } | null = null;
  let formattedRaw = bill.raw_json;
  try {
    raw = JSON.parse(bill.raw_json);
    formattedRaw = JSON.stringify(raw, null, 2);
  } catch {
    // leave raw on parse failure
  }
  const actionsAll = (raw?.actions ?? []).slice().reverse();
  const actionsMajor = pickMajorActions(raw?.actions ?? []);
  const useFiltered = actionsAll.length >= 4 && actionsMajor.length < actionsAll.length;

  return (
    <div className="flex min-h-screen flex-col">
      <HeaderBar />

      <main className="w-full flex-1 px-4 py-4">
        <div
          className="border p-5"
          style={{
            backgroundColor: "var(--bg-row-hover)",
            borderColor: "var(--border-strong)",
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-3">
                <span
                  className="text-[16px] font-medium"
                  style={{ color: "var(--accent-amber)" }}
                >
                  {formatBillId(bill)}
                </span>
                <h1
                  className="text-[15px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {bill.title}
                </h1>
              </div>
            </div>
            <WatchlistToggle billId={bill.id} initial={onWatchlist} />
          </div>

          <div className="mt-4">
            {bill.sponsor_name ? (
              <Field label="Sponsor">
                <span style={{ color: "var(--text-secondary)" }}>
                  {bill.sponsor_name}
                </span>{" "}
                <PartyTag
                  party={bill.sponsor_party}
                  district={bill.sponsor_district}
                />
              </Field>
            ) : null}
            {bill.introduced_date ? (
              <Field label="Introduced">
                {formatDateLong(bill.introduced_date)}
              </Field>
            ) : null}
            {bill.latest_action_date ? (
              <Field label="Last action">
                {formatDateLong(bill.latest_action_date)}
              </Field>
            ) : null}
            {bill.stage ? (
              <Field label="Stage">
                <StageIndicator stage={bill.stage} />
              </Field>
            ) : null}
            {topics.length > 0 ? (
              <Field label="Topics">
                <TopicTags topics={topics} />
              </Field>
            ) : null}
          </div>

          {bill.summary ? (
            <>
              <Divider />
              <div
                className="mb-2 text-[12px] uppercase tracking-[0.5px]"
                style={labelStyle}
              >
                Summary
              </div>
              <p
                className="max-w-[80ch] text-[14px] leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {bill.summary}
              </p>
            </>
          ) : null}

          {bill.latest_action_text ? (
            <>
              <Divider />
              <div
                className="mb-2 text-[12px] uppercase tracking-[0.5px]"
                style={labelStyle}
              >
                Latest action
              </div>
              <p
                className="max-w-[80ch] text-[14px] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {bill.latest_action_text}
              </p>
            </>
          ) : null}

          {actionsAll.length > 0 ? (
            <>
              <Divider />
              <div
                className="mb-2 text-[12px] uppercase tracking-[0.5px]"
                style={labelStyle}
              >
                Action history ({actionsAll.length})
              </div>
              <ActionList
                actions={useFiltered ? actionsMajor : actionsAll}
              />
              {useFiltered ? (
                <details className="mt-3">
                  <summary
                    className="cursor-pointer select-none text-[12px] uppercase tracking-[0.5px]"
                    style={{ color: "var(--text-dim)" }}
                  >
                    Show all {actionsAll.length} actions
                  </summary>
                  <div className="mt-2">
                    <ActionList actions={actionsAll} />
                  </div>
                </details>
              ) : null}
            </>
          ) : null}

          <Divider />

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="border px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.5px] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
              style={{
                color: "var(--text-dim)",
                borderColor: "var(--border-strong)",
              }}
            >
              Official source ↗
            </a>
            <a
              href="/"
              className="border px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.5px] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
              style={{
                color: "var(--text-dim)",
                borderColor: "var(--border-strong)",
              }}
            >
              ← Back to feed
            </a>
          </div>

          <details
            className="mt-4 border"
            style={{
              backgroundColor: "var(--bg-base)",
              borderColor: "var(--border-strong)",
            }}
          >
            <summary
              className="cursor-pointer select-none px-3 py-2 text-[12px] font-medium uppercase tracking-[0.5px]"
              style={{ color: "var(--text-dim)" }}
            >
              ▾ Raw JSON
            </summary>
            <pre
              className="overflow-auto border-t px-3 py-2 text-[12px] leading-snug"
              style={{
                borderColor: "var(--border-strong)",
                color: "var(--text-muted)",
              }}
            >
              {formattedRaw}
            </pre>
          </details>

          {bill.summary_model ? (
            <p
              className="mt-3 text-[12px] uppercase tracking-[0.5px]"
              style={{ color: "var(--text-dim)" }}
            >
              Summary by {bill.summary_model}
              {bill.summary_updated_at
                ? ` · ${formatDateLong(bill.summary_updated_at)}`
                : null}
            </p>
          ) : null}
        </div>
      </main>

      <FooterLegend />
    </div>
  );
}
