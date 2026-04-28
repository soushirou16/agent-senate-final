"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type TopicMetric } from "@/lib/types";

const CONDITIONS = [
  "Single, No Role",
  "Single, Role",
  "Debate, No Role",
  "Debate, Role",
] as const;

export function ConditionBarChart({
  metrics,
  title = "Yes Rate by Condition",
}: {
  metrics: TopicMetric[];
  title?: string;
}) {
  const data = CONDITIONS.map((condition) => {
    const yesRate =
      metrics.reduce((sum, topicMetric) => sum + topicMetric.yesRateByCondition[condition], 0) /
      Math.max(metrics.length, 1);
    return {
      condition: condition.replace("Debate", "Group"),
      yesRate: Number((yesRate * 100).toFixed(1)),
    };
  });

  return (
    <Card className="stage-card h-full min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px] min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" />
            <XAxis dataKey="condition" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              formatter={(value) => `${value}%`}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--surface)",
              }}
            />
            <Bar dataKey="yesRate" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
