"use client";

import { useEffect, useState } from "react";
import {
  getAllQuestions,
  getManifest,
  getOverviewMetrics,
  getQuestionConversations,
  getTopicDemoSamples,
  getTopicConversations,
  getTopicQuestions,
  getVisualizationDataset,
} from "@/lib/data-client";
import {
  type ConversationItem,
  type DataManifest,
  type QuestionItem,
  type TopicMetric,
  type VisualizationDataset,
} from "@/lib/types";

interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  requestKey: string;
}

function useQueryState<T>(queryFn: () => Promise<T>, deps: unknown[]) {
  const requestKey = JSON.stringify(deps);
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    isLoading: true,
    error: null,
    requestKey,
  });

  useEffect(() => {
    let cancelled = false;
    queryFn()
      .then((data) => {
        if (!cancelled) {
          setState({ data, isLoading: false, error: null, requestKey });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            isLoading: false,
            error: error instanceof Error ? error.message : "Unknown error",
            requestKey,
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  if (state.requestKey !== requestKey) {
    return {
      data: null,
      error: null,
      isLoading: true,
    };
  }

  return {
    data: state.data,
    error: state.error,
    isLoading: state.isLoading,
  };
}

export function useManifest() {
  return useQueryState<DataManifest>(getManifest, []);
}

export function useTopicQuestions(topicSlug: string) {
  return useQueryState<QuestionItem[]>(() => getTopicQuestions(topicSlug), [topicSlug]);
}

export function useQuestions(topicSlug: "all" | string | null) {
  return useQueryState<QuestionItem[]>(
    () =>
      !topicSlug
        ? Promise.resolve([])
        : topicSlug === "all"
          ? getAllQuestions()
          : getTopicQuestions(topicSlug),
    [topicSlug]
  );
}

export function useTopicConversations(topicSlug: string) {
  return useQueryState<ConversationItem[]>(
    () => getTopicConversations(topicSlug),
    [topicSlug]
  );
}

export function useQuestionConversations(questionId: string | null) {
  return useQueryState<ConversationItem[]>(
    () => (questionId ? getQuestionConversations(questionId) : Promise.resolve([])),
    [questionId]
  );
}

export function useAllQuestions() {
  return useQueryState<QuestionItem[]>(getAllQuestions, []);
}

export function useOverviewMetrics() {
  return useQueryState<TopicMetric[]>(getOverviewMetrics, []);
}

export function useVisualizationDataset() {
  return useQueryState<VisualizationDataset>(getVisualizationDataset, []);
}

export function useDemoSamples(topicSlug: string) {
  return useQueryState<any[]>(() => getTopicDemoSamples(topicSlug), [topicSlug]);
}
