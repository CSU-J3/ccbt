import { ChamberToggle } from "@/components/ChamberToggle";
import { HeaderBar } from "@/components/HeaderBar";
import { SponsorRow } from "@/components/SponsorRow";
import { SponsorSortToggle } from "@/components/SponsorSortToggle";
import {
  getSponsorAggregates,
  getSponsorDetail,
  sanitizeChamber,
  sanitizeSponsorSort,
} from "@/lib/queries";

type SearchParams = {
  sort?: string;
  chamber?: string;
  expanded?: string;
};

function getCurrentSession(): string {
  return process.env.CO_CURRENT_SESSION ?? "—";
}

export default async function SponsorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const sort = sanitizeSponsorSort(params.sort);
  const chamber = sanitizeChamber(params.chamber);
  const expandedParam =
    typeof params.expanded === "string" ? params.expanded : undefined;

  const aggregates = await getSponsorAggregates(sort, chamber, 100);
  const expandedId =
    expandedParam && aggregates.some((a) => a.sponsor_id === expandedParam)
      ? expandedParam
      : undefined;
  const detail = expandedId
    ? await getSponsorDetail(expandedId, chamber)
    : null;

  const maxVolume = aggregates.length > 0 ? aggregates[0]!.total : 0;
  const maxByVolume =
    aggregates.length > 0
      ? aggregates.reduce(
          (m, a) => (a.total > m ? a.total : m),
          aggregates[0]!.total,
        )
      : 0;
  // when sorted by passrate, top row may not be max volume — recompute
  const volumeDenominator = sort === "passrate" ? maxByVolume : maxVolume;

  const currentParams = new URLSearchParams();
  if (sort !== "volume") currentParams.set("sort", sort);
  if (chamber) currentParams.set("chamber", chamber);
  if (expandedId) currentParams.set("expanded", expandedId);

  const subtitleSuffix =
    sort === "passrate" ? "pass rate" : "volume";

  return (
    <div className="flex min-h-screen flex-col">
      <HeaderBar />

      <main className="w-full flex-1 px-4 py-4">
        <div
          className="mb-3 flex flex-wrap items-center gap-3 border-b pb-3 text-[12px] uppercase tracking-[0.5px]"
          style={{
            borderColor: "var(--border-strong)",
            color: "var(--text-dim)",
          }}
        >
          <span style={{ color: "var(--accent-amber)" }}>👥 Sponsors</span>
          <span>·</span>
          <span>
            Top {aggregates.length} by {subtitleSuffix} (CO {getCurrentSession()})
          </span>
          <ChamberToggle
            current={chamber}
            basePath="/sponsors"
            currentParams={currentParams}
          />
          <span className="ml-auto flex items-center gap-2">
            <span>Sort by</span>
            <SponsorSortToggle
              current={sort}
              basePath="/sponsors"
              currentParams={currentParams}
            />
          </span>
        </div>

        {sort === "passrate" ? (
          <p
            className="mb-3 text-[12px]"
            style={{ color: "var(--text-muted)" }}
          >
            <em>
              Pass rate = bills currently at <code>signed</code> stage. Excludes
              bills still in progress.
            </em>
          </p>
        ) : null}

        {aggregates.length === 0 ? (
          <div
            className="border px-6 py-12 text-center text-[13px] uppercase tracking-[0.5px]"
            style={{
              borderColor: "var(--border-strong)",
              color: "var(--text-dim)",
            }}
          >
            No sponsors yet. Run sync, then ensure migrate + backfill have set
            sponsor_id.
          </div>
        ) : (
          <div
            className="border"
            style={{ borderColor: "var(--border-strong)" }}
          >
            <div
              className="sponsor-row"
              style={{
                backgroundColor: "var(--bg-panel)",
                borderBottom: "0.5px solid var(--border-strong)",
                color: "var(--text-dim)",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <span aria-hidden></span>
              <span>Rank</span>
              <span>Sponsor</span>
              <span>Volume</span>
              <span>Pass rate</span>
              <span>Signed / total</span>
            </div>
            <ul>
              {aggregates.map((a, i) => (
                <SponsorRow
                  key={a.sponsor_id}
                  rank={i + 1}
                  agg={a}
                  maxVolume={volumeDenominator}
                  isExpanded={expandedId === a.sponsor_id}
                  detail={
                    expandedId === a.sponsor_id ? detail : null
                  }
                  basePath="/sponsors"
                  currentParams={(() => {
                    const p = new URLSearchParams();
                    if (sort !== "volume") p.set("sort", sort);
                    if (chamber) p.set("chamber", chamber);
                    return p;
                  })()}
                  chamber={chamber}
                  sort={sort}
                />
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
