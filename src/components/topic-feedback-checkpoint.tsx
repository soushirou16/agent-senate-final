"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, MessageSquareText, Scale } from "lucide-react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type AnswerValue } from "@/lib/types";
import { cn } from "@/lib/utils";

const ANSWERS: AnswerValue[] = ["Yes", "No", "Maybe"];
const SCALE_VALUES = [1, 2, 3, 4, 5] as const;
const CERTAINTY_LABELS = ["Tentative", "Leaning", "Open", "Firm", "Certain"] as const;
const EVIDENCE_LABELS = ["None", "Light", "Some", "Strong", "Decisive"] as const;

function ScaleSelector({
  title,
  value,
  onChange,
  labels,
}: {
  title: string;
  value: number;
  onChange: (next: number) => void;
  labels: readonly string[];
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-[var(--muted-foreground)]">{labels[value - 1]}</div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {SCALE_VALUES.map((level) => (
          <button
            key={level}
            type="button"
            aria-pressed={value === level}
            onClick={() => onChange(level)}
            className={cn(
              "strength-chip rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-sm font-semibold transition-colors",
              value === level &&
                "border-[var(--accent-strong)] bg-[var(--accent-muted)] text-[var(--accent-strong)]"
            )}
          >
            {level}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}

export function TopicFeedbackCheckpoint({
  topicSlug,
  stage,
  prompt,
  questionId,
  questionNumber,
  showEvidenceSlider = false,
}: {
  topicSlug: string;
  stage: string;
  prompt: string;
  questionId?: string;
  questionNumber?: number;
  showEvidenceSlider?: boolean;
}) {
  const pathname = usePathname();
  const { submit } = useFeedback();
  const [answer, setAnswer] = useState<AnswerValue | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [evidenceUsefulness, setEvidenceUsefulness] = useState(3);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);
  const [showNote, setShowNote] = useState(false);

  return (
    <div className="feedback-tablet rounded-md border border-[var(--line)] bg-[var(--surface)] p-4 pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-[var(--accent-strong)]" />
          <h3 className="font-serif text-lg font-semibold">Judgment Check</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="subtle">{stage}</Badge>
          {saved ? <Badge variant="accent">Saved</Badge> : null}
        </div>
      </div>

      <div className="story-scene mb-4 rounded-md border border-[var(--line-subtle)] bg-[var(--card)] p-4">
        <div className="scene-brow mb-2">Your vote</div>
        <p className="text-base leading-7">{prompt}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            {ANSWERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={answer === value}
                onClick={() => {
                  setAnswer(value);
                  setSaved(false);
                }}
                className={cn(
                  "vote-button choice-pill min-h-[78px] rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-semibold transition-colors",
                  answer === value &&
                    "border-[var(--accent-strong)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                )}
              >
                <div className="text-xs opacity-70">Vote</div>
                <div className="mt-1 font-serif text-xl">{value}</div>
              </button>
            ))}
          </div>

          <ScaleSelector
            title="How certain does that feel?"
            value={confidence}
            labels={CERTAINTY_LABELS}
            onChange={(next) => {
              setConfidence(next);
              setSaved(false);
            }}
          />

          {showEvidenceSlider ? (
            <ScaleSelector
              title="How much did the evidence move you?"
              value={evidenceUsefulness}
              labels={EVIDENCE_LABELS}
              onChange={(next) => {
                setEvidenceUsefulness(next);
                setSaved(false);
              }}
            />
          ) : null}
        </div>

        <div className="verdict-summary stage-card rounded-md border border-[var(--line)] bg-[var(--card-muted)] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <Scale className="h-4 w-4" />
            Current read
          </div>
          <div className="font-serif text-3xl">{answer ?? "Undecided"}</div>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {answer
              ? `Certainty ${confidence}/5.`
              : "Pick the side that feels most justified after this stage."}
          </p>
          {showEvidenceSlider ? (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Evidence impact {evidenceUsefulness}/5.
            </p>
          ) : null}

          {showNote ? (
            <div className="note-drawer mt-4 grid gap-2 border-t border-[var(--line-subtle)] pt-4">
              <div className="text-sm font-semibold">Optional note</div>
              <Textarea
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setSaved(false);
                }}
                placeholder="What pushed you toward that answer?"
              />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowNote((current) => !current)}
            >
              {showNote ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide note
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Add note
                </>
              )}
            </Button>
            <Button
              type="button"
              disabled={!answer}
              onClick={() => {
                submit({
                  pagePath: pathname,
                  topicSlug,
                  stage,
                  questionId: questionId ?? null,
                  questionNumber: questionNumber ?? null,
                  questionText: prompt,
                  userAnswer: answer,
                  confidence,
                  evidenceUsefulness: showEvidenceSlider ? evidenceUsefulness : undefined,
                  perceptionGap: confidence,
                  clarity: confidence,
                  chartUsefulness: showEvidenceSlider ? evidenceUsefulness : 3,
                  comment: comment.trim(),
                });
                setSaved(true);
              }}
            >
              Record Vote
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
