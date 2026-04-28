import {
  type AgentName,
  type AnswerValue,
  type BlindMatchSet,
  type ConditionAgentResponse,
  type ConditionKey,
  type ConditionSummary,
  type ConversationAgentState,
  type ConversationItem,
  type ConversationRoleAssignment,
  type DataManifest,
  type MetricsChunk,
  type QuestionConditionDetail,
  type QuestionItem,
  type RoleMode,
  type RunMode,
  type TopicConversationsChunk,
  type VisualizationDataset,
  type TopicQuestionsChunk,
} from "@/lib/types";

const responseCache = new Map<string, Promise<unknown>>();
const AGENT_ORDER: AgentName[] = ["ChatGPT", "Claude", "Gemini", "Grok"];
const CONDITION_ORDER: ConditionKey[] = [
  "single_no_role",
  "single_role",
  "debate_no_role",
  "debate_role",
];
const BLIND_MATCH_PRIORITY: ConditionKey[] = [
  "debate_role",
  "debate_no_role",
  "single_role",
  "single_no_role",
];
const SLOT_LABELS = ["A", "B", "C", "D"];
const SHOULD_MEMOIZE = process.env.NODE_ENV !== "development";

function getRunMode(conditionKey: ConditionKey): RunMode {
  return conditionKey.startsWith("single") ? "single" : "debate";
}

function getRoleMode(conditionKey: ConditionKey): RoleMode {
  return conditionKey.endsWith("no_role") ? "no-role" : "role";
}

function normalizeDecision(value: unknown): AnswerValue {
  const normalized = String(value ?? "Maybe").trim().toUpperCase();
  if (normalized === "YES") return "Yes";
  if (normalized === "NO") return "No";
  return "Maybe";
}

function normalizeRawDecision(value: unknown): ConditionSummary["rawOutcome"] {
  const normalized = String(value ?? "Maybe").trim().toUpperCase();
  if (normalized === "YES") return "Yes";
  if (normalized === "NO") return "No";
  if (normalized === "STALEMATE") return "Stalemate";
  if (normalized === "ERROR") return "ERROR";
  return "Maybe";
}

