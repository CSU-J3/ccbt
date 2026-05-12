import Link from "next/link";
import type { ChamberKey } from "@/lib/queries";

const SEGMENTS: Array<{ key: ChamberKey | null; label: string }> = [
  { key: null, label: "ALL" },
  { key: "house", label: "HOUSE" },
  { key: "senate", label: "SENATE" },
];

function buildHref(
  basePath: string,
  current: URLSearchParams,
  next: ChamberKey | null,
): string {
  const params = new URLSearchParams(current.toString());
  if (next) params.set("chamber", next);
  else params.delete("chamber");
  params.delete("expanded");
  params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function ChamberToggle({
  current,
  basePath,
  currentParams,
}: {
  current: ChamberKey | undefined;
  basePath: string;
  currentParams: URLSearchParams;
}) {
  return (
    <div
      role="group"
      aria-label="Chamber"
      className="inline-flex overflow-hidden rounded-sm border"
      style={{ borderColor: "var(--border-strong)" }}
    >
      {SEGMENTS.map((seg, i) => {
        const isOn = (current ?? null) === seg.key;
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
            key={seg.label}
            href={href}
            scroll={false}
            className={className}
            style={{
              ...style,
              borderColor: "var(--border-strong)",
            }}
          >
            {seg.label}
          </Link>
        );
      })}
    </div>
  );
}
