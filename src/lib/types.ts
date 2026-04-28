export type AgentName = "ChatGPT" | "Claude" | "Gemini" | "Grok";
export type RunMode = "single" | "debate";
export type RoleMode = "role" | "no-role";
export type AnswerValue = "Yes" | "No" | "Maybe";
export type RawAnswerValue = AnswerValue | "Stalemate" | "ERROR";

export type ConditionKey =
  | "single_no_role"
  | "single_role"
  | "debate_no_role"
  | "debate_role";

export interface TopicDescriptor {
  slug: string;
  title: string;
  spectrum: string;
  definition: string;
  yesMeans: string;
  questionCount: number;
}

export interface ConditionSummary {
  outcome: AnswerValue;
  rawOutcome: RawAnswerValue;
  yesVotes: number;
  noVotes: number;
  maybeVotes: number;
}

export interface ConditionAgentResponse {
  agent: AgentName;
  provider: string;
  model: string;
  role: string | null;
  decision: AnswerValue;
  rawDecision: RawAnswerValue;
  confidence: number | null;
  reasoning: string | null;
  reasoningPreview: string | null;
  timeSeconds: number | null;
}

export interface QuestionConditionDetail {
  runMode: RunMode;
  roleMode: RoleMode;
  summary: ConditionSummary;
  responses: Record<AgentName, ConditionAgentResponse>;
}

export interface BlindMatchCard {
  slot: string;
  agent: AgentName;
  role: string | null;
  decision: AnswerValue;
  rawDecision: RawAnswerValue;
  confidence: number | null;
  reasoning: string | null;
  reasoningPreview: string | null;
}

export interface BlindMatchSet {
  sourceCondition: ConditionKey;
  cards: BlindMatchCard[];
}

export interface QuestionItem {
  id: string;
  topicSlug: string;
  questionNumber: number;
  prompt: string;
  tags: string[];
  conditionSummary: Record<ConditionKey, ConditionSummary>;
  agentVotes: Record<ConditionKey, Record<AgentName, AnswerValue>>;
  conditionDetails: Record<ConditionKey, QuestionConditionDetail>;
  blindMatch: BlindMatchSet;
}

export interface TopicQuestionsChunk {
  topicSlug: string;
  items: QuestionItem[];
}

export interface ConversationRoleAssignment {
  agent: AgentName;
  role: string | null;
}

export interface ConversationAgentState {
  agent: AgentName;
  role: string | null;
  provider: string;
  decision: AnswerValue;
  rawDecision: RawAnswerValue;
  confidence: number | null;
  reasoning: string | null;
  reasoningPreview: string | null;
  moderatorRedirect: string | null;
  coalitionCounter: string | null;
  concededThisRound: boolean;
  everConceded: boolean;
  avgPeerRating: number | null;
}

export interface ConversationVotePoint {
  round: number;
  yes: number;
  no: number;
}

export interface ConversationRound {
  round: number;
  votes: ConversationVotePoint;
  agents: Record<AgentName, ConversationAgentState>;
}

export interface ConversationItem {
  id: string;
  topicSlug: string;
  questionId: string;
  questionNumber: number;
  prompt: string;
  runMode: "debate";
  roleMode: RoleMode;
  roleAssignments: ConversationRoleAssignment[];
  initialResponses: Record<AgentName, ConversationAgentState>;
  rounds: ConversationRound[];
  voteHistory: ConversationVotePoint[];
  finalConsensus: AnswerValue;
  rawFinalConsensus: RawAnswerValue;
  roundsCompleted: number;
  finalState: Record<
    AgentName,
    {
      role: string | null;
      decision: AnswerValue;
      rawDecision: RawAnswerValue;
      confidence: number | null;
      everConceded: boolean;
    }
  >;
}

export interface TopicConversationsChunk {
  topicSlug: string;
  items: ConversationItem[];
}

export interface TopicMetric {
  topicSlug: string;
  yesRateByCondition: Record<
    "Single, No Role" | "Single, Role" | "Debate, No Role" | "Debate, Role",
    number
  >;
  avgDebateRoundsNoRole: number;
  avgDebateRoundsRole: number;
  anyMindChangedRate: number;
  conditionDisagreementRate: number;
  stalemateRate: number;
}

export interface MetricsChunk {
  items: TopicMetric[];
}

export interface DataManifest {
  version: string;
  generatedAt: string;
  topics: TopicDescriptor[];
  paths: {
    questionsByTopic: Record<string, string[]>;
    conversationsByTopic: Record<string, string[]>;
    metrics: string;
  };
  conditionMeta: Record<ConditionKey, { runMode: RunMode; roleMode: RoleMode }>;
  roleMap: Record<string, string>;
}

export interface FilterState {
  runMode: "all" | RunMode;
  roleMode: "all" | RoleMode;
  topicSlug: "all" | string;
  spectrum: "all" | string;
  agent: "all" | AgentName;
  role: "all" | string;
}

export interface FeedbackEntry {
  id: string;
  createdAt: string;
  pagePath: string;
  topicSlug: string | null;
  stage?: string | null;
  questionId?: string | null;
  questionNumber?: number | null;
  questionText?: string | null;
  userAnswer?: AnswerValue | null;
  alignedSlot?: string | null;
  alignedAgent?: AgentName | null;
  alignedDecision?: AnswerValue | null;
  confidence?: number;
  evidenceUsefulness?: number;
  perceptionGap?: number;
  clarity?: number;
  chartUsefulness?: number;
  comment: string;
}
