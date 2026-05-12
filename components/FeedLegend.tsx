export function FeedLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1.5 text-[11px] uppercase tracking-[0.5px]"
      style={{ color: "var(--text-dim)" }}
    >
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-2 w-2"
          style={{ backgroundColor: "var(--party-republican)" }}
        />
        R
      </span>
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-2 w-2"
          style={{ backgroundColor: "var(--party-democrat)" }}
        />
        D
      </span>
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="inline-block h-2 w-2"
          style={{ backgroundColor: "var(--party-independent)" }}
        />
        I
      </span>
      <span style={{ color: "var(--border-strong)" }}>|</span>
      <span style={{ color: "var(--stage-introduced)" }}>▸ INTRO</span>
      <span style={{ color: "var(--text-dim)" }}>·</span>
      <span style={{ color: "var(--stage-in-committee)" }}>▸ COMMITTEE</span>
      <span style={{ color: "var(--text-dim)" }}>·</span>
      <span style={{ color: "var(--stage-passed-first-chamber)" }}>
        ▸▸ PASSED 1ST
      </span>
      <span style={{ color: "var(--text-dim)" }}>·</span>
      <span style={{ color: "var(--stage-passed-second-chamber)" }}>
        ▸▸▸ PASSED BOTH
      </span>
      <span style={{ color: "var(--text-dim)" }}>·</span>
      <span style={{ color: "var(--stage-signed)" }}>✓ SIGNED</span>
      <span style={{ color: "var(--text-dim)" }}>·</span>
      <span style={{ color: "var(--stage-vetoed)" }}>✗ VETOED</span>
      <span style={{ color: "var(--text-dim)" }}>·</span>
      <span style={{ color: "var(--stage-dead)" }}>— DEAD</span>
    </div>
  );
}
