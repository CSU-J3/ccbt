import Link from "next/link";
import { ExpandedPanel } from "@/components/ExpandedPanel";
import { PartyTag } from "@/components/PartyTag";
import { StageIndicator } from "@/components/StageIndicator";
import { TopicTags } from "@/components/TopicTags";
import {
  formatBillId,
  formatDateShort,
  parseTopics,
} from "@/lib/format";
import type { FeedBill } from "@/lib/queries";

export type BillRowFilters = {
  topics: string[];
  stage: string | undefined;
  q?: string;
  sort?: string;
  chamber?: string;
  page?: number;
  sponsor?: string;
};

function shortSponsor(name: string | null): string {
  if (!name) return "";
  const noPrefix = name.replace(/^(Rep\.|Sen\.|Del\.|Res\.)\s*/i, "").trim();
  const lastName = noPrefix.split(",")[0]?.trim();
  return lastName ?? noPrefix;
}

export function BillRow({
  bill,
  filters,
  basePath,
  expandedId,
  onWatchlist,
  introducedDate,
}: {
  bill: FeedBill;
  filters: BillRowFilters;
  basePath: string;
  expandedId: string | undefined;
  onWatchlist: boolean;
  introducedDate: string | null;
}) {
  const isExpanded = expandedId === bill.id;
  const topics = parseTopics(bill.topics);

  const params = new URLSearchParams();
  if (filters.topics.length > 0) params.set("topics", filters.topics.join(","));
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.q) params.set("q", filters.q);
  if (filters.sort && filters.sort !== "action")
    params.set("sort", filters.sort);
  if (filters.chamber) params.set("chamber", filters.chamber);
  if (filters.sponsor) params.set("sponsor", filters.sponsor);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (!isExpanded) params.set("expanded", bill.id);
  const qs = params.toString();
  const href = qs ? `${basePath}?${qs}` : basePath;

  return (
    <li>
      <Link
        href={href}
        replace
        scroll={false}
        prefetch={false}
        className={`feed-row ${isExpanded ? "is-expanded" : ""}`}
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
          className="text-[15px] font-medium"
          style={{ color: "var(--accent-amber)" }}
        >
          {formatBillId(bill)}
        </span>
        <span className="min-w-0 truncate text-[15px]">
          <span style={{ color: "var(--text-primary)" }}>{bill.title}</span>
          {bill.sponsor_name ? (
            <>
              <span style={{ color: "var(--text-dim)" }}> · </span>
              <span style={{ color: "var(--text-muted)" }}>
                {shortSponsor(bill.sponsor_name)}
              </span>
              {bill.sponsor_party || bill.sponsor_district ? (
                <>
                  {" "}
                  <span className="inline-block shrink-0 align-baseline">
                    <PartyTag
                      party={bill.sponsor_party}
                      district={bill.sponsor_district}
                    />
                  </span>
                </>
              ) : null}
            </>
          ) : null}
        </span>
        <span>
          <StageIndicator stage={bill.stage} responsive />
        </span>
        <span
          className="col-date text-[14px]"
          style={{ color: "var(--text-dim)" }}
        >
          {formatDateShort(bill.latest_action_date)}
        </span>
        <span>
          <TopicTags topics={topics} responsive />
        </span>
      </Link>
      {isExpanded ? (
        <ExpandedPanel
          bill={bill}
          onWatchlist={onWatchlist}
          introducedDate={introducedDate}
        />
      ) : null}
    </li>
  );
}
