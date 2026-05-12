export const ALLOWED_TOPICS = [
  "healthcare",
  "taxes",
  "energy",
  "environment",
  "education",
  "labor",
  "technology",
  "civil_rights",
  "criminal_justice",
  "agriculture",
  "housing",
  "transportation",
  "veterans",
  "elections",
  "budget",
  "financial_services",
  "consumer_protection",
  "government_operations",
  "public_safety",
  "licensing",
  "municipal_affairs",
  "cannabis",
  "water",
  "immigration",
  "other",
] as const;

export type Topic = (typeof ALLOWED_TOPICS)[number];
export const ALLOWED_TOPICS_SET = new Set<string>(ALLOWED_TOPICS);

export const ALLOWED_STAGES = [
  "introduced",
  "in_committee",
  "passed_first_chamber",
  "passed_second_chamber",
  "signed",
  "vetoed",
  "dead",
] as const;

export type Stage = (typeof ALLOWED_STAGES)[number];
export const ALLOWED_STAGES_SET = new Set<string>(ALLOWED_STAGES);

export const HOUSE_BILL_TYPES = ["hb", "hcr", "hjr", "hjm", "hm", "hr"] as const;
export const SENATE_BILL_TYPES = ["sb", "scr", "sjr", "sjm", "sm", "sr"] as const;
export const ALL_BILL_TYPES = [
  ...HOUSE_BILL_TYPES,
  ...SENATE_BILL_TYPES,
] as const;
