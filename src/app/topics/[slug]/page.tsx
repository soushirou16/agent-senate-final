"use client";

import Link from "next/link";
import { use, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenText,
  CheckCircle2,
  Eye,
  MessageSquareText,
  Scale,
  Shuffle,
  UsersRound,
} from "lucide-react";
import {
  useManifest,
  useOverviewMetrics,
  useTopicConversations,
  useTopicQuestions,
} from "@/hooks/use-study-data";
import { findCuratedQuestion } from "@/lib/curated-questions";
import { CONDITION_LABELS } from "@/lib/constants";
import {
  type AgentName,
  type ConditionKey,
  type ConversationItem,
  type QuestionItem,
  type TopicMetric,
} from "@/lib/types";
import { useFeedback } from "@/components/providers/feedback-provider";
import { BlindAnswerMatch } from "@/components/blind-answer-match";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StateBox } from "@/components/state-box";
import { ConditionBarChart } from "@/components/charts/condition-bar-chart";
import { RoundsCompareChart } from "@/components/charts/rounds-compare-chart";
import { TopicFeedbackCheckpoint } from "@/components/topic-feedback-checkpoint";

type ConditionLabel = keyof TopicMetric["yesRateByCondition"];

const AGENT_ORDER: AgentName[] = ["ChatGPT", "Claude", "Gemini", "Grok"];
const CONDITION_ORDER: ConditionKey[] = [
  "single_no_role",
  "single_role",
  "debate_no_role",
  "debate_role",
];
const CHART_CONDITION_ORDER: ConditionLabel[] = [
  "Single, No Role",
  "Single, Role",
  "Debate, No Role",
  "Debate, Role",
];
const STORY_STEPS = [
  { title: "Set the Question", shortTitle: "Intro", kicker: "What this topic is asking" },
  { title: "Single, No Role", shortTitle: "Sample 1", kicker: "Baseline setup" },
  { title: "Single, Role", shortTitle: "Sample 2", kicker: "With role assignments" },
  { title: "Debate, No Role", shortTitle: "Sample 3", kicker: "Group without roles" },
  { title: "Debate, Role", shortTitle: "Sample 4", kicker: "Full group debate" },
  { title: "One Debate", shortTitle: "Debate", kicker: "Watch one real disagreement play out" },
  { title: "Whole Topic", shortTitle: "Data", kicker: "Step back to the larger pattern" },
  { title: "Final Answer", shortTitle: "Final", kicker: "Where you land after the evidence" },
] as const;

const ROMAN_STEPS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;

function getRomanStep(index: number) {
  return ROMAN_STEPS[index] ?? String(index + 1);
}

function StoryHeader({
  stepLabel,
  title,
  kicker,
}: {
  stepLabel: string;
  title: string;
  kicker: string;
}) {
  return (
    <div className="session-heading mb-5">
      <div className="session-number" aria-hidden="true">
        {stepLabel}
      </div>
      <div>
        <div className="session-kicker">Session {stepLabel} - {kicker}</div>
        <h2 className="text-2xl">{title}</h2>
      </div>
    </div>
  );
}

