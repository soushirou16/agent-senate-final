import { type ConditionKey, type QuestionItem } from "@/lib/types";

export interface CuratedTopicConfig {
  /** 8 question IDs, best across all conditions — same bank used for every condition slot */
  bank: string[];
}

export const CURATED_QUESTIONS: Record<string, CuratedTopicConfig> = {
  "data-privacy": {
    bank: ["data-privacy-180","data-privacy-80","data-privacy-95","data-privacy-176",
           "data-privacy-188","data-privacy-33","data-privacy-110","data-privacy-51"],
  },
  "fast-deployment": {
    bank: ["fast-deployment-161","fast-deployment-22","fast-deployment-51","fast-deployment-126",
           "fast-deployment-147","fast-deployment-20","fast-deployment-23","fast-deployment-41"],
  },
  "free-choice": {
    bank: ["free-choice-63","free-choice-39","free-choice-171","free-choice-174",
           "free-choice-209","free-choice-32","free-choice-96","free-choice-195"],
  },
  "immediate-support": {
    bank: ["immediate-support-89","immediate-support-181","immediate-support-66","immediate-support-71",
           "immediate-support-78","immediate-support-93","immediate-support-173","immediate-support-213"],
  },
  "individual-rights": {
    bank: ["individual-rights-2","individual-rights-11","individual-rights-87","individual-rights-128",
           "individual-rights-15","individual-rights-63","individual-rights-171","individual-rights-183"],
  },
  "institutional-confidence": {
    bank: ["institutional-confidence-71","institutional-confidence-74","institutional-confidence-132",
           "institutional-confidence-161","institutional-confidence-62","institutional-confidence-66",
           "institutional-confidence-92","institutional-confidence-216"],
  },
  "personal-agency": {
    bank: ["personal-agency-214","personal-agency-80","personal-agency-200","personal-agency-70",
           "personal-agency-29","personal-agency-101","personal-agency-167","personal-agency-186"],
  },
  "public-safety": {
    bank: ["public-safety-2","public-safety-119","public-safety-179","public-safety-26",
           "public-safety-141","public-safety-177","public-safety-23","public-safety-45"],
  },
  "rule-consistency": {
    bank: ["rule-consistency-3","rule-consistency-78","rule-consistency-84","rule-consistency-95",
           "rule-consistency-16","rule-consistency-89","rule-consistency-106","rule-consistency-81"],
  },
  "self-expression": {
    bank: ["self-expression-116","self-expression-73","self-expression-67","self-expression-128",
           "self-expression-146","self-expression-117","self-expression-38","self-expression-95"],
  },
};

/**
 * Picks a question from the curated bank for a given topic and condition.
 * `seed` should be a stable 0–1 float per session (e.g. from useState(() => Math.random())).
 * Each condition slot gets a different offset so all four samples show different questions.
 */
export function findCuratedQuestion(
  questions: QuestionItem[],
  topicSlug: string,
  condition: ConditionKey,
  seed: number
): QuestionItem | undefined {
  const config = CURATED_QUESTIONS[topicSlug];
  if (!config) return questions[0];

  // Each condition uses a different offset so the four samples don't all pick the same question
  const conditionOffset: Record<ConditionKey, number> = {
    single_no_role: 0,
    single_role:    2,
    debate_no_role: 4,
    debate_role:    6,
  };

  const bank      = config.bank;
  const offset    = conditionOffset[condition];
  const idx       = (Math.floor(seed * bank.length) + offset) % bank.length;
  const targetId  = bank[idx];

  return questions.find((q) => q.id === targetId) ?? questions[0];
}