function trimPreview(text: string | null) {
  if (!text) return null;
  if (text.length <= 220) return text;
  const sliced = text.slice(0, 220);
  const boundary = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, boundary > 120 ? boundary : 220).trim()}...`;
}

function createResponse(
  agent: AgentName,
  overrides: Partial<ConditionAgentResponse> = {}
): ConditionAgentResponse {
  const decision = normalizeDecision(overrides.decision ?? "Maybe");
  const rawDecision = normalizeRawDecision(overrides.rawDecision ?? overrides.decision ?? decision);
  const reasoning =
    typeof overrides.reasoning === "string" ? overrides.reasoning : overrides.reasoning ?? null;

  return {
    agent,
    provider: overrides.provider ?? "unknown",
    model: overrides.model ?? "unknown",
    role: overrides.role ?? null,
    decision,
    rawDecision,
    confidence: typeof overrides.confidence === "number" ? overrides.confidence : null,
    reasoning,
    reasoningPreview:
      typeof overrides.reasoningPreview === "string"
        ? overrides.reasoningPreview
        : trimPreview(reasoning),
    timeSeconds: typeof overrides.timeSeconds === "number" ? overrides.timeSeconds : null,
  };
}

function normalizeConditionSummary(summary: Partial<ConditionSummary> | undefined): ConditionSummary {
  const outcome = normalizeDecision(summary?.outcome);
  return {
    outcome,
    rawOutcome: normalizeRawDecision(summary?.rawOutcome ?? summary?.outcome ?? outcome),
    yesVotes: typeof summary?.yesVotes === "number" ? summary.yesVotes : 0,
    noVotes: typeof summary?.noVotes === "number" ? summary.noVotes : 0,
    maybeVotes: typeof summary?.maybeVotes === "number" ? summary.maybeVotes : 0,
  };
}

function normalizeConditionDetails(
  rawDetails: Partial<Record<ConditionKey, Partial<QuestionConditionDetail>>> | undefined,
  rawQuestion: Partial<QuestionItem>
): Record<ConditionKey, QuestionConditionDetail> {
  return Object.fromEntries(
    CONDITION_ORDER.map((conditionKey) => {
      const detail = rawDetails?.[conditionKey];
      const summary = normalizeConditionSummary(
        detail?.summary ?? rawQuestion.conditionSummary?.[conditionKey]
      );
      const responses = Object.fromEntries(
        AGENT_ORDER.map((agent) => {
          const legacyDecision = rawQuestion.agentVotes?.[conditionKey]?.[agent];
          const response = detail?.responses?.[agent];
          return [
            agent,
            createResponse(agent, {
              ...response,
              decision: response?.decision ?? legacyDecision ?? "Maybe",
              rawDecision: response?.rawDecision ?? response?.decision ?? legacyDecision ?? "Maybe",
            }),
          ];
        })
      ) as Record<AgentName, ConditionAgentResponse>;

      return [
        conditionKey,
        {
          runMode: detail?.runMode ?? getRunMode(conditionKey),
          roleMode: detail?.roleMode ?? getRoleMode(conditionKey),
          summary,
          responses,
        },
      ];
    })
  ) as Record<ConditionKey, QuestionConditionDetail>;
}

function buildBlindMatchFromQuestion(
  rawQuestion: Partial<QuestionItem>,
  conditionDetails: Record<ConditionKey, QuestionConditionDetail>
): BlindMatchSet {
  const sourceCondition =
    BLIND_MATCH_PRIORITY.find((conditionKey) => {
      const detail = conditionDetails[conditionKey];
      return AGENT_ORDER.some((agent) => Boolean(detail.responses[agent]?.reasoningPreview));
    }) ?? BLIND_MATCH_PRIORITY[0];

  const cards = AGENT_ORDER.map((agent, index) => {
    const response =
      conditionDetails[sourceCondition]?.responses?.[agent] ??
      createResponse(agent, {
        decision: rawQuestion.agentVotes?.[sourceCondition]?.[agent] ?? "Maybe",
      });

    return {
      slot: SLOT_LABELS[index],
      agent,
      role: response.role,
      decision: response.decision,
      rawDecision: response.rawDecision,
      confidence: response.confidence,
      reasoning: response.reasoning,
      reasoningPreview: response.reasoningPreview,
    };
  });

  return {
    sourceCondition,
    cards,
  };
}

function normalizeQuestionItem(rawQuestion: Partial<QuestionItem>): QuestionItem {
  const conditionDetails = normalizeConditionDetails(rawQuestion.conditionDetails, rawQuestion);
  const conditionSummary = Object.fromEntries(
    CONDITION_ORDER.map((conditionKey) => [
      conditionKey,
      normalizeConditionSummary(rawQuestion.conditionSummary?.[conditionKey] ?? conditionDetails[conditionKey].summary),
    ])
  ) as Record<ConditionKey, ConditionSummary>;
  const agentVotes = Object.fromEntries(
    CONDITION_ORDER.map((conditionKey) => [
      conditionKey,
      Object.fromEntries(
        AGENT_ORDER.map((agent) => [
          agent,
          normalizeDecision(
            rawQuestion.agentVotes?.[conditionKey]?.[agent] ??
              conditionDetails[conditionKey].responses[agent].decision
          ),
        ])
      ),
    ])
  ) as Record<ConditionKey, Record<AgentName, AnswerValue>>;

  const existingBlindMatch = rawQuestion.blindMatch;
  const blindMatch =
    existingBlindMatch &&
    existingBlindMatch.sourceCondition &&
    Array.isArray(existingBlindMatch.cards)
      ? {
          sourceCondition: existingBlindMatch.sourceCondition,
          cards: existingBlindMatch.cards.map((card, index) => ({
            slot: card.slot ?? SLOT_LABELS[index] ?? String(index + 1),
            agent: card.agent ?? AGENT_ORDER[index] ?? "ChatGPT",
            role: card.role ?? null,
            decision: normalizeDecision(card.decision),
            rawDecision: normalizeRawDecision(card.rawDecision ?? card.decision),
            confidence: typeof card.confidence === "number" ? card.confidence : null,
            reasoning: card.reasoning ?? null,
            reasoningPreview: card.reasoningPreview ?? trimPreview(card.reasoning ?? null),
          })),
        }
      : buildBlindMatchFromQuestion(rawQuestion, conditionDetails);

  return {
    id: rawQuestion.id ?? crypto.randomUUID(),
    topicSlug: rawQuestion.topicSlug ?? "unknown-topic",
    questionNumber: typeof rawQuestion.questionNumber === "number" ? rawQuestion.questionNumber : 0,
    prompt: rawQuestion.prompt ?? "",
    tags: Array.isArray(rawQuestion.tags) ? rawQuestion.tags : [],
    conditionSummary,
    agentVotes,
    conditionDetails,
    blindMatch,
  };
}

function createConversationState(
  agent: AgentName,
  role: string | null,
  text: string | null,
  decision: unknown
): ConversationAgentState {
  const normalizedText = typeof text === "string" ? text : null;
  return {
    agent,
    role,
    provider: "unknown",
    decision: normalizeDecision(decision),
    rawDecision: normalizeRawDecision(decision),
    confidence: null,
    reasoning: normalizedText,
    reasoningPreview: trimPreview(normalizedText),
    moderatorRedirect: null,
    coalitionCounter: null,
    concededThisRound: false,
    everConceded: false,
    avgPeerRating: null,
  };
}

function normalizeRoleAssignments(
  rawAssignments: ConversationRoleAssignment[] | undefined
): Record<AgentName, string | null> {
  return Object.fromEntries(
    AGENT_ORDER.map((agent) => [
      agent,
      rawAssignments?.find((assignment) => assignment.agent === agent)?.role ?? null,
    ])
  ) as Record<AgentName, string | null>;
}

function normalizeConversationItem(
  rawConversation: Partial<ConversationItem> & Record<string, unknown>
): ConversationItem {
  if (rawConversation.initialResponses && rawConversation.finalState) {
    return rawConversation as ConversationItem;
  }

  const assignmentMap = normalizeRoleAssignments(rawConversation.roleAssignments);
  const turns = Array.isArray(rawConversation.turns)
    ? rawConversation.turns.filter(
        (turn): turn is { speaker: string; text: string } =>
          Boolean(turn && typeof turn.speaker === "string" && typeof turn.text === "string")
      )
    : [];
  const prompt =
    rawConversation.prompt ??
    turns.find((turn) => turn.speaker === "Moderator")?.text?.replace("Opening prompt: ", "") ??
    "";
  const finalConsensus = normalizeDecision(rawConversation.finalConsensus);
  const initialResponses = Object.fromEntries(
    AGENT_ORDER.map((agent) => {
      const turn = turns.find((entry) => entry.speaker === agent);
      return [agent, createConversationState(agent, assignmentMap[agent], turn?.text ?? null, finalConsensus)];
    })
  ) as ConversationItem["initialResponses"];

  return {
    id: String(rawConversation.id ?? crypto.randomUUID()),
    topicSlug: String(rawConversation.topicSlug ?? "unknown-topic"),
    questionId: String(rawConversation.questionId ?? "unknown-question"),
    questionNumber: typeof rawConversation.questionNumber === "number" ? rawConversation.questionNumber : 0,
    prompt,
    runMode: "debate" as const,
    roleMode: (rawConversation.roleMode === "role" ? "role" : "no-role") as RoleMode,
    roleAssignments: AGENT_ORDER.map((agent) => ({
      agent,
      role: assignmentMap[agent],
    })),
    initialResponses,
    rounds: [],
    voteHistory: [],
    finalConsensus,
    rawFinalConsensus: normalizeRawDecision(rawConversation.finalConsensus),
    roundsCompleted:
      typeof rawConversation.roundsCompleted === "number" ? rawConversation.roundsCompleted : 0,
    finalState: Object.fromEntries(
      AGENT_ORDER.map((agent) => [
        agent,
        {
          role: assignmentMap[agent],
          decision: initialResponses[agent].decision,
          rawDecision: initialResponses[agent].rawDecision,
          confidence: null,
          everConceded: false,
        },
      ])
    ) as ConversationItem["finalState"],
  };
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    cache: SHOULD_MEMOIZE ? "force-cache" : "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${path}: ${response.status}`);
  }

  return response.json();
}

