import Link from "next/link";

export const PAGE_SIZE = 100;

function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 1) return [];
  const pages = new Set<number>([1, total, current]);
  for (let i = current - 2; i <= current + 2; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i === 0) {
      out.push(n);
      continue;
    }
    const prev = sorted[i - 1]!;
    const gap = n - prev;
    if (gap === 1) {
      out.push(n);
    } else if (gap === 2) {
      // gap of exactly 1 missing page → render the missing number
      out.push(prev + 1, n);
    } else {
      out.push("…", n);
    }
  }
  return out;
}

function buildHref(
  basePath: string,
  searchParams: URLSearchParams,
  page: number,
): string {
  const next = new URLSearchParams(searchParams);
  if (page <= 1) next.delete("page");
  else next.set("page", String(page));
  next.delete("expanded");
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  currentPage,
  totalCount,
  pageSize = PAGE_SIZE,
  basePath,
  searchParams,
}: {
  currentPage: number;
  totalCount: number;
  pageSize?: number;
  basePath: string;
  searchParams: URLSearchParams;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const pages = buildPageNumbers(currentPage, totalPages);
  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < totalPages ? currentPage + 1 : null;

  const baseLink =
    "border px-2 py-1 text-[12px] uppercase tracking-[0.5px] transition";
  const inactiveStyle = {
    color: "var(--text-muted)",
    borderColor: "var(--border-strong)",
  } as const;
  const disabledStyle = {
    color: "var(--text-dim)",
    borderColor: "var(--border-strong)",
    opacity: 0.5,
  } as const;
  const activeStyle = {
    color: "#0a0e14",
    backgroundColor: "var(--accent-amber)",
    borderColor: "var(--accent-amber)",
  } as const;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center gap-1.5 px-1 py-2"
    >
      <span
        className="mr-2 text-[12px] uppercase tracking-[0.5px]"
        style={{ color: "var(--text-dim)" }}
      >
        Page {currentPage} / {totalPages}
      </span>
      {prev !== null ? (
        <Link
          href={buildHref(basePath, searchParams, prev)}
          scroll={false}
          className={baseLink}
          style={inactiveStyle}
        >
          ← Prev
        </Link>
      ) : (
        <span className={baseLink} style={disabledStyle} aria-disabled>
          ← Prev
        </span>
      )}
      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`gap-${i}`}
            className="px-1 text-[12px]"
            style={{ color: "var(--text-dim)" }}
          >
            …
          </span>
        ) : p === currentPage ? (
          <span
            key={p}
            aria-current="page"
            className={baseLink}
            style={activeStyle}
          >
            {p}
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(basePath, searchParams, p)}
            scroll={false}
            className={baseLink}
            style={inactiveStyle}
          >
            {p}
          </Link>
        ),
      )}
      {next !== null ? (
        <Link
          href={buildHref(basePath, searchParams, next)}
          scroll={false}
          className={baseLink}
          style={inactiveStyle}
        >
          Next →
        </Link>
      ) : (
        <span className={baseLink} style={disabledStyle} aria-disabled>
          Next →
        </span>
      )}
    </nav>
  );
}