function MissingQuestionCard() {
  return (
    <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
      This sample is unavailable in the current topic data.
    </div>
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatPercentFromRate(value: number) {
  return `${Math.round(value)}%`;
}

function formatConditionOutcome(question: QuestionItem, condition: ConditionKey) {
  const summary = question.conditionSummary[condition];
  if (summary.rawOutcome === "Stalemate") {
    return "Split 2-2";
  }
  return summary.outcome;
}

function getTopicSides(title: string) {
  const [yesSide, counterSide] = title.split(" vs ");
  return {
    yesSide: yesSide?.trim() || title,
    counterSide: counterSide?.trim() || "the competing value",
  };
}

function getJudgmentPrompt(base: string, yesSide: string, counterSide: string) {
  return `${base} Yes means ${yesSide}. No means ${counterSide}.`;
}

function getNarrativeQuestion(title: string) {
  const { yesSide, counterSide } = getTopicSides(title);
  return `When ${yesSide.toLowerCase()} conflicts with ${counterSide.toLowerCase()}, what should win?`;
}

function getQuestionPatternSummary(question: QuestionItem) {
  const outcomes = CONDITION_ORDER.map((condition) => question.conditionSummary[condition].outcome);
  const rawOutcomes = CONDITION_ORDER.map((condition) => question.conditionSummary[condition].rawOutcome);
  const uniqueOutcomes = new Set(outcomes);

  if (rawOutcomes.every((outcome) => outcome === rawOutcomes[0]) && rawOutcomes[0] !== "Stalemate") {
    return `Every setup landed on ${rawOutcomes[0]}.`;
  }

  if (rawOutcomes.includes("Stalemate")) {
    return "At least one setup split 2-2 instead of settling on a clear answer.";
  }

  if (uniqueOutcomes.size > 1) {
    return "The answer changed across the four setups.";
  }

  return "The setups leaned the same way overall, but not with the same vote pattern.";
}

function getQuestionContrast(question: QuestionItem) {
  const plain = question.conditionSummary.single_no_role.outcome;
  const debateRole = question.conditionSummary.debate_role.outcome;

  if (plain === debateRole) {
    return `From the plain single-agent run to the role-based debate, the answer stayed ${plain}.`;
  }

  return `The plain single-agent run said ${plain}, but the role-based debate ended ${debateRole}.`;
}

function countConversationSwitches(conversation: ConversationItem) {
  return AGENT_ORDER.filter(
    (agent) => conversation.initialResponses[agent].decision !== conversation.finalState[agent].decision
  ).length;
}

function getFeaturedConversation(
  conversations: ConversationItem[],
  preferredQuestionIds: string[]
) {
  return [...conversations].sort((left, right) => {
    const leftPriority = preferredQuestionIds.includes(left.questionId) ? 100 : 0;
    const rightPriority = preferredQuestionIds.includes(right.questionId) ? 100 : 0;
    const leftScore = leftPriority + left.roundsCompleted * 10 + countConversationSwitches(left) * 3;
    const rightScore =
      rightPriority + right.roundsCompleted * 10 + countConversationSwitches(right) * 3;
    return rightScore - leftScore;
  })[0];
}

function getMetricHighlights(metric: TopicMetric | undefined) {
  if (!metric) return null;

  const entries = CHART_CONDITION_ORDER.map((label) => ({
    label,
    value: metric.yesRateByCondition[label],
  })).sort((left, right) => right.value - left.value);

  return {
    strongest: entries[0],
    weakest: entries[entries.length - 1],
    spread: entries[0].value - entries[entries.length - 1].value,
  };
}

function getMetricNarrative(highlights: NonNullable<ReturnType<typeof getMetricHighlights>>) {
  return `${highlights.strongest.label} produced the strongest yes-lean at ${formatPercent(
    highlights.strongest.value
  )}, while ${highlights.weakest.label} was lowest at ${formatPercent(
    highlights.weakest.value
  )}, a ${Math.round(highlights.spread * 100)} point spread.`;
}

function EvidenceStrip({ question }: { question: QuestionItem }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      {CONDITION_ORDER.map((condition) => {
        const summary = question.conditionSummary[condition];
        return (
          <div
            key={condition}
            className="evidence-tile rounded-md border border-[var(--line-subtle)] bg-[var(--card-muted)] px-3 py-2 text-sm"
          >
            <div className="text-xs text-[var(--muted-foreground)]">{CONDITION_LABELS[condition]}</div>
            <div className="mt-1 font-semibold">{formatConditionOutcome(question, condition)}</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {summary.yesVotes} yes, {summary.noVotes} no
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SampleStep({
  topicSlug,
  label,
  question,
}: {
  topicSlug: string;
  label: string;
  question: QuestionItem | undefined;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!question) return <MissingQuestionCard />;

  const blindMatch = question.blindMatch;
  const blindCards = blindMatch?.cards ?? [];

  return (
    <div className="grid gap-4">
      <div className="story-scene stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="scene-brow">{label}</div>
        <h3 className="mt-2 font-serif text-2xl">One sealed case, four visible answers.</h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-foreground)]">
          Treat these like floor speeches. Pick the answer that earns your vote before you know the
          actual case.
        </p>
      </div>

      <BlindAnswerMatch
        key={question.id}
        topicSlug={topicSlug}
        stage={`${label} blind pick`}
        questionId={question.id}
        questionNumber={question.questionNumber}
        questionText={question.prompt}
        cards={blindCards}
      />

      <div className="reveal-gate stage-card rounded-md border border-[var(--line)] bg-[var(--card-muted)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Shuffle className="h-4 w-4" />
              Break the seal
            </div>
            {blindMatch ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                These answers came from{" "}
                <strong>{CONDITION_LABELS[blindMatch.sourceCondition]}</strong>.
              </p>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                Source setup metadata was not captured for this sample.
              </p>
            )}
          </div>
          <Button type="button" onClick={() => setRevealed((value) => !value)}>
            <Eye className="h-4 w-4" />
            {revealed ? "Seal the case" : "Reveal the case"}
          </Button>
        </div>
      </div>

      {revealed ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <div className="reveal-panel sample-oracle stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-5">
              <div className="mb-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <BookOpenText className="h-4 w-4" />
                Revealed case
              </div>
              <h3 className="font-serif text-2xl font-semibold leading-snug">{question.prompt}</h3>
            </div>

            <div className="reveal-panel insight-banner stage-card rounded-md border border-[var(--line)] bg-[var(--card-muted)] p-5">
              <div className="scene-brow">What the reveal changes</div>
              <p className="mt-2 text-xl leading-8">{getQuestionPatternSummary(question)}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
                {getQuestionContrast(question)}
              </p>
            </div>
          </div>

          <div className="evidence-wall stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <BookOpenText className="h-4 w-4" />
              Who gave each answer
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {blindCards.map((card) => (
                <div
                  key={card.slot}
                  className="reveal-panel evidence-tile rounded-md border border-[var(--line-subtle)] bg-[var(--surface)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="subtle">Answer {card.slot}</Badge>
                    <Badge variant={card.decision === "Yes" ? "accent" : "default"}>
                      {card.decision}
                    </Badge>
                  </div>
                  <div className="font-semibold">{card.agent}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {card.role ?? "No role assignment"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="evidence-wall stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-3 text-sm font-semibold text-[var(--muted-foreground)]">
              How the four setups voted
            </div>
            <EvidenceStrip question={question} />
          </div>

          <TopicFeedbackCheckpoint
            topicSlug={topicSlug}
            stage={`${label} revealed`}
            prompt="Now that the case is visible, where do you land?"
            questionId={question.id}
            questionNumber={question.questionNumber}
            showEvidenceSlider
          />
        </>
      ) : (
        <div className="reveal-panel stage-card rounded-md border border-dashed border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
          The real prompt is still sealed. Reveal it when you want to compare your vote against the
          actual case and the four run setups.
        </div>
      )}
    </div>
  );
}

function DebateStep({ conversation }: { conversation: ConversationItem | undefined }) {
  if (!conversation) {
    return (
      <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-foreground)]">
        No debate snapshot was available for this topic.
      </div>
    );
  }

  const switchCount = countConversationSwitches(conversation);
  const leadRedirect =
    conversation.rounds
      .flatMap((round) => AGENT_ORDER.map((agent) => round.agents[agent].moderatorRedirect))
      .find(Boolean) ?? null;

  return (
    <div className="grid gap-4">
      <div className="debate-marquee stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="scene-brow">Debate floor</div>
        <div className="mt-2 grid gap-4 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
          <div>
            <h3 className="font-serif text-2xl font-semibold leading-snug">{conversation.prompt}</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
              This is one full group debate from the topic. Watch where the room settled, how long
              it took, and whether anyone moved.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="debate-stat rounded-md border border-[var(--line-subtle)] bg-[var(--card-muted)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Final answer</div>
              <div className="mt-1 font-serif text-2xl">{conversation.finalConsensus}</div>
            </div>
            <div className="debate-stat rounded-md border border-[var(--line-subtle)] bg-[var(--card-muted)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Rounds</div>
              <div className="mt-1 font-serif text-2xl">{conversation.roundsCompleted}</div>
            </div>
            <div className="debate-stat rounded-md border border-[var(--line-subtle)] bg-[var(--card-muted)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Changed minds</div>
              <div className="mt-1 font-serif text-2xl">{switchCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
        <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--card-muted)] p-4">
          <div className="mb-3 text-sm font-semibold text-[var(--muted-foreground)]">
            Vote history
          </div>
          <div className="vote-history-track grid gap-2">
            {(conversation.voteHistory.length > 0 ? conversation.voteHistory : [{ round: 0, yes: 0, no: 0 }]).map(
              (point) => (
                <div
                  key={point.round}
                  className="history-chip flex items-center justify-between rounded-md bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  <span>Round {point.round}</span>
                  <span>
                    {point.yes} yes / {point.no} no
                  </span>
                </div>
              )
            )}
          </div>

          <div className="mt-4 rounded-md border border-[var(--line-subtle)] bg-[var(--surface)] p-3">
            <div className="text-xs text-[var(--muted-foreground)]">Read of the room</div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {leadRedirect
                ? leadRedirect
                : "No strong moderator push was captured in this debate."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {AGENT_ORDER.map((agent) => {
            const initial = conversation.initialResponses[agent];
            const final = conversation.finalState[agent];
            const switched = initial.decision !== final.decision;

            return (
              <div
                key={agent}
                className="answer-tablet rounded-md border border-[var(--line-subtle)] bg-[var(--surface)] p-4 pt-5"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{agent}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {initial.role ?? "No role assignment"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={initial.decision === "Yes" ? "accent" : "default"}>
                      Started {initial.decision}
                    </Badge>
                    <Badge variant={final.decision === "Yes" ? "accent" : "default"}>
                      Ended {final.decision}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm leading-6">
                  {initial.reasoningPreview ?? "No written opening argument was captured."}
                </p>
                <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                  {switched ? "Changed position during the debate." : "Held the same position."}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TopicDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { initSession } = useFeedback();
  const [deckState, setDeckState] = useState({ slug, activeStep: 0 });
  // Stable random seed per page load — gives each condition a different question from the bank
  const [sampleSeed] = useState(() => Math.random());
  const activeStep = deckState.slug === slug ? deckState.activeStep : 0;
  const { data: manifest, isLoading: isManifestLoading, error: manifestError } = useManifest();
  const { data: questions, isLoading: isQuestionsLoading, error: questionsError } =
    useTopicQuestions(slug);
  const { data: conversations, isLoading: isConversationsLoading, error: conversationsError } =
    useTopicConversations(slug);
  const { data: metrics, isLoading: isMetricsLoading, error: metricsError } = useOverviewMetrics();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStep]);

  useEffect(() => {
    if (!manifest) return;
    const found = manifest.topics.find((item) => item.slug === slug);
    if (!found) return;
    void initSession(found.slug, found.title);
  }, [slug, manifest, initSession]);

  if (isManifestLoading || isQuestionsLoading || isConversationsLoading || isMetricsLoading) {
    return (
      <StateBox
        title="Loading topic..."
        message="Reading prompt samples, debate records, and topic metrics."
      />
    );
  }

  if (!manifest || !questions || !conversations || !metrics) {
    return (
      <StateBox
        title="Topic data unavailable"
        message={
          manifestError ??
          questionsError ??
          conversationsError ??
          metricsError ??
          "Could not load topic data."
        }
      />
    );
  }

  const topic = manifest.topics.find((item) => item.slug === slug);
  if (!topic) {
    return <StateBox title="Topic not found" message={`No topic metadata found for "${slug}".`} />;
  }

  const topicMetric = metrics.find((metric) => metric.topicSlug === slug);
  const topicMetrics = topicMetric ? [topicMetric] : [];
  const metricHighlights = getMetricHighlights(topicMetric);
  const sampleOne   = findCuratedQuestion(questions, slug, "single_no_role",  sampleSeed);
  const sampleTwo   = findCuratedQuestion(questions, slug, "single_role",     sampleSeed);
  const sampleThree = findCuratedQuestion(questions, slug, "debate_no_role",  sampleSeed);
  const sampleFour  = findCuratedQuestion(questions, slug, "debate_role",     sampleSeed);
  const curatedIds  = [sampleOne, sampleTwo, sampleThree, sampleFour]
    .filter(Boolean).map((q) => q!.id);
  const featuredConversation = getFeaturedConversation(conversations, curatedIds);
  const narrativeQuestion = getNarrativeQuestion(topic.title);
  const { yesSide, counterSide } = getTopicSides(topic.title);
  const isFirstStep = activeStep === 0;
  const isLastStep = activeStep === STORY_STEPS.length - 1;

  const setActiveStep = (nextStep: number | ((currentStep: number) => number)) => {
    setDeckState((current) => {
      const currentStep = current.slug === slug ? current.activeStep : 0;
      const nextActiveStep =
        typeof nextStep === "function" ? nextStep(currentStep) : nextStep;

      return { slug, activeStep: nextActiveStep };
    });
  };

  const activeContent: ReactNode = (() => {
    switch (activeStep) {
      case 0:
        return (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
            <div className="grid gap-4">
              <div className="story-scene stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-5">
                <div className="scene-brow mb-3 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <Scale className="h-4 w-4" />
                  Main question
                </div>
                <p className="text-3xl leading-snug">{narrativeQuestion}</p>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">{topic.definition}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">A Yes answer favors</div>
                  <div className="mt-1 font-serif text-xl font-semibold">{yesSide}</div>
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">{topic.yesMeans}</p>
                </div>
                <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="text-xs text-[var(--muted-foreground)]">A No answer favors</div>
                  <div className="mt-1 font-serif text-xl font-semibold">{counterSide}</div>
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    The samples test when this side starts to look stronger.
                  </p>
                </div>
              </div>
            </div>
            <div className="insight-banner stage-card rounded-md border border-[var(--line)] bg-[var(--card-muted)] p-5">
              <div className="scene-brow">How this session works</div>
              <p className="mt-2 text-xl leading-8">
                Start with instinct, then pressure-test it against real model reasoning.
              </p>
              <div className="grid gap-2">
                {[
                  "Choose the answer you align with before the prompt is visible.",
                  "Reveal the prompt and check whether your pick still holds.",
                  "Use one debate and the full data to decide where you land.",
                ].map((line, index) => (
                  <div
                    key={line}
                    className="evidence-tile flex items-center gap-3 rounded-md border border-[var(--line-subtle)] bg-[var(--surface)] px-3 py-2 text-sm"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--line)] font-semibold">
                      {getRomanStep(index)}
                    </span>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <SampleStep
            key={sampleOne?.id ?? "sample-1"}
            topicSlug={topic.slug}
            label="Sample 1"
            question={sampleOne}
          />
        );
      case 2:
        return (
          <SampleStep
            key={sampleTwo?.id ?? "sample-2"}
            topicSlug={topic.slug}
            label="Sample 2"
            question={sampleTwo}
          />
        );
      case 3:
        return (
          <SampleStep
            key={sampleThree?.id ?? "sample-3"}
            topicSlug={topic.slug}
            label="Sample 3"
            question={sampleThree}
          />
        );
      case 4:
        return (
          <SampleStep
            key={sampleFour?.id ?? "sample-4"}
            topicSlug={topic.slug}
            label="Sample 4"
            question={sampleFour}
          />
        );
      case 5:
        return <DebateStep conversation={featuredConversation} />;
      case 6:
        return (
          <div className="grid gap-4">
            {topicMetric && metricHighlights ? (
              <>
                <div className="insight-banner stage-card rounded-md border border-[var(--line)] bg-[var(--card-muted)] p-5">
                  <div className="scene-brow">Whole topic signal</div>
                  <p className="mt-2 text-xl leading-8">
                    {getMetricNarrative(metricHighlights)}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
                    {formatPercentFromRate(topicMetric.conditionDisagreementRate)} of prompts changed
                    answer across setups, and {formatPercentFromRate(topicMetric.stalemateRate)} hit
                    at least one 2-2 split.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <BarChart3 className="h-4 w-4" />
                    Highest Yes rate
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatPercent(metricHighlights.strongest.value)}
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {metricHighlights.strongest.label}
                  </p>
                </div>
                <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <Shuffle className="h-4 w-4" />
                    Setup changed answer
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatPercentFromRate(topicMetric.conditionDisagreementRate)}
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Prompts where the four setups did not land the same way.
                  </p>
                </div>
                <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <UsersRound className="h-4 w-4" />
                    Debate switchers
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatPercentFromRate(topicMetric.anyMindChangedRate)}
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Prompts where at least one agent changed answer during a debate.
                  </p>
                </div>
                <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <MessageSquareText className="h-4 w-4" />
                    Split rate
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatPercentFromRate(topicMetric.stalemateRate)}
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Prompts where at least one setup ended in a 2-2 split.
                  </p>
                </div>
                </div>
              </>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-2">
              <ConditionBarChart metrics={topicMetrics} title="Yes Rate by Setup" />
              <RoundsCompareChart metrics={topicMetrics} title="Average Debate Length" />
            </div>
            <TopicFeedbackCheckpoint
              topicSlug={topic.slug}
              stage="Whole topic"
              prompt={`After the topic-wide evidence, which side feels best supported?\nYes: lean ${yesSide}. No: lean ${counterSide}.`}
              showEvidenceSlider
            />
          </div>
        );
      default:
        return (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="grid gap-3">
              <div className="final-floor stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-5">
                <div className="scene-brow mb-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <CheckCircle2 className="h-4 w-4" />
                  Closing vote
                </div>
                <p className="text-xl leading-8">
                  You have seen blind arguments, the hidden cases behind them, one full debate, and
                  the wider topic pattern.
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">
                  You matched yourself to blind answers, revealed three cases, inspected one real
                  debate, and then checked the full topic pattern.
                </p>
              </div>
              <div className="stage-card rounded-md border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="text-xs text-[var(--muted-foreground)]">Question count</div>
                <div className="mt-1 font-serif text-xl font-semibold">{topic.questionCount} prompts</div>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  This final vote should reflect both the sample cases and the broader run data.
                </p>
              </div>
            </div>
            <TopicFeedbackCheckpoint
              topicSlug={topic.slug}
              stage="Final answer"
              prompt={`After the full session, where do you land?\nYes: lean ${yesSide}. No: lean ${counterSide}.`}
              showEvidenceSlider
            />
          </div>
        );
    }
  })();

  return (
    <div className="page-enter grid gap-5">
      <section className="forum-hero">
        <div className="forum-hero-content">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">{topic.spectrum}</Badge>
              <Badge variant="subtle">{topic.questionCount} prompts</Badge>
            </div>
            <h1 className="forum-title mt-4">{topic.title}</h1>
            <p className="forum-subtitle mt-4">{narrativeQuestion}</p>
            <p className="mt-2 text-[var(--muted-foreground)]">{topic.definition}</p>
          </div>
          <div className="forum-action grid justify-items-end gap-3">
            <div className="senate-seal" aria-hidden="true">
              AS
            </div>
            <Button asChild variant="outline">
              <Link href="/topics">
                <ArrowLeft className="h-4 w-4" />
                Topics
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="chamber-floor">
        <section className="chamber-rail grid gap-2 sm:grid-cols-3 xl:grid-cols-7">
          {STORY_STEPS.map((step, index) => (
            <button
              key={step.shortTitle}
              type="button"
              onClick={() => setActiveStep(index)}
              aria-current={activeStep === index ? "step" : undefined}
              className={`chamber-step rounded-md border px-3 py-3 pl-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bronze)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
                activeStep === index
                  ? "border-[var(--accent-strong)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--bronze)] hover:bg-[var(--card-muted)]"
              }`}
            >
              <div
                className={`text-xs ${
                  activeStep === index
                    ? "text-[var(--accent-foreground)]"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                {getRomanStep(index)}
              </div>
              <div className="font-serif text-base font-semibold">{step.shortTitle}</div>
            </button>
          ))}
        </section>

        <section className="chamber-stage senate-panel p-5 md:p-6">
          <StoryHeader
            stepLabel={getRomanStep(activeStep)}
            title={STORY_STEPS[activeStep].title}
            kicker={STORY_STEPS[activeStep].kicker}
          />
          <div key={`${slug}-${activeStep}`} className="chamber-content min-h-[440px]">
            {activeContent}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-subtle)] pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={isFirstStep}
              onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm text-[var(--muted-foreground)]">
              Session {getRomanStep(activeStep)} of {getRomanStep(STORY_STEPS.length - 1)}
            </div>
            {isLastStep ? (
              <Button type="button" onClick={() => router.push("/")}>
                Back to Home
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  setActiveStep((current) => Math.min(STORY_STEPS.length - 1, current + 1))
                }
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
