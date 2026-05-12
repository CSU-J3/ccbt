import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { formatLastUpdated } from "@/lib/format";
import {
  type FeedFilters,
  getFeedCount,
  getFeedStats,
} from "@/lib/queries";

function getCurrentSession(): string {
  return process.env.CO_CURRENT_SESSION ?? "—";
}

export async function HeaderBar({
  feedFilters,
  basePath = "/",
}: {
  feedFilters?: FeedFilters;
  basePath?: string;
} = {}) {
  const stats = await getFeedStats();
  const showSearch = !!feedFilters;
  const counts = showSearch ? await getFeedCount(feedFilters) : null;
  const q = feedFilters?.q?.trim() ?? "";
  const isFiltering =
    showSearch &&
    (!!q ||
      !!feedFilters?.stage ||
      !!feedFilters?.chamber ||
      (feedFilters?.topics?.length ?? 0) > 0);

  return (
    <header
      className="border-b"
      style={{
        backgroundColor: "var(--bg-panel)",
        borderColor: "var(--border-strong)",
      }}
    >
      <div className="header-inner flex w-full items-center gap-x-4 px-4 pt-3">
        <div className="flex flex-col">
          <Link
            href="/"
            className="text-[16px] font-medium uppercase tracking-[0.5px] whitespace-nowrap"
            style={{ color: "var(--accent-amber)" }}
          >
            CCBT <span style={{ color: "var(--text-dim)" }}>//</span>{" "}
            CO {getCurrentSession()}
          </Link>
          <span
            className="mt-0.5 text-[11px] uppercase tracking-[0.5px]"
            style={{ color: "var(--text-dim)" }}
          >
            {counts && isFiltering ? (
              <>
                <span style={{ color: "var(--accent-amber)" }}>
                  {counts.filtered.toLocaleString()}
                </span>
                <span> of </span>
                <span>{counts.total.toLocaleString()} bills</span>
                {q ? (
                  <>
                    <span> · </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      &quot;{q}&quot;
                    </span>
                  </>
                ) : null}
                <span> · updated {formatLastUpdated(stats.lastUpdated)}</span>
              </>
            ) : (
              <>
                {stats.total.toLocaleString()} bills · updated{" "}
                {formatLastUpdated(stats.lastUpdated)}
              </>
            )}
          </span>
        </div>

        {showSearch ? (
          <div className="header-search">
            <SearchBox basePath={basePath} />
          </div>
        ) : null}

        <nav
          className="header-nav flex items-center gap-4 text-[14px] uppercase tracking-[0.5px] whitespace-nowrap"
          style={{ color: "var(--text-dim)" }}
        >
          <Link
            href="/sponsors"
            className="transition hover:text-[var(--text-secondary)]"
          >
            👥 Sponsors
          </Link>
          <Link
            href="/watchlist"
            className="transition hover:text-[var(--text-secondary)]"
          >
            ★ Watchlist
          </Link>
        </nav>
      </div>
      <div className="px-4 pb-3" />
    </header>
  );
}
