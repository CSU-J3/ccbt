import Link from "next/link";
import { ALLOWED_TOPICS } from "@/lib/enums";
import { topicColor, topicLabel, topicTitle } from "@/lib/topic-colors";

function buildHref(
  basePath: string,
  current: URLSearchParams,
  selected: string[],
  topic: string,
): string {
  const has = selected.includes(topic);
  const next = has ? selected.filter((t) => t !== topic) : [...selected, topic];
  const params = new URLSearchParams(current.toString());
  if (next.length > 0) params.set("topics", next.join(","));
  else params.delete("topics");
  params.delete("expanded");
  params.delete("page");
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function TopicFilter({
  selected,
  basePath = "/",
  currentParams,
}: {
  selected: string[];
  basePath?: string;
  currentParams: URLSearchParams;
}) {
  return (
    <div className="filter-chips flex items-center gap-1">
      {ALLOWED_TOPICS.map((t) => {
        const isOn = selected.includes(t);
        const href = buildHref(basePath, currentParams, selected, t);
        const color = topicColor(t);
        const style = isOn
          ? { backgroundColor: color, color: "#0a0e14", borderColor: color }
          : { color, borderColor: color };
        return (
          <Link
            key={t}
            href={href}
            scroll={false}
            title={topicTitle(t)}
            className="rounded-sm border px-1.5 py-0.5 text-[12px] font-medium uppercase tracking-[0.5px] transition"
            style={style}
          >
            {topicLabel(t)}
          </Link>
        );
      })}
    </div>
  );
}
