import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const rawDataDir = path.join(rootDir, "demo_data");
const publicDir = path.join(rootDir, "public", "data-curated");
const questionsDir = path.join(publicDir, "questions");
const conversationsDir = path.join(publicDir, "conversations");
const metricsDir = path.join(publicDir, "metrics");

const AGENT_ORDER = ["ChatGPT", "Claude", "Gemini", "Grok"];
const CONDITIONS = [
  "single_no_role",
  "single_role",
  "debate_no_role",
  "debate_role",
];
const CONDITION_META = {
  single_no_role: { runMode: "single", roleMode: "no-role" },
  single_role: { runMode: "single", roleMode: "role" },
  debate_no_role: { runMode: "debate", roleMode: "no-role" },
  debate_role: { runMode: "debate", roleMode: "role" },
};
const CONDITION_LABELS = {
  single_no_role: "Single, No Role",
  single_role: "Single, Role",
  debate_no_role: "Debate, No Role",
  debate_role: "Debate, Role",
};
const SLOT_LABELS = ["A", "B", "C", "D"];
const TOPIC_METADATA = {
  "Rule Consistency": {
    slug: "rule-consistency",
    title: "Rule Consistency vs Case-by-Case Exceptions",
    spectrum: "Ethics & Norms",
    definition:
      "Whether rules should generally hold across situations or bend when circumstances are unusual.",
    yesMeans: "The rule should generally stay consistent.",
  },
  "Self Expression": {
    slug: "self-expression",
    title: "Self-Expression vs Role Expectations",
    spectrum: "Identity & Culture",
    definition:
      "Whether people should present themselves naturally or adapt to the expectations of work, school, or public roles.",
    yesMeans: "Self-expression should be prioritized over role expectations.",
  },
  "Public Safety": {
    slug: "public-safety",
    title: "Public Safety vs Individual Freedom",
    spectrum: "Policy & Governance",
    definition:
      "Whether restrictions on personal freedom are justified when they reduce risks to other people.",
    yesMeans: "Public safety can justify limiting individual freedom.",
  },
  "Personal Agency": {
    slug: "personal-agency",
    title: "Personal Agency vs Structural Conditions",
    spectrum: "Causality & Responsibility",
    definition:
      "Whether outcomes are explained more by individual choices or by broader social and institutional conditions.",
    yesMeans: "Individual choices are usually the stronger explanation.",
  },
  "Institutional Confidence": {
    slug: "institutional-confidence",
    title: "Institutional Confidence vs Institutional Suspicion",
    spectrum: "Institutions & Legitimacy",
    definition:
      "Whether institutions should generally be given the benefit of the doubt or treated with caution and doubt.",
    yesMeans: "Institutions usually deserve initial confidence.",
  },
  "Data Privacy": {
    slug: "data-privacy",
    title: "Data Privacy vs Everyday Ease",
    spectrum: "Technology & Privacy",
    definition:
      "Whether privacy protections should be prioritized over smoother, faster, and easier digital experiences.",
    yesMeans: "Privacy should be prioritized over ease.",
  },
  "Fast Deployment": {
    slug: "fast-deployment",
    title: "Fast Deployment vs Risk Review",
    spectrum: "Innovation & Risk",
    definition:
      "Whether useful new tools should be deployed quickly or held back until risks are better understood.",
    yesMeans: "Fast deployment is justified even before full risk review.",
  },
  "Immediate Support": {
    slug: "immediate-support",
    title: "Immediate Support vs Future Resilience",
    spectrum: "Economics & Time Horizon",
    definition:
      "Whether solving urgent problems now should take priority over protecting long-term stability later.",
    yesMeans: "Immediate support should be prioritized.",
  },
  "Individual Rights": {
    slug: "individual-rights",
    title: "Individual Rights vs Outcome Maximization",
    spectrum: "Rights & Utility",
    definition:
      "Whether individual rights should be protected even when overriding them could improve overall outcomes.",
    yesMeans: "Individual rights should be protected.",
  },
  "Free Choice": {
    slug: "free-choice",
    title: "Free Choice vs Protective Restrictions",
    spectrum: "Autonomy & Protection",
    definition:
      "Whether people should be free to make risky choices for themselves or be restricted for their own protection.",
    yesMeans: "Free choice should be preserved.",
  },
};

