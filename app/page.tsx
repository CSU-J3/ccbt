import Link from "next/link";
import { BillRow } from "@/components/BillRow";
import { ChamberToggle } from "@/components/ChamberToggle";
import { FeedLegend } from "@/components/FeedLegend";
import { HeaderBar } from "@/components/HeaderBar";
import { Pagination, PAGE_SIZE } from "@/components/Pagination";
import { SortDropdown } from "@/components/SortDropdown";
import { StageFilter } from "@/components/StageFilter";
import { TopicFilter } from "@/components/TopicFilter";
import {
  getFeedBills,
  getFeedCount,
  isInWatchlist,
  sanitizeChamber,
  sanitizePage,
  sanitizeSort,
  sanitizeStage,
  sanitizeTopics,
} from "@/lib/queries";

type SearchParams = {
  topics?: string;
  stage?: string;
  expanded?: string;
  q?: string;
  sort?: string;
  chamber?: string;
  page?: string;
  sponsor?: string;
};

function sanitizeSponsorFilter(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  // accept ocd-person/<uuid> or slug:<...>
  if (/^[\w./:-]{1,128}$/.test(s)) return s;
  return undefined;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const topics = sanitizeTopics(params.topics);
  const stage = sanitizeStage(params.stage);
  const expandedParam =
    typeof params.expanded === "string" ? params.expanded : undefined;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const sort = sanitizeSort(params.sort);
  const chamber = sanitizeChamber(params.chamber);
  const page = sanitizePage(params.page);
  const sponsor = sanitizeSponsorFilter(params.sponsor);
  const hasFilters =
    topics.length > 0 || !!stage || !!chamber || !!sponsor;
  const feedFilters = {
    topics,
    stage,
    q: q || undefined,
    sort,
    chamber,
    sponsor,
  };

  const offset = (page - 1) * PAGE_SIZE;
  const [bills, counts] = await Promise.all([
    getFeedBills(feedFilters, PAGE_SIZE, offset),
    getFeedCount(feedFilters),
  ]);
  const expandedId =
    expandedParam && bills.some((b) => b.id === expandedParam)
      ? expandedParam
      : undefined;
  const onWatchlist = expandedId ? await isInWatchlist(expandedId) : false;

  // current URL state for child links/toggles
  const currentParams = new URLSearchParams();
  if (topics.length > 0) currentParams.set("topics", topics.join(","));
  if (stage) currentParams.set("stage", stage);
  if (q) currentParams.set("q", q);
  if (sort && sort !== "action") currentParams.set("sort", sort);
  if (chamber) currentParams.set("chamber", chamber);
  if (sponsor) currentParams.set("sponsor", sponsor);
  if (page > 1) currentParams.set("page", String(page));

  const clearSearchParams = new URLSearchParams();
  if (topics.length > 0) clearSearchParams.set("topics", topics.join(","));
  if (stage) clearSearchParams.set("stage", stage);
  if (chamber) clearSearchParams.set("chamber", chamber);
  const clearSearchHref = clearSearchParams.toString()
    ? `/?${clearSearchParams.toString()}`
    : "/";

  return (
    <div className="flex min-h-screen flex-col">
      <HeaderBar feedFilters={feedFilters} />

      <main className="w-full flex-1 px-4 py-4">
        <section
          className="filter-chips mb-3 flex flex-wrap items-center gap-3 border-b pb-3"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <TopicFilter selected={topics} currentParams={currentParams} />
          <ChamberToggle
            current={chamber}
            basePath="/"
            currentParams={currentParams}
          />
          <StageFilter current={stage} basePath="/" />
          <span
            className="ml-2 text-[12px] uppercase tracking-[0.5px]"
            style={{ color: "var(--text-dim)" }}
          >
            Sort
          </span>
          <SortDropdown current={sort} basePath="/" />
          {hasFilters ? (
            <Link
              href={q ? `/?q=${encodeURIComponent(q)}` : "/"}
              className="ml-auto text-[12px] uppercase tracking-[0.5px] transition hover:text-[var(--text-secondary)]"
              style={{ color: "var(--text-dim)" }}
            >
              Clear filters ✕
            </Link>
          ) : null}
        </section>

        <Pagination
          currentPage={page}
          totalCount={counts.filtered}
          basePath="/"
          searchParams={currentParams}
        />

        <FeedLegend />

        <div
          className="border"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <div className="feed-header-row">
            <span aria-hidden></span>
            <span>Bill</span>
            <span>Title / Sponsor</span>
            <span>Stage</span>
            <span className="col-date">Action</span>
            <span>Topics</span>
          </div>

          {bills.length === 0 ? (
            q ? (
              <div
                className="px-6 py-12 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                <p className="text-[14px] uppercase tracking-[0.5px]">
                  No bills match &quot;{q}&quot;
                </p>
                <p
                  className="mt-2 text-[13px]"
                  style={{ color: "var(--text-dim)" }}
                >
                  Try a broader term, check spelling, or clear the search.
                </p>
                <Link
                  href={clearSearchHref}
                  className="mt-4 inline-block border px-3 py-1 text-[12px] uppercase tracking-[0.5px] transition hover:text-[var(--bg-base)] hover:bg-[var(--accent-amber)]"
                  style={{
                    color: "var(--accent-amber)",
                    borderColor: "var(--accent-amber)",
                  }}
                >
                  [Clear search]
                </Link>
              </div>
            ) : (
              <div
                className="px-6 py-8 text-center text-[13px] uppercase tracking-[0.5px]"
                style={{ color: "var(--text-dim)" }}
              >
                No bills match these filters
              </div>
            )
          ) : (
            <ul>
              {bills.map((b) => (
                <BillRow
                  key={b.id}
                  bill={b}
                  filters={{
                    topics,
                    stage,
                    q,
                    sort,
                    chamber,
                    sponsor,
                    page: page > 1 ? page : undefined,
                  }}
                  basePath="/"
                  expandedId={expandedId}
                  onWatchlist={expandedId === b.id ? onWatchlist : false}
                  introducedDate={b.introduced_date}
                />
              ))}
            </ul>
          )}
        </div>

        <Pagination
          currentPage={page}
          totalCount={counts.filtered}
          basePath="/"
          searchParams={currentParams}
        />
      </main>
    </div>
  );
}
