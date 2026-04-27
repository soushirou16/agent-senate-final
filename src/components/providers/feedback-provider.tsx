"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type AgentName, type AnswerValue, type FeedbackEntry } from "@/lib/types";

const STORAGE_KEY = "senate-insight-feedback-v1";

// Maps app stage strings → which Supabase table and which db stage value to use
const STAGE_ROUTES: Record<
  string,
  { table: "choose_argument_responses" | "judgment_check_responses"; dbStage: string }
> = {
  "Sample 1 blind pick": { table: "choose_argument_responses", dbStage: "sample_1" },
  "Sample 2 blind pick": { table: "choose_argument_responses", dbStage: "sample_2" },
  "Sample 3 blind pick": { table: "choose_argument_responses", dbStage: "sample_3" },
  "Sample 1 revealed":   { table: "judgment_check_responses",  dbStage: "sample_1" },
  "Sample 2 revealed":   { table: "judgment_check_responses",  dbStage: "sample_2" },
  "Sample 3 revealed":   { table: "judgment_check_responses",  dbStage: "sample_3" },
  "Whole topic":         { table: "judgment_check_responses",  dbStage: "data" },
  "Final answer":        { table: "judgment_check_responses",  dbStage: "final" },
};

interface NewFeedbackInput {
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

interface FeedbackContextValue {
  entries: FeedbackEntry[];
  sessionId: string | null;
  initSession: (topicSlug: string, topicTitle: string) => Promise<void>;
  submit: (entry: NewFeedbackInput) => void;
  clear: () => void;
  exportJson: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<FeedbackEntry[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as FeedbackEntry[];
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  });

  const [sessionId, setSessionId] = useState<string | null>(null);
  // Ref so the submit callback always reads the latest session ID without stale closure issues
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const initSession = useCallback(async (topicSlug: string, topicTitle: string) => {
    const newId = crypto.randomUUID();
    const { error } = await supabase.from("study_sessions").insert({
      id: newId,
      topic_slug: topicSlug,
      topic_title: topicTitle,
    });
    if (error) {
      console.error("[study_sessions] insert failed:", error.message);
      return;
    }
    sessionIdRef.current = newId;
    setSessionId(newId);
  }, []);

  const submit = useCallback((entry: NewFeedbackInput) => {
    // 1. Persist to localStorage (existing behavior, kept as backup)
    setEntries((current) => [
      {
        ...entry,
        id: `feedback-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);

    // 2. Route to Supabase if a session exists and the stage is recognized
    const sid = sessionIdRef.current;
    if (!sid || !entry.stage) return;

    const route = STAGE_ROUTES[entry.stage];
    if (!route) return;

    if (route.table === "choose_argument_responses") {
      supabase
        .from("choose_argument_responses")
        .upsert(
          {
            session_id: sid,
            stage: route.dbStage,
            question_external_id: entry.questionId ?? null,
            question_number: entry.questionNumber ?? null,
            question_text: entry.questionText ?? null,
            selected_argument: entry.alignedSlot ? `Argument ${entry.alignedSlot}` : "unknown",
            selected_model: entry.alignedAgent ?? null,
            optional_note: entry.comment || null,
          },
          { onConflict: "session_id,stage" }
        )
        .then(({ error }) => {
          if (error) console.error("[choose_argument_responses] upsert failed:", error.message);
        });
    } else if (route.table === "judgment_check_responses") {
      supabase
        .from("judgment_check_responses")
        .upsert(
          {
            session_id: sid,
            stage: route.dbStage,
            question_external_id: entry.questionId ?? null,
            question_number: entry.questionNumber ?? null,
            question_text: entry.questionText ?? null,
            vote: (entry.userAnswer?.toLowerCase() ?? "undecided") as
              | "yes"
              | "no"
              | "maybe"
              | "undecided",
            note: entry.comment || null,
            certainty_score: entry.confidence ?? null,
            evidence_move_score: entry.evidenceUsefulness ?? null,
          },
          { onConflict: "session_id,stage" }
        )
        .then(({ error }) => {
          if (error) console.error("[judgment_check_responses] upsert failed:", error.message);
        });
    }
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "feedback-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  const value = useMemo<FeedbackContextValue>(
    () => ({ entries, sessionId, initSession, submit, clear, exportJson }),
    [entries, sessionId, initSession, submit, clear, exportJson]
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback must be used inside FeedbackProvider");
  }
  return context;
}
