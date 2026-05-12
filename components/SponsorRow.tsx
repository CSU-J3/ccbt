import Link from "next/link";
import { SponsorExpansion } from "@/components/SponsorExpansion";
import type {
  ChamberKey,
  SponsorAggregate,
  SponsorDetail,
  SponsorSortKey,
} from "@/lib/queries";

function partyColor(party: string | null): string {
  switch (party) {
    case "R":
      return "var(--party-republican)";
    case "D":
      return "var(--party-democrat)";
    case "I":
      return "var(--party-independent)";
    default:
      return "var(--text-dim)";
  }
}

function formatPercent(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function shortName(name: string | null): string {
  if (!name) return "—";
  return name.replace(/^(Rep\.|Sen\.|Del\.|Res\.)\s*/i, "").trim();
}

function buildHref(
  basePath: string,
  current: URLSearchParams,
  sponsorId: string | null,
): string {
  const params = new URLSearchParams(current.toString());
  if (sponsorId) params.set("expanded", sponsorId);
  else params.delete("expanded");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function SponsorRow({
  rank,
  agg,
  maxVolume,
  isExpanded,
  detail,
  basePath,
  currentParams,
  chamber,
  sort,
}: {
  rank: number;
  agg: SponsorAggregate;
  maxVolume: number;
  isExpanded: boolean;
  detail: SponsorDetail | null;
  basePath: string;
  currentParams: URLSearchParams;
  chamber: ChamberKey | undefined;
  sort: SponsorSortKey;
}) {
  void sort;
  const volumeWidth = maxVolume > 0 ? (agg.total / maxVolume) * 100 : 0;
  const passrateWidth = agg.passrate * 100;
  const color = partyColor(agg.sponsor_party);
  const href = buildHref(basePath, currentParams, isExpanded ? null : agg.sponsor_id);
  const districtSuffix = [agg.sponsor_party, agg.sponsor_district]
    .filter(Boolean)
    .join(", ");

  return (
    <li>
      <Link
        href={href}
        replace
        scroll={false}
        prefetch={false}
        className="sponsor-row"
        style={{
          backgroundColor: isExpanded ? "var(--bg-row-hover)" : undefined,
        }}
      >
        <span
          aria-hidden
          style={{
            color: isExpanded
              ? "var(--accent-amber)"
              : "var(--text-dim)",
          }}
        >
          {isExpanded ? "▾" : "▸"}
        </span>
        <span
          className="text-[13px]"
          style={{ color: "var(--text-dim)" }}
        >
          {rank}
        </span>
        <span className="min-w-0 truncate text-[14px]">
          <span style={{ color: "var(--text-primary)" }}>
            {shortName(agg.sponsor_name)}
          </span>
          {districtSuffix ? (
            <>
              {" "}
              <span className="shrink-0" style={{ color }}>
                ({districtSuffix})
              </span>
            </>
          ) : null}
        </span>

        <span className="sponsor-bar-cell">
          <span
            className="sponsor-bar-track"
            style={{ borderColor: "var(--border-strong)" }}
          >
            <span
              className="sponsor-bar-fill"
              style={{ width: `${volumeWidth}%`, backgroundColor: color }}
              aria-hidden
            />
          </span>
          <span
            className="sponsor-bar-label tabular-nums"
            style={{ color: "var(--text-secondary)" }}
          >
            {agg.total}
          </span>
        </span>

        <span className="sponsor-bar-cell">
          <span
            className="sponsor-bar-track"
            style={{ borderColor: "var(--border-strong)" }}
          >
            <span
              className="sponsor-bar-fill"
              style={{
                width: `${passrateWidth}%`,
                backgroundColor: "var(--stage-signed)",
              }}
              aria-hidden
            />
          </span>
          <span
            className="sponsor-bar-label tabular-nums"
            style={{ color: "var(--text-secondary)" }}
          >
            {formatPercent(agg.passrate)}
          </span>
        </span>

        <span
          className="text-[13px] tabular-nums whitespace-nowrap"
          style={{ color: "var(--text-muted)" }}
        >
          <span style={{ color: "var(--stage-signed)" }}>
            {agg.signed_count}✓
          </span>
          <span style={{ color: "var(--text-dim)" }}> / </span>
          <span>{agg.total}</span>
        </span>
      </Link>
      {isExpanded && detail ? (
        <SponsorExpansion
          detail={detail}
          chamber={chamber}
          currentParams={currentParams}
        />
      ) : null}
    </li>
  );
}
