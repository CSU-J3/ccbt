import Link from "next/link";
import { StageIndicator } from "@/components/StageIndicator";
import { formatBillId, formatDateShort } from "@/lib/format";
import type { ChamberKey, SponsorDetail } from "@/lib/queries";
import { topicColor, topicLabel, topicTitle } from "@/lib/topic-colors";

const STAGE_ORDER: Array<{
  key: string;
  glyph: string;
  label: string;
  varName: string;
}> = [
  { key: "introduced", glyph: "▸", label: "INTRO", varName: "--stage-introduced" },
  {
    key: "in_committee",
    glyph: "▸",
    label: "COMMITTEE",
    varName: "--stage-in-committee",
  },
  {
    key: "passed_first_chamber",
    glyph: "▸▸",
    label: "PASSED 1ST",
    varName: "--stage-passed-first-chamber",
  },
  {
    key: "passed_second_chamber",
    glyph: "▸▸▸",
    label: "PASSED BOTH",
    varName: "--stage-passed-second-chamber",
  },
  { key: "signed", glyph: "✓", label: "SIGNED", varName: "--stage-signed" },
  { key: "vetoed", glyph: "✗", label: "VETOED", varName: "--stage-vetoed" },
  { key: "dead", glyph: "—", label: "DEAD", varName: "--stage-dead" },
];

function shortName(name: string | null): string {
  if (!name) return "—";
  return name.replace(/^(Rep\.|Sen\.|Del\.|Res\.)\s*/i, "").trim();
}

function initials(name: string | null): string {
  if (!name) return "?";
  const stripped = name
    .replace(/^(Rep\.|Sen\.|Del\.|Res\.)\s*/i, "")
    .replace(/,/g, " ")
    .trim();
  const parts = stripped.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const labelStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  letterSpacing: "0.5px",
};
const valueStyle: React.CSSProperties = {
  color: "var(--text-primary)",
};

export function SponsorExpansion({
  detail,
  chamber,
  currentParams,
}: {
  detail: SponsorDetail;
  chamber: ChamberKey | undefined;
  currentParams: URLSearchParams;
}) {
  void currentParams;
  const passrateLabel = `${Math.round(detail.passrate * 100)}%`;
  const topTopics = detail.topics.slice(0, 3);

  const feedHref = (() => {
    const p = new URLSearchParams();
    p.set("sponsor", detail.sponsor_id);
    if (chamber) p.set("chamber", chamber);
    return `/?${p.toString()}`;
  })();

  return (
    <div className="sponsor-expansion">
      <div className="sponsor-expansion-grid">
        <div className="sponsor-monogram" aria-hidden>
          {initials(detail.sponsor_name)}
        </div>

        <dl className="sponsor-stats">
          <dt className="text-[12px] uppercase" style={labelStyle}>
            Sponsor
          </dt>
          <dd className="text-[14px]" style={valueStyle}>
            {shortName(detail.sponsor_name)}
          </dd>

          <dt className="text-[12px] uppercase" style={labelStyle}>
            Total bills
          </dt>
          <dd className="text-[14px] tabular-nums" style={valueStyle}>
            {detail.total}
          </dd>

          <dt className="text-[12px] uppercase" style={labelStyle}>
            Signed
          </dt>
          <dd className="text-[14px] tabular-nums" style={valueStyle}>
            {detail.signed_count}{" "}
            <span style={{ color: "var(--text-muted)" }}>
              ({passrateLabel})
            </span>
          </dd>

          <dt className="text-[12px] uppercase" style={labelStyle}>
            Stages
          </dt>
          <dd className="text-[13px]">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 uppercase tracking-[0.5px]">
              {STAGE_ORDER.map((s, i) => {
                const n = detail.stages[s.key] ?? 0;
                if (n === 0) return null;
                return (
                  <span key={s.key} className="inline-flex items-center gap-1">
                    {i > 0 ? (
                      <span style={{ color: "var(--text-dim)" }}>·</span>
                    ) : null}
                    <span style={{ color: `var(${s.varName})` }}>
                      {s.glyph} {s.label}
                    </span>
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {n}
                    </span>
                  </span>
                );
              })}
              {Object.values(detail.stages).every((n) => !n) ? (
                <span style={{ color: "var(--text-dim)" }}>—</span>
              ) : null}
            </span>
          </dd>

          <dt className="text-[12px] uppercase" style={labelStyle}>
            Topics
          </dt>
          <dd className="text-[13px]">
            {topTopics.length === 0 ? (
              <span style={{ color: "var(--text-dim)" }}>—</span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-x-2 uppercase tracking-[0.5px]">
                {topTopics.map((tc, i) => {
                  const href = (() => {
                    const p = new URLSearchParams();
                    p.set("sponsor", detail.sponsor_id);
                    p.set("topics", tc.topic);
                    if (chamber) p.set("chamber", chamber);
                    return `/?${p.toString()}`;
                  })();
                  return (
                    <span key={tc.topic} className="inline-flex items-center gap-1">
                      {i > 0 ? (
                        <span style={{ color: "var(--text-dim)" }}>·</span>
                      ) : null}
                      <Link
                        href={href}
                        title={topicTitle(tc.topic)}
                        style={{ color: topicColor(tc.topic) }}
                      >
                        {topicLabel(tc.topic)}
                      </Link>
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        ({tc.count})
                      </span>
                    </span>
                  );
                })}
              </span>
            )}
          </dd>
        </dl>
      </div>

      <div className="mt-4">
        <div
          className="mb-1 text-[12px] uppercase tracking-[0.5px]"
          style={labelStyle}
        >
          All bills
        </div>
        <div
          className="max-h-80 overflow-y-auto border pr-1"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <ul>
            {detail.bills.map((b) => (
              <li
                key={b.id}
                className="grid grid-cols-[110px_1fr_auto_88px] items-center gap-x-3 px-2 py-1.5"
                style={{
                  borderBottom: "0.5px solid var(--border-soft)",
                }}
              >
                <Link
                  href={`/bill/${b.id}`}
                  className="text-[13px] font-medium tabular-nums"
                  style={{ color: "var(--accent-amber)" }}
                >
                  {formatBillId(b)}
                </Link>
                <span
                  className="min-w-0 truncate text-[13px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {b.title}
                </span>
                <span>
                  <StageIndicator stage={b.stage} />
                </span>
                <span
                  className="text-[12px] tabular-nums"
                  style={{ color: "var(--text-dim)" }}
                >
                  {formatDateShort(b.latest_action_date)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3">
          <Link
            href={feedHref}
            className="inline-block border px-2.5 py-1 text-[12px] uppercase tracking-[0.5px] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
            style={{
              color: "var(--accent-amber)",
              borderColor: "var(--accent-amber)",
            }}
          >
            Open in feed →
          </Link>
        </div>
      </div>
    </div>
  );
}
