import Link from "next/link";
import type { SponsorSortKey } from "@/lib/queries";

const SEGMENTS: Array<{ key: SponsorSortKey; label: string }> = [
  { key: "volume", label: "VOLUME" },
  { key: "passrate", label: "PASS RATE" },
];

function buildHref(
  basePath: string,
  current: URLSearchParams,
  next: SponsorSortKey,
): string {
  const params = new URLSearchParams(current.toString());
  if (next === "volume") params.delete("sort");
  else params.set("sort", next);
  params.delete("expanded");
  params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function SponsorSortToggle({
  current,
  basePath,
  currentParams,
}: {
  current: SponsorSortKey;
  basePath: string;
  currentParams: URLSearchParams;
}) {
  return (
    <div
      role="group"
      aria-label="Sort sponsors by"
      className="inline-flex overflow-hidden rounded-sm border"
      style={{ borderColor: "var(--border-strong)" }}
    >
      {SEGMENTS.map((seg, i) => {
        const isOn = current === seg.key;
        const href = buildHref(basePath, currentParams, seg.key);
        const style: React.CSSProperties = isOn
          ? {
              backgroundColor: "var(--accent-amber-bright)",
              color: "#0a0e14",
            }
          : {
              backgroundColor: "var(--bg-base)",
              color: "var(--text-secondary)",
            };
        const className = `px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.5px] transition${
          i > 0 ? " border-l" : ""
        }`;
        return (
          <Link
            key={seg.key}
            href={href}
            scroll={false}
            className={className}
            style={{ ...style, borderColor: "var(--border-strong)" }}
          >
            {seg.label}
          </Link>
        );
      })}
    </div>
  );
}