async function fetchJson<T>(path: string): Promise<T> {
  if (!SHOULD_MEMOIZE) {
    return requestJson<T>(path);
  }

  if (!responseCache.has(path)) {
    responseCache.set(path, requestJson<T>(path));
  }

  return responseCache.get(path) as Promise<T>;
}

export async function getManifest(): Promise<DataManifest> {
  return fetchJson<DataManifest>("/data/manifest.json");
}

export async function getTopicQuestions(topicSlug: string) {
  const manifest = await getManifest();
  const paths = manifest.paths.questionsByTopic[topicSlug] ?? [];
  const chunks = await Promise.all(
    paths.map((chunkPath) => fetchJson<TopicQuestionsChunk>(chunkPath))
  );
  return chunks.flatMap((chunk) =>
    chunk.items.map((item) => normalizeQuestionItem(item as Partial<QuestionItem>))
  );
}

export async function getTopicConversations(topicSlug: string) {
  const manifest = await getManifest();
  const paths = manifest.paths.conversationsByTopic[topicSlug] ?? [];
  const chunks = await Promise.all(
    paths.map((chunkPath) => fetchJson<TopicConversationsChunk>(chunkPath))
  );
  return chunks.flatMap((chunk) =>
    chunk.items.map((item) =>
      normalizeConversationItem(item as Partial<ConversationItem> & Record<string, unknown>)
    )
  );
}

