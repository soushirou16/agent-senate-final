"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type TopicMetric } from "@/lib/types";

export function RoundsCompareChart({
  metrics,
  title = "Average Debate Rounds by Topic",
}: {
  metrics: TopicMetric[];
  title?: string;
}) {
  const data = metrics.map((metric) => ({
    topic: metric.topicSlug.replaceAll("-", " "),
    noRole: metric.avgDebateRoundsNoRole,
    role: metric.avgDebateRoundsRole,
  }));

  return (
    <Card className="stage-card h-full min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[320px] min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-subtle)" />
            <XAxis dataKey="topic" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--surface)",
              }}
            />
            <Legend />
            <Bar name="Group, No Role" dataKey="noRole" fill="var(--bronze)" radius={[4, 4, 0, 0]} />
            <Bar name="Group, Role" dataKey="role" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
