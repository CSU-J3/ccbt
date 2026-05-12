import { topicColor, topicLabel, topicTitle } from "@/lib/topic-colors";

export function TopicTags({
  topics,
  responsive = false,
}: {
  topics: string[];
  responsive?: boolean;
}) {
  if (topics.length === 0) return null;

  const desktop = (
    <span className="inline-flex items-center gap-0.5 text-[13px] uppercase tracking-[0.5px]">
      {topics.map((t, i) => (
        <span key={t}>
          <span style={{ color: topicColor(t) }} title={topicTitle(t)}>
            {topicLabel(t)}
          </span>
          {i < topics.length - 1 ? (
            <span style={{ color: "var(--text-dim)" }}> · </span>
          ) : null}
        </span>
      ))}
    </span>
  );

  if (!responsive) return desktop;

  const first = topics[0]!;
  const extra = topics.length - 1;
  const extraTitles = topics
    .slice(1)
    .map((t) => topicTitle(t))
    .join(", ");
  return (
    <span className="min-w-0 truncate">
      <span className="show-desktop">{desktop}</span>
      <span className="show-mobile text-[13px] uppercase tracking-[0.5px]">
        <span style={{ color: topicColor(first) }} title={topicTitle(first)}>
          {topicLabel(first)}
        </span>
        {extra > 0 ? (
          <span style={{ color: "var(--text-dim)" }} title={extraTitles}>
            {" "}
            +{extra}
          </span>
        ) : null}
      </span>
    </span>
  );
}