export async function getQuestionConversations(questionId: string) {
  const manifest = await getManifest();
  const paths = manifest.paths.conversationsByQuestion[questionId] ?? [];
  const chunks = await Promise.all(
    paths.map((chunkPath) => fetchJson<TopicConversationsChunk>(chunkPath))
  );
  return chunks.flatMap((chunk) =>
    chunk.items.map((item) =>
      normalizeConversationItem(item as Partial<ConversationItem> & Record<string, unknown>)
    )
  );
}

export async function getAllQuestions() {
  const manifest = await getManifest();
  const questions = await Promise.all(
    manifest.topics.map((topic) => getTopicQuestions(topic.slug))
  );
  return questions.flat();
}

export async function getOverviewMetrics() {
  const manifest = await getManifest();
  const chunk = await fetchJson<MetricsChunk>(manifest.paths.metrics);
  return chunk.items;
}

export async function getVisualizationDataset() {
  return fetchJson<VisualizationDataset>("/data/metrics/visualization.json");
}

export async function getTopicDemoSamples(topicSlug: string) {
  // Map `data-privacy` to `Data Privacy`.
  const folderName = topicSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const files = [
    "no role single curated.json",
    "role single curated.json",
    "role group curated.json",
    "no role group curated.json",
  ];

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(`/demo_data/${folderName}/${file}`);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    })
  );
  return results;
}

export async function getTopicDemoSamples(topicSlug: string) {
  // Map `data-privacy` to `Data Privacy`.
  const folderName = topicSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const files = [
    "no role single curated.json",
    "role single curated.json",
    "role group curated.json",
    "no role group curated.json",
  ];

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(`/demo_data/${folderName}/${file}`);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    })
  );

  return results;
}
