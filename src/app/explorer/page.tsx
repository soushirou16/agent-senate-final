"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useManifest, useQuestionConversations, useQuestions } from "@/hooks/use-study-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StateBox } from "@/components/state-box";
import { CONDITION_LABELS, CONDITION_ORDER } from "@/lib/constants";
import {
  type AgentName,
  type ConditionKey,
  type ConversationItem,
  type QuestionItem,
} from "@/lib/types";

function pickVisibleConditions(
  runMode: "all" | "single" | "debate",
  roleMode: "all" | "role" | "no-role"
) {
  return CONDITION_ORDER.filter((condition) => {
    const runMatch =
      runMode === "all" ||
      (runMode === "single" && condition.startsWith("single")) ||
      (runMode === "debate" && condition.startsWith("debate"));
    const roleMatch =
      roleMode === "all" ||
      (roleMode === "role" && condition.endsWith("role") && !condition.endsWith("no_role")) ||
      (roleMode === "no-role" && condition.endsWith("no_role"));
    return runMatch && roleMatch;
  });
}

function ConversationLog({
  conversation,
  agentFilter,
  roleFilter,
}: {
  conversation: ConversationItem;
  agentFilter: "all" | AgentName;
  roleFilter: "all" | string;
}) {
  const showAgent = (agent: AgentName, role: string | null) => {
    if (agentFilter !== "all" && agent !== agentFilter) return false;
    if (roleFilter !== "all" && role !== roleFilter) return false;
    return true;
  };

  const initialAgents = Object.values(conversation.initialResponses).filter((entry) =>
    showAgent(entry.agent, entry.role)
  );
  const visibleRounds = conversation.rounds.map((round) => ({
    ...round,
    entries: Object.values(round.agents).filter((entry) => showAgent(entry.agent, entry.role)),
  }));

  return (
    <div className="grid gap-4">
      <section className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">Final: {conversation.finalConsensus}</Badge>
          <Badge variant="subtle">Rounds: {conversation.roundsCompleted}</Badge>
          <Badge variant="subtle">
            Opening agreement: {new Set(initialAgents.map((entry) => entry.decision)).size === 1 ? "Yes" : "No"}
          </Badge>
        </div>
        <div className="grid gap-3">
          {initialAgents.map((entry) => (
            <div key={`initial-${entry.agent}`} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">{entry.agent}</Badge>
                {entry.role ? <Badge variant="subtle">{entry.role}</Badge> : null}
                <Badge variant={entry.decision === "Yes" ? "accent" : "default"}>
                  Opening: {entry.decision}
                </Badge>
              </div>
              <p className="mt-2 text-sm">{entry.reasoning ?? "Opening rationale was not stored."}</p>
            </div>
          ))}
        </div>
      </section>

      {visibleRounds.map((round) => (
        <section key={`round-${round.round}`} className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">Round {round.round}</Badge>
            <Badge variant="subtle">Yes {round.votes.yes}</Badge>
            <Badge variant="subtle">No {round.votes.no}</Badge>
          </div>
          <div className="grid gap-3">
            {round.entries.map((entry) => (
              <div key={`round-${round.round}-${entry.agent}`} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{entry.agent}</Badge>
                  {entry.role ? <Badge variant="subtle">{entry.role}</Badge> : null}
                  <Badge variant={entry.decision === "Yes" ? "accent" : "default"}>
                    {entry.decision}
                  </Badge>
                  {entry.everConceded ? <Badge variant="subtle">Changed mind</Badge> : null}
                </div>
                <p className="mt-2 text-sm">{entry.reasoning ?? "Round reasoning was not stored."}</p>
                {entry.moderatorRedirect ? (
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    Moderator prompt: {entry.moderatorRedirect}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SingleResponseLog({
  question,
  condition,
  agentFilter,
  roleFilter,
}: {
  question: QuestionItem;
  condition: ConditionKey;
  agentFilter: "all" | AgentName;
  roleFilter: "all" | string;
}) {
  const responses = Object.values(question.conditionDetails[condition].responses).filter((entry) => {
    if (agentFilter !== "all" && entry.agent !== agentFilter) return false;
    if (roleFilter !== "all" && entry.role !== roleFilter) return false;
    return true;
  });

  return (
    <div className="grid gap-3">
      {responses.map((entry) => (
        <div key={`${condition}-${entry.agent}`} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{entry.agent}</Badge>
            {entry.role ? <Badge variant="subtle">{entry.role}</Badge> : null}
            <Badge variant={entry.decision === "Yes" ? "accent" : "default"}>
              {entry.decision}
            </Badge>
            <Badge variant="subtle">{entry.model}</Badge>
            {typeof entry.confidence === "number" ? (
              <Badge variant="subtle">Confidence {entry.confidence}</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm">
            {entry.reasoning ?? "This run stored the decision, confidence, and timing but not the full answer text."}
          </p>
          {typeof entry.timeSeconds === "number" ? (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Completed in {entry.timeSeconds.toFixed(2)}s
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function ExplorerPage() {
  const [query, setQuery] = useState("");
  const [topicSlug, setTopicSlug] = useState<"all" | string>("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<ConditionKey>("single_no_role");
  const { data: manifest, isLoading: isManifestLoading, error: manifestError } = useManifest();
  const activeTopicSlug = topicSlug;
  const { data: questions, isLoading: isQuestionsLoading, error: questionsError } = useQuestions(activeTopicSlug);
  const {
    data: questionConversations,
    isLoading: isConversationsLoading,
    error: questionConversationsError,
  } = useQuestionConversations(
    selectedCondition.startsWith("debate") ? selectedQuestionId : null
  );

  const topicBySlug = useMemo(
    () => new Map(manifest?.topics.map((topic) => [topic.slug, topic]) ?? []),
    [manifest]
  );
  const visibleConditions = useMemo(() => pickVisibleConditions("all", "all"), []);
  const totalQuestionCount = useMemo(
    () => manifest?.topics.reduce((sum, topic) => sum + topic.questionCount, 0) ?? 0,
    [manifest]
  );

  const filtered = useMemo(() => {
    if (!questions) return [];
    return questions
      .filter((question) => {
        const topic = topicBySlug.get(question.topicSlug);
        if (!topic) return false;
        if (topicSlug !== "all" && question.topicSlug !== topicSlug) return false;
        if (
          query.trim().length > 0 &&
          !question.prompt.toLowerCase().includes(query.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) =>
        a.topicSlug === b.topicSlug
          ? a.questionNumber - b.questionNumber
          : a.topicSlug.localeCompare(b.topicSlug)
      );
  }, [query, questions, topicBySlug, topicSlug]);

  const activeQuestionId =
    selectedQuestionId && filtered.some((question) => question.id === selectedQuestionId)
      ? selectedQuestionId
      : filtered[0]?.id ?? null;
  const activeCondition = visibleConditions.includes(selectedCondition)
    ? selectedCondition
    : visibleConditions[0] ?? "single_no_role";
  const selectedQuestion =
    filtered.find((question) => question.id === activeQuestionId) ?? filtered[0] ?? null;

  if (isManifestLoading) {
    return <StateBox title="Loading explorer..." message="Preparing question records." />;
  }

  if (!manifest || manifestError) {
    return (
      <StateBox
        title="Explorer data unavailable"
        message={manifestError ?? "Could not load question records."}
      />
    );
  }

  if (questionsError) {
    return (
      <StateBox
        title="Explorer data unavailable"
        message={questionsError}
      />
    );
  }

  const selectedTopic = selectedQuestion ? topicBySlug.get(selectedQuestion.topicSlug) : null;
  const selectedConversation =
    selectedQuestion && activeCondition.startsWith("debate")
      ? (questionConversations ?? []).find(
          (conversation) =>
            conversation.questionId === selectedQuestion.id &&
            ((activeCondition === "debate_no_role" && conversation.roleMode === "no-role") ||
              (activeCondition === "debate_role" && conversation.roleMode === "role"))
        )
      : null;

  return (
    <div className="grid gap-5">
      <section className="forum-hero">
        <div className="forum-hero-content">
          <div>
            <Badge variant="accent" className="w-fit">
              Explorer
            </Badge>
            <h1 className="forum-title mt-4">Question Explorer</h1>
            <p className="forum-subtitle mt-4">
              Pick a topic, choose a prompt, and read the recorded responses in a transcript
              layout. Debate conditions now load only the selected question transcript on demand.
            </p>
          </div>
          <div className="senate-seal" aria-hidden="true">
            AS
          </div>
        </div>
      </section>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
          <label className="grid gap-1.5 text-xs font-medium">
            <span className="opacity-0">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--muted-foreground)]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search question text..."
              />
            </div>
          </label>
          <label className="grid min-w-0 gap-1.5 text-xs font-medium">
            Topic
            <select
              value={activeTopicSlug}
              onChange={(event) => {
                setTopicSlug(event.target.value);
                setSelectedQuestionId(null);
              }}
              className="h-9 w-full min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 text-sm"
            >
              <option value="all">All topics</option>
              {manifest.topics.map((topic) => (
                <option key={topic.slug} value={topic.slug}>
                  {topic.title}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.3fr]">
        <Card className="stage-card">
          <CardHeader>
            <CardTitle>Questions</CardTitle>
            <CardDescription>
              {activeTopicSlug === "all"
                ? `Showing ${filtered.length} of ${totalQuestionCount} prompts after filters.`
                : `Showing ${filtered.length} of ${questions?.length ?? 0} prompts in this topic (${totalQuestionCount} total in dataset).`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid max-h-[72svh] gap-3 overflow-y-auto">
            {isQuestionsLoading ? (
              <StateBox title="Loading questions..." message="Updating the prompt list for this topic." />
            ) : filtered.length === 0 ? (
              <StateBox title="No questions found" message="Adjust the search or choose a different topic." />
            ) : filtered.map((question) => {
              const topic = topicBySlug.get(question.topicSlug);
              const isSelected = question.id === selectedQuestion?.id;
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setSelectedQuestionId(question.id)}
                  className="rounded-md border px-3 py-3 text-left transition-colors hover:bg-[var(--card-muted)]"
                  style={
                    isSelected
                      ? {
                          borderColor: "var(--accent)",
                          background: "var(--surface)",
                          boxShadow: "0 0 0 1px var(--accent) inset",
                        }
                      : undefined
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="accent">{topic?.title ?? question.topicSlug}</Badge>
                    <Badge variant="subtle">Q{question.questionNumber}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{question.prompt}</p>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="stage-card">
          {!selectedQuestion ? (
            <CardContent className="p-6">
              <StateBox title="No question selected" message="Adjust filters or choose a prompt." />
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <div className="flex flex-wrap gap-2">
                  {selectedTopic ? <Badge variant="accent">{selectedTopic.title}</Badge> : null}
                  <Badge variant="subtle">Q{selectedQuestion.questionNumber}</Badge>
                  {selectedTopic ? <Badge variant="subtle">{selectedTopic.spectrum}</Badge> : null}
                </div>
                <CardTitle>{selectedQuestion.prompt}</CardTitle>
                <CardDescription>
                  Switch conditions to compare single answers against debate outcomes.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  {visibleConditions.map((condition) => (
                    <Button
                      key={condition}
                      type="button"
                      variant={condition === activeCondition ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCondition(condition)}
                    >
                      {CONDITION_LABELS[condition].replace("Debate", "Group")}
                    </Button>
                  ))}
                </div>

                <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="default">
                      Outcome: {selectedQuestion.conditionSummary[activeCondition].outcome}
                    </Badge>
                    <Badge variant="subtle">
                      Yes {selectedQuestion.conditionSummary[activeCondition].yesVotes}
                    </Badge>
                    <Badge variant="subtle">
                      No {selectedQuestion.conditionSummary[activeCondition].noVotes}
                    </Badge>
                    <Badge variant="subtle">
                      Maybe {selectedQuestion.conditionSummary[activeCondition].maybeVotes}
                    </Badge>
                  </div>
                </div>

                {activeCondition.startsWith("debate") ? (
                  isConversationsLoading ? (
                    <StateBox title="Loading transcript..." message="Reading the selected debate log." />
                  ) : questionConversationsError ? (
                    <StateBox
                      title="Transcript unavailable"
                      message={questionConversationsError}
                    />
                  ) : selectedConversation ? (
                    <ConversationLog
                      conversation={selectedConversation}
                      agentFilter="all"
                      roleFilter="all"
                    />
                  ) : (
                    <StateBox
                      title="Transcript missing"
                      message="The question record loaded, but the matching debate transcript was not found."
                    />
                  )
                ) : (
                  <SingleResponseLog
                    question={selectedQuestion}
                    condition={activeCondition}
                    agentFilter="all"
                    roleFilter="all"
                  />
                )}
              </CardContent>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
