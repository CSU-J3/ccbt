import type { Stage } from "./enums";

export type Action = {
  classification?: string[] | null;
  description?: string | null;
  date?: string | null;
};

const DEAD_CLASSIFICATIONS = new Set<string>([
  "withdrawal",
  "failure",
]);

const DEAD_TEXT_PATTERNS: RegExp[] = [
  /postponed\s+indefinitely/i,
  /\blost\b/i,
];

function actionHasClassification(action: Action, target: string): boolean {
  return (action.classification ?? []).includes(target);
}

function anyClassification(actions: Action[], target: string): boolean {
  for (const a of actions) if (actionHasClassification(a, target)) return true;
  return false;
}

function countClassification(actions: Action[], target: string): number {
  let n = 0;
  for (const a of actions) if (actionHasClassification(a, target)) n++;
  return n;
}

function hasDeadIndicator(actions: Action[]): boolean {
  for (const a of actions) {
    for (const c of a.classification ?? []) {
      if (DEAD_CLASSIFICATIONS.has(c)) return true;
    }
    const desc = a.description ?? "";
    if (!desc) continue;
    for (const pat of DEAD_TEXT_PATTERNS) {
      if (pat.test(desc)) return true;
    }
  }
  return false;
}

export function stageFromActions(
  actions: Action[] | null | undefined,
  billId?: string,
): Stage {
  if (!actions || actions.length === 0) return "introduced";

  if (hasDeadIndicator(actions)) return "dead";

  const hasSignature = anyClassification(actions, "executive-signature");
  const hasVeto = anyClassification(actions, "executive-veto");

  if (hasSignature && hasVeto) {
    const classifications = actions
      .map((a) => (a.classification ?? []).join("|"))
      .filter(Boolean)
      .join(", ");
    console.warn(
      `stage-conflict ${billId ?? "(unknown bill)"}: executive-signature AND executive-veto present — assuming signed (override succeeded). classifications=[${classifications}]`,
    );
  }

  if (hasSignature) return "signed";
  if (hasVeto) return "vetoed";

  const passages = countClassification(actions, "passage");
  if (passages >= 2) return "passed_second_chamber";
  if (passages >= 1) return "passed_first_chamber";

  if (anyClassification(actions, "referral-committee")) return "in_committee";

  return "introduced";
}
