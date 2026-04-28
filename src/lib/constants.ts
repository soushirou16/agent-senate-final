import { type ConditionKey, type FilterState } from "@/lib/types";

export const DEFAULT_FILTERS: FilterState = {
  runMode: "all",
  roleMode: "all",
  topicSlug: "all",
  spectrum: "all",
  agent: "all",
  role: "all",
};

export const CONDITION_LABELS: Record<ConditionKey, string> = {
  single_no_role: "Single, No Role",
  single_role: "Single, Role",
  debate_no_role: "Debate, No Role",
  debate_role: "Debate, Role",
};

export const AGENT_ORDER = ["ChatGPT", "Claude", "Gemini", "Grok"] as const;

export const CONDITION_ORDER: ConditionKey[] = [
  "single_no_role",
  "single_role",
  "debate_no_role",
  "debate_role",
];