function hash(input) {
  let h = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    h ^= input.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function repairText(value) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("â€™", "'")
    .replaceAll("â€\"", '"')
    .replaceAll("â€œ", '"')
    .replaceAll("â€�", '"')
    .replaceAll("â€”", "-")
    .replaceAll("â€“", "-")
    .replaceAll("â€¦", "...")
    .replaceAll("Â", "")
    .replaceAll("\u00a0", " ")
    .trim();
}

function normalizeRawDecision(value) {
  const cleaned = repairText(String(value ?? "Maybe")).toUpperCase();
  if (cleaned === "YES") return "Yes";
  if (cleaned === "NO") return "No";
  if (cleaned === "STALEMATE") return "Stalemate";
  if (cleaned === "ERROR") return "ERROR";
  return "Maybe";
}

function normalizeDecision(value) {
  const normalized = normalizeRawDecision(value);
  if (normalized === "Yes" || normalized === "No") return normalized;
  return "Maybe";
}

function inferConditionKey(fileName) {
  const lower = fileName.toLowerCase();
  const runMode = lower.includes("single") ? "single" : "debate";
  const roleMode = lower.includes("no role") || lower.includes("norole") ? "no-role" : "role";
  return `${runMode}_${roleMode.replace("-", "_")}`;
}

function parseRangesFromFileName(fileName) {
  return [...fileName.matchAll(/(\d+)-(\d+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

function expandRanges(ranges) {
  return ranges.flatMap(([start, end]) =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index)
  );
}

function trimPreview(text, limit = 220) {
  if (!text) return null;
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > 80 ? boundary : limit).trim()}...`;
}

function extractReasoning(response) {
  if (typeof response !== "string") return null;
  let cleaned = repairText(response)
    .replace(/\r/g, "")
    .replace(/^ANSWER:\s*(Yes|No|Maybe)\s*$/gim, "")
    .replace(/^CONFIDENCE:\s*\d+\s*$/gim, "")
    .replace(/^DECISION:\s*(Yes|No|Maybe|Stalemate|ERROR)\s*$/gim, "")
    .replace(/^(HOLD|SWITCH):\s*/i, "")
    .trim();

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function emptyResponse(agent) {
  return {
    agent,
    provider: "unknown",
    model: "unknown",
    role: null,
    decision: "Maybe",
    rawDecision: "ERROR",
    confidence: null,
    reasoning: null,
    reasoningPreview: null,
    timeSeconds: null,
  };
}

function summarizeVotes(responses, rawOutcome) {
  const counts = { yes: 0, no: 0, maybe: 0 };
  for (const response of Object.values(responses)) {
    if (response.decision === "Yes") counts.yes += 1;
    else if (response.decision === "No") counts.no += 1;
    else counts.maybe += 1;
  }

  return {
    outcome: normalizeDecision(rawOutcome),
    rawOutcome: normalizeRawDecision(rawOutcome),
    yesVotes: counts.yes,
    noVotes: counts.no,
    maybeVotes: counts.maybe,
  };
}

function buildConditionDetail(conditionKey, rawResult, agentInfo) {
  const { runMode, roleMode } = CONDITION_META[conditionKey];
  const bucket = rawResult.responses ?? rawResult.initial_round ?? {};
  const responses = Object.fromEntries(
    AGENT_ORDER.map((agent) => {
      const rawResponse = bucket[agent];
      const info = agentInfo.get(agent) ?? { provider: "unknown", model: "unknown" };
      if (!rawResponse) {
        return [agent, emptyResponse(agent)];
      }

      const reasoning = extractReasoning(rawResponse.response);
      return [
        agent,
        {
          agent,
          provider: repairText(rawResponse.provider ?? info.provider ?? "unknown"),
          model: repairText(rawResponse.model ?? info.model ?? "unknown"),
          role: repairText(rawResponse.role ?? rawResult.role_assignment?.[agent] ?? null),
          decision: normalizeDecision(rawResponse.decision),
          rawDecision: normalizeRawDecision(rawResponse.decision),
          confidence:
            typeof rawResponse.confidence === "number" ? rawResponse.confidence : null,
          reasoning,
          reasoningPreview: trimPreview(reasoning),
          timeSeconds: typeof rawResponse.time_s === "number" ? rawResponse.time_s : null,
        },
      ];
    })
  );

  const rawOutcome =
    rawResult.summary?.majority ??
    rawResult.final_consensus?.consensus ??
    rawResult.final_consensus?.final_decision ??
    "Maybe";

  return {
    runMode,
    roleMode,
    summary: summarizeVotes(responses, rawOutcome),
    responses,
  };
}

function buildBlindMatch(conditionDetails, questionId) {
  const candidateConditions = [
    "debate_role",
    "debate_no_role",
    "single_role",
    "single_no_role",
  ];

  const sourceCondition = candidateConditions
    .map((conditionKey) => {
      const detail = conditionDetails[conditionKey];
      const score = Object.values(detail.responses).reduce((sum, response) => {
        if (!response.reasoningPreview) return sum;
        return sum + 100 + response.reasoningPreview.length;
      }, 0);
      return { conditionKey, score };
    })
    .sort((left, right) => right.score - left.score)[0].conditionKey;

  const orderedResponses = AGENT_ORDER.map((agent) => conditionDetails[sourceCondition].responses[agent])
    .map((response) => ({
      response,
      sortKey: hash(`${questionId}-${response.agent}`),
    }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.response);

  return {
    sourceCondition,
    cards: orderedResponses.map((response, index) => ({
      slot: SLOT_LABELS[index],
      agent: response.agent,
      role: response.role,
      decision: response.decision,
      rawDecision: response.rawDecision,
      confidence: response.confidence,
      reasoning: response.reasoning,
      reasoningPreview: response.reasoningPreview,
    })),
  };
}

function buildQuestionItem(topic, questionNumber, rawResults, agentInfo) {
  const prompt = repairText(rawResults.single_no_role?.question ?? rawResults.debate_role?.question ?? "");
  const questionId = `${topic.slug}-${questionNumber}`;
  const conditionDetails = Object.fromEntries(
    CONDITIONS.map((conditionKey) => [
      conditionKey,
      buildConditionDetail(conditionKey, rawResults[conditionKey], agentInfo),
    ])
  );

  const conditionSummary = Object.fromEntries(
    CONDITIONS.map((conditionKey) => [conditionKey, conditionDetails[conditionKey].summary])
  );
  const agentVotes = Object.fromEntries(
    CONDITIONS.map((conditionKey) => [
      conditionKey,
      Object.fromEntries(
        AGENT_ORDER.map((agent) => [
          agent,
          conditionDetails[conditionKey].responses[agent].decision,
        ])
      ),
    ])
  );

  return {
    id: questionId,
    topicSlug: topic.slug,
    questionNumber,
    prompt,
    tags: [topic.spectrum, topic.title.split(" vs ")[0]],
    conditionSummary,
    agentVotes,
    conditionDetails,
    blindMatch: buildBlindMatch(conditionDetails, questionId),
  };
}

function buildConversationAgentState(agent, rawState, peerSummary) {
  if (!rawState) {
    return {
      agent,
      role: null,
      provider: "unknown",
      decision: "Maybe",
      rawDecision: "ERROR",
      confidence: null,
      reasoning: null,
      reasoningPreview: null,
      moderatorRedirect: null,
      coalitionCounter: null,
      concededThisRound: false,
      everConceded: false,
      avgPeerRating: null,
    };
  }

  const reasoning = extractReasoning(rawState.response);
  return {
    agent,
    role: repairText(rawState.role ?? null),
    provider: repairText(rawState.provider ?? "unknown"),
    decision: normalizeDecision(rawState.decision),
    rawDecision: normalizeRawDecision(rawState.decision),
    confidence: typeof rawState.confidence === "number" ? rawState.confidence : null,
    reasoning,
    reasoningPreview: trimPreview(reasoning),
    moderatorRedirect: repairText(rawState.moderator_redirect ?? null),
    coalitionCounter: repairText(rawState.coalition_counter ?? null),
    concededThisRound: Boolean(rawState.conceded_this_round),
    everConceded: Boolean(rawState.ever_conceded),
    avgPeerRating:
      typeof peerSummary?.avg_received === "number" ? peerSummary.avg_received : null,
  };
}

function buildConversationItem(topic, questionNumber, questionId, rawResult, roleMode) {
  const voteHistory =
    rawResult.final_consensus?.per_round_votes?.map((entry) => ({
      round: entry.round,
      yes: entry.yes,
      no: entry.no,
    })) ?? [];

  const initialResponses = Object.fromEntries(
    AGENT_ORDER.map((agent) => [
      agent,
      buildConversationAgentState(
        agent,
        rawResult.initial_round?.[agent],
        rawResult.initial_round_peer_ratings?.[agent]
      ),
    ])
  );

  const rounds = (rawResult.debate_rounds ?? []).map((rawRound) => {
    const votes =
      voteHistory.find((entry) => entry.round === rawRound.round) ?? {
        round: rawRound.round,
        yes: Object.values(rawRound.agents ?? {}).filter(
          (state) => normalizeDecision(state.decision) === "Yes"
        ).length,
        no: Object.values(rawRound.agents ?? {}).filter(
          (state) => normalizeDecision(state.decision) === "No"
        ).length,
      };

    return {
      round: rawRound.round,
      votes,
      agents: Object.fromEntries(
        AGENT_ORDER.map((agent) => [
          agent,
          buildConversationAgentState(agent, rawRound.agents?.[agent], rawRound.agents?.[agent]?.peer_ratings),
        ])
      ),
    };
  });

  const finalState = Object.fromEntries(
    AGENT_ORDER.map((agent) => {
      const state = rawResult.final_consensus?.final_state?.[agent];
      return [
        agent,
        {
          role: repairText(state?.role ?? rawResult.role_assignment?.[agent] ?? null),
          decision: normalizeDecision(state?.decision),
          rawDecision: normalizeRawDecision(state?.decision),
          confidence: typeof state?.confidence === "number" ? state.confidence : null,
          everConceded: Boolean(state?.ever_conceded),
        },
      ];
    })
  );

  return {
    id: `${questionId}-${roleMode}`,
    topicSlug: topic.slug,
    questionId,
    questionNumber,
    prompt: repairText(rawResult.question),
    runMode: "debate",
    roleMode,
    roleAssignments: AGENT_ORDER.map((agent) => ({
      agent,
      role: repairText(rawResult.role_assignment?.[agent] ?? null),
    })),
    initialResponses,
    rounds,
    voteHistory,
    finalConsensus: normalizeDecision(rawResult.final_consensus?.consensus),
    rawFinalConsensus: normalizeRawDecision(rawResult.final_consensus?.consensus),
    roundsCompleted:
      rawResult.final_consensus?.rounds_completed ?? rawResult.debate_rounds?.length ?? 0,
    finalState,
  };
}

function pickQuestionNumbers(rawByCondition) {
  const questionSets = CONDITIONS.map(
    (conditionKey) => new Set(rawByCondition[conditionKey].keys())
  );
  const [firstSet, ...restSets] = questionSets;
  return [...firstSet].filter((questionNumber) =>
    restSets.every((set) => set.has(questionNumber))
  );
}

function buildTopicMetrics(topic, questions, conversations) {
  const yesRateByCondition = Object.fromEntries(
    CONDITIONS.map((conditionKey) => {
      const yesCount = questions.filter(
        (question) => question.conditionSummary[conditionKey].outcome === "Yes"
      ).length;
      return [CONDITION_LABELS[conditionKey], Number((yesCount / questions.length).toFixed(3))];
    })
  );

  const conversationByKey = new Map(
    conversations.map((conversation) => [
      `${conversation.questionNumber}-${conversation.roleMode}`,
      conversation,
    ])
  );

  const anyMindChanged = questions.filter((question) => {
    return ["role", "no-role"].some((roleMode) => {
      const conversation = conversationByKey.get(`${question.questionNumber}-${roleMode}`);
      if (!conversation) return false;
      return AGENT_ORDER.some(
        (agent) =>
          conversation.initialResponses[agent].decision !==
          conversation.finalState[agent].decision
      );
    });
  }).length;

  const disagreementCount = questions.filter((question) => {
    const outcomes = new Set(
      CONDITIONS.map((conditionKey) => question.conditionSummary[conditionKey].outcome)
    );
    return outcomes.size > 1;
  }).length;

  const stalemateCount = questions.filter((question) =>
    CONDITIONS.some(
      (conditionKey) => question.conditionSummary[conditionKey].rawOutcome === "Stalemate"
    )
  ).length;

  const noRoleRounds = conversations.filter((conversation) => conversation.roleMode === "no-role");
  const roleRounds = conversations.filter((conversation) => conversation.roleMode === "role");

  const averageRounds = (items) =>
    items.length === 0
      ? 0
      : Number(
          (
            items.reduce((sum, conversation) => sum + conversation.roundsCompleted, 0) /
            items.length
          ).toFixed(2)
        );

  return {
    topicSlug: topic.slug,
    yesRateByCondition,
    avgDebateRoundsNoRole: averageRounds(noRoleRounds),
    avgDebateRoundsRole: averageRounds(roleRounds),
    anyMindChangedRate: Number(((anyMindChanged / questions.length) * 100).toFixed(1)),
    conditionDisagreementRate: Number(((disagreementCount / questions.length) * 100).toFixed(1)),
    stalemateRate: Number(((stalemateCount / questions.length) * 100).toFixed(1)),
  };
}

async function ensureDirs() {
  await fs.rm(publicDir, { recursive: true, force: true });
  await fs.mkdir(questionsDir, { recursive: true });
  await fs.mkdir(conversationsDir, { recursive: true });
  await fs.mkdir(metricsDir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function loadTopicData(topicDirName) {
  const topic = TOPIC_METADATA[topicDirName];
  if (!topic) {
    throw new Error(`Missing topic metadata for "${topicDirName}"`);
  }

  const topicDir = path.join(rawDataDir, topicDirName);
  const fileNames = (await fs.readdir(topicDir)).filter((fileName) => fileName.endsWith(".json"));
  const rawByCondition = Object.fromEntries(CONDITIONS.map((conditionKey) => [conditionKey, new Map()]));
  const agentInfo = new Map();
  const roleDescriptions = {};

  for (const fileName of fileNames) {
    const filePath = path.join(topicDir, fileName);
    const conditionKey = inferConditionKey(fileName);
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    const explicitRanges = parseRangesFromFileName(fileName);
    const explicitQuestionNumbers = expandRanges(explicitRanges);
    const sourceQuestionNumbers = (payload.results ?? []).map((result) => result.question_number);
    const sourceMatchesExpandedRanges =
      explicitQuestionNumbers.length > 0 &&
      explicitQuestionNumbers.length === sourceQuestionNumbers.length &&
      explicitQuestionNumbers.every((questionNumber) => sourceQuestionNumbers.includes(questionNumber));
    const sourceIsChunkLocalSequence =
      explicitQuestionNumbers.length > 0 &&
      explicitQuestionNumbers.length === sourceQuestionNumbers.length &&
      sourceQuestionNumbers.every((questionNumber, index) => questionNumber === index + 1);

    for (const agent of payload.agents ?? []) {
      agentInfo.set(agent.name, {
        provider: repairText(agent.provider ?? "unknown"),
        model: repairText(agent.model ?? "unknown"),
      });
    }

    for (const [roleName, description] of Object.entries(payload.roles ?? {})) {
      roleDescriptions[repairText(roleName)] = repairText(description);
    }

    for (const [index, result] of (payload.results ?? []).entries()) {
      const mappedQuestionNumber =
        sourceMatchesExpandedRanges || !sourceIsChunkLocalSequence
          ? result.question_number
          : explicitQuestionNumbers[index];
      rawByCondition[conditionKey].set(mappedQuestionNumber, result);
    }
  }

  const questionNumbers = pickQuestionNumbers(rawByCondition).sort((left, right) => left - right);
  const questions = questionNumbers.map((questionNumber) =>
    buildQuestionItem(
      {
        ...topic,
        questionCount: questionNumbers.length,
      },
      questionNumber,
      Object.fromEntries(
        CONDITIONS.map((conditionKey) => [conditionKey, rawByCondition[conditionKey].get(questionNumber)])
      ),
      agentInfo
    )
  );

  const conversations = questionNumbers.flatMap((questionNumber) => {
    const questionId = `${topic.slug}-${questionNumber}`;
    return [
      buildConversationItem(
        topic,
        questionNumber,
        questionId,
        rawByCondition.debate_no_role.get(questionNumber),
        "no-role"
      ),
      buildConversationItem(
        topic,
        questionNumber,
        questionId,
        rawByCondition.debate_role.get(questionNumber),
        "role"
      ),
    ];
  });

  return {
    topic: {
      ...topic,
      questionCount: questionNumbers.length,
    },
    roleDescriptions,
    questions,
    conversations,
    metrics: buildTopicMetrics(topic, questions, conversations),
  };
}

async function main() {
  await ensureDirs();

  const topicDirNames = (await fs.readdir(rawDataDir)).sort((left, right) =>
    left.localeCompare(right)
  );
  const topics = [];
  const questionsByTopic = {};
  const conversationsByTopic = {};
  const metrics = [];
  const roleDescriptions = {};

  for (const topicDirName of topicDirNames) {
    const fullPath = path.join(rawDataDir, topicDirName);
    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) continue;

    const topicData = await loadTopicData(topicDirName);
    topics.push(topicData.topic);
    metrics.push(topicData.metrics);
    questionsByTopic[topicData.topic.slug] = topicData.questions;
    conversationsByTopic[topicData.topic.slug] = topicData.conversations;
    Object.assign(roleDescriptions, topicData.roleDescriptions);

    await writeJson(path.join(questionsDir, `${topicData.topic.slug}.json`), {
      topicSlug: topicData.topic.slug,
      items: topicData.questions,
    });
    await writeJson(path.join(conversationsDir, `${topicData.topic.slug}.json`), {
      topicSlug: topicData.topic.slug,
      items: topicData.conversations,
    });
  }

  await writeJson(path.join(metricsDir, "overview.json"), { items: metrics });
  await writeJson(path.join(publicDir, "manifest.json"), {
    version: "0.2.0",
    generatedAt: new Date().toISOString(),
    topics,
    paths: {
      questionsByTopic: Object.fromEntries(
        topics.map((topic) => [topic.slug, [`/data/questions/${topic.slug}.json`]])
      ),
      conversationsByTopic: Object.fromEntries(
        topics.map((topic) => [topic.slug, [`/data/conversations/${topic.slug}.json`]])
      ),
      metrics: "/data/metrics/overview.json",
    },
    conditionMeta: CONDITION_META,
    roleMap: roleDescriptions,
  });
}

main();
