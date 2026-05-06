const STAGE_PREFIX: Record<string, string> = {
  introduced: "▸",
  in_committee: "▸",
  passed_first_chamber: "▸▸",
  passed_second_chamber: "▸▸▸",
  signed: "✓",
  vetoed: "✗",
  dead: "—",
};

const STAGE_LABEL: Record<string, string> = {
  introduced: "INTRO",
  in_committee: "COMMITTEE",
  passed_first_chamber: "PASSED 1ST",
  passed_second_chamber: "PASSED BOTH",
  signed: "SIGNED",
  vetoed: "VETOED",
  dead: "DEAD",
};

const STAGE_LABEL_SHORT: Record<string, string> = {
  introduced: "INTRO",
  in_committee: "COMM",
  passed_first_chamber: "P-1ST",
  passed_second_chamber: "P-BOTH",
  signed: "SIGN",
  vetoed: "VETO",
  dead: "DEAD",
};

const STAGE_COLOR: Record<string, string> = {
  introduced: "var(--stage-introduced)",
  in_committee: "var(--stage-in-committee)",
  passed_first_chamber: "var(--stage-passed-first-chamber)",
  passed_second_chamber: "var(--stage-passed-second-chamber)",
  signed: "var(--stage-signed)",
  vetoed: "var(--stage-vetoed)",
  dead: "var(--stage-dead)",
};

export function StageIndicator({
  stage,
  responsive = false,
}: {
  stage: string | null;
  responsive?: boolean;
}) {
  if (!stage) return null;
  const prefix = STAGE_PREFIX[stage] ?? "▸";
  const full = STAGE_LABEL[stage] ?? stage.toUpperCase();
  const short = STAGE_LABEL_SHORT[stage] ?? full;
  const color = STAGE_COLOR[stage] ?? "var(--text-muted)";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.5px]"
      style={{ color }}
    >
      <span aria-hidden>{prefix}</span>
      {responsive ? (
        <>
          <span className="show-desktop">{full}</span>
          <span className="show-mobile">{short}</span>
        </>
      ) : (
        <span>{full}</span>
      )}
    </span>
  );
}
