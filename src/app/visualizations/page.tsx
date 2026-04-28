"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useVisualizationDataset } from "@/hooks/use-study-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONDITION_LABELS, CONDITION_ORDER } from "@/lib/constants";
import {
  type AgentLeanEntry,
  type PersuadabilityAgentEntry,
  type TopicLeanConditionStat,
  type TopicLeanEntry,
} from "@/lib/types";
import { StateBox } from "@/components/state-box";

type HeatmapMetric =
  | "senate-lean"
  | "stalemate-rate"
  | "initial-agreement"
  | "avg-debate-rounds"
  | "mind-changed-rate";

type AgentSort = "default" | "lean";
type DebateEffectMode = "no-role" | "role";

const HEATMAP_OPTIONS: Array<{ value: HeatmapMetric; label: string }> = [
  { value: "senate-lean", label: "Senate Lean" },
  { value: "stalemate-rate", label: "Stalemate%" },
  { value: "initial-agreement", label: "Initial Agreement%" },
  { value: "avg-debate-rounds", label: "Avg Debate Rounds" },
  { value: "mind-changed-rate", label: "% Changed Mind" },
];

const HEATMAP_TITLES: Record<HeatmapMetric, string> = {
  "senate-lean": "Where The Senate Leans",
  "stalemate-rate": "Where Stalemates Cluster",
  "initial-agreement": "Where Initial Agreement Is Highest",
  "avg-debate-rounds": "Where Debate Runs Longest",
  "mind-changed-rate": "Where Minds Change Most Often",
};

function heatColor(metric: HeatmapMetric, value: number | null, maxValue: number) {
  if (value === null) return "transparent";

  if (metric === "senate-lean") {
    const clamped = Math.max(-100, Math.min(100, value));
    const intensity = Math.abs(clamped) / 100;
    if (clamped >= 0) {
      return `hsl(10 58% ${96 - intensity * 34}%)`;
    }
    return `hsl(196 33% ${96 - intensity * 30}%)`;
  }

  const normalized =
    metric === "avg-debate-rounds"
      ? Math.max(0, Math.min(1, value / Math.max(maxValue, 0.001)))
      : Math.max(0, Math.min(1, value / Math.max(maxValue, 0.001)));
  const alpha = 0.06 + normalized * 0.82;
  return `color-mix(in srgb, var(--accent) ${Math.round(alpha * 100)}%, transparent)`;
}

function getHeatmapValue(metric: HeatmapMetric, stat: TopicLeanConditionStat) {
  switch (metric) {
    case "senate-lean":
      return stat.netLean;
    case "stalemate-rate":
      return stat.stalemateRate;
    case "initial-agreement":
      return stat.initialAgreementRate;
    case "avg-debate-rounds":
      return stat.avgDebateRounds;
    case "mind-changed-rate":
      return stat.mindChangedRate;
    default:
      return null;
  }
}

function formatHeatmapValue(metric: HeatmapMetric, value: number | null) {
  if (value === null) return "—";
  if (metric === "senate-lean") return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
  if (metric === "avg-debate-rounds") return value.toFixed(2);
  return `${value.toFixed(1)}%`;
}

function TopicHeatmapModule({ topics }: { topics: TopicLeanEntry[] }) {
  const [metric, setMetric] = useState<HeatmapMetric>("senate-lean");
  const metricMax = useMemo(() => {
    const values = topics.flatMap((topic) =>
      CONDITION_ORDER.map((condition) => getHeatmapValue(metric, topic.byCondition[condition])).filter(
        (value): value is number => value !== null
      )
    );
    return values.length > 0 ? Math.max(...values) : 0;
  }, [metric, topics]);

  return (
    <Card className="stage-card min-w-0">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>{HEATMAP_TITLES[metric]}</CardTitle>
            <CardDescription>
              Switch metrics to compare lean, stalemates, agreement, rounds, and persuasion by
              topic and condition.
            </CardDescription>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Metric
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as HeatmapMetric)}
              className="h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
            >
              {HEATMAP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-2 text-sm">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left font-semibold">Topic</th>
                {CONDITION_ORDER.map((condition) => (
                  <th key={condition} className="px-2 py-1 text-center font-semibold">
                    {CONDITION_LABELS[condition].replace("Debate", "Group")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr key={topic.topicSlug}>
                  <td className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                    <div className="font-semibold">{topic.firstAspect}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">vs {topic.secondAspect}</div>
                  </td>
                  {CONDITION_ORDER.map((condition) => {
                    const stat = topic.byCondition[condition];
                    const value = getHeatmapValue(metric, stat);
                    return (
                      <td
                        key={`${topic.topicSlug}-${condition}`}
                        className="rounded-md border border-[var(--line)] px-3 py-2 text-center"
                        style={{ backgroundColor: heatColor(metric, value, metricMax) }}
                      >
                        <div className="text-base font-semibold">{formatHeatmapValue(metric, value)}</div>
                        <div
                          className="mt-1 text-xs text-[var(--muted-foreground)]"
                          style={{ visibility: metric === "senate-lean" ? "visible" : "hidden" }}
                        >
                          {topic.firstAspect}: {stat.firstRate.toFixed(1)}% | {topic.secondAspect}:{" "}
                          {stat.secondRate.toFixed(1)}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DivergingAgentLean({ entry, sortMode }: { entry: AgentLeanEntry; sortMode: AgentSort }) {
  const rows = useMemo(() => {
    const items = Object.entries(entry.byAgent).map(([agent, stat]) => ({
      agent,
      firstRate: stat.firstRate,
      secondRate: stat.secondRate,
      maybeRate: stat.maybeRate ?? stat.undecidedRate ?? 0,
      lean: stat.firstRate - stat.secondRate,
    }));

    if (sortMode === "lean") {
      return items.sort((left, right) => right.lean - left.lean);
    }

    const order = ["ChatGPT", "Claude", "Gemini", "Grok"];
    return items.sort((left, right) => order.indexOf(left.agent) - order.indexOf(right.agent));
  }, [entry.byAgent, sortMode]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[120px_1fr_72px] items-center gap-3 text-xs text-[var(--muted-foreground)]">
        <div />
        <div className="flex justify-between">
          <span>{entry.firstAspect}</span>
          <span>{entry.secondAspect}</span>
        </div>
        <div className="text-right">Undecided</div>
      </div>
      {rows.map((row) => (
        <div key={row.agent} className="grid grid-cols-[120px_1fr_72px] items-center gap-3">
          <div className="font-semibold">{row.agent}</div>
          <div className="relative h-8 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
            <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--line)]" />
            <div
              className="absolute inset-y-0 right-1/2 bg-[var(--accent)]"
              style={{ width: `${row.firstRate / 2}%` }}
              title={`${entry.firstAspect}: ${row.firstRate.toFixed(1)}%`}
            />
            <div
              className="absolute inset-y-0 left-1/2 bg-[#2d6a73]"
              style={{ width: `${row.secondRate / 2}%` }}
              title={`${entry.secondAspect}: ${row.secondRate.toFixed(1)}%`}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
              {row.lean > 0 ? "+" : ""}
              {row.lean.toFixed(1)}
            </div>
          </div>
          <div className="text-right text-sm text-[var(--muted-foreground)]">
            {row.maybeRate.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentLeanModule({ topics }: { topics: AgentLeanEntry[] }) {
  const [topicSlug, setTopicSlug] = useState(topics[0]?.topicSlug ?? "");
  const [sortMode, setSortMode] = useState<AgentSort>("default");

  const activeEntry = topics.find((topic) => topic.topicSlug === topicSlug) ?? topics[0];

  if (!activeEntry) return null;

  return (
    <Card className="stage-card">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Individual Agent Lean By Topic</CardTitle>
            <CardDescription>
              A diverging bar chart centered on neutral. Left is the first side of the spectrum,
              right is the second.
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <label className="grid gap-1 text-sm font-medium">
              Topic
              <select
                value={activeEntry.topicSlug}
                onChange={(event) => setTopicSlug(event.target.value)}
                className="h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
              >
                {topics.map((topic) => (
                  <option key={topic.topicSlug} value={topic.topicSlug}>
                    {topic.firstAspect} vs {topic.secondAspect}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Sort
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as AgentSort)}
                className="h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
              >
                <option value="default">Default</option>
                <option value="lean">Lean</option>
              </select>
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DivergingAgentLean entry={activeEntry} sortMode={sortMode} />
      </CardContent>
    </Card>
  );
}

function DebateEffectModule({ topics }: { topics: TopicLeanEntry[] }) {
  const [mode, setMode] = useState<DebateEffectMode>("no-role");

  const chartData = useMemo(
    () =>
      topics.map((topic) => {
        const singleCondition = mode === "no-role" ? "single_no_role" : "single_role";
        const groupCondition = mode === "no-role" ? "debate_no_role" : "debate_role";
        const shift = mode === "no-role" ? topic.debateShiftNoRole : topic.debateShiftRole;

        return {
          topic: topic.firstAspect,
          secondAspect: topic.secondAspect,
          singleRate: topic.byCondition[singleCondition].firstRate,
          groupRate: topic.byCondition[groupCondition].firstRate,
          shift,
          plottedShift: -shift,
          flipRate:
            mode === "no-role"
              ? topic.debateOutcomeFlipRateNoRole
              : topic.debateOutcomeFlipRateRole,
        };
      }),
    [mode, topics]
  );

  const averageShift =
    chartData.reduce((sum, item) => sum + Math.abs(item.shift), 0) / Math.max(chartData.length, 1);
  const averageFlipRate =
    chartData.reduce((sum, item) => sum + item.flipRate, 0) / Math.max(chartData.length, 1);
  const maxShiftMagnitude = Math.max(
    ...chartData.map((item) => Math.abs(item.plottedShift)),
    0
  );
  const shiftAxisLimit = Math.max(10, Math.ceil(maxShiftMagnitude / 5) * 5);

  return (
    <Card className="stage-card">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>How Debate Changes The Outcome</CardTitle>
            <CardDescription>
              Each bar shows how far debate moved a topic away from its single-run lean. Left means
              debate shifted toward the first side of the spectrum; right means it shifted toward
              the second side.
            </CardDescription>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Setup
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as DebateEffectMode)}
              className="h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
            >
              <option value="no-role">No Role</option>
              <option value="role">Role</option>
            </select>
          </label>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="text-xs text-[var(--muted-foreground)]">Average debate shift</div>
            <div className="mt-1 text-2xl font-semibold">{averageShift.toFixed(1)} percentage points</div>
            <div className="text-sm text-[var(--muted-foreground)]">
              Average change in topic lean from single to group.
            </div>
          </div>
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="text-xs text-[var(--muted-foreground)]">Outcome flip rate</div>
            <div className="mt-1 text-2xl font-semibold">{averageFlipRate.toFixed(1)}%</div>
            <div className="text-sm text-[var(--muted-foreground)]">
              How often group debate changed the majority outcome versus single.
            </div>
          </div>
        </div>

        <div className="h-[420px] min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 16, left: 12, bottom: 8 }}>
              <CartesianGrid vertical strokeDasharray="3 3" stroke="var(--line-subtle)" horizontal={false} />
              <XAxis
                type="number"
                domain={[-shiftAxisLimit, shiftAxisLimit]}
                ticks={[
                  -shiftAxisLimit,
                  -shiftAxisLimit / 2,
                  0,
                  shiftAxisLimit / 2,
                  shiftAxisLimit,
                ]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(value) => `${value > 0 ? "+" : ""}${value.toFixed(0)}`}
              />
              <YAxis type="category" dataKey="topic" width={124} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <ReferenceLine x={0} stroke="var(--foreground)" strokeOpacity={0.5} />
              <Tooltip
                cursor={{ fill: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;

                  const point = payload[0]?.payload as
                    | {
                        topic: string;
                        secondAspect: string;
                        singleRate: number;
                        groupRate: number;
                        shift: number;
                      }
                    | undefined;

                  if (!point) return null;

                  const movedToward = point.shift >= 0 ? point.topic : point.secondAspect;

                  return (
                    <div
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--surface)",
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {point.topic} vs {point.secondAspect}
                      </div>
                      <div style={{ color: "var(--muted-foreground)", fontSize: 12, marginTop: 4 }}>
                        Single: {point.singleRate.toFixed(1)}% first side
                      </div>
                      <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                        Group: {point.groupRate.toFixed(1)}% first side
                      </div>
                      <div style={{ marginTop: 6 }}>
                        Shifted toward {movedToward} by {Math.abs(point.shift).toFixed(1)} points
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="plottedShift" barSize={20}>
                {chartData.map((item) => (
                  <Cell
                    key={item.topic}
                    fill={item.plottedShift < 0 ? "#c65b4b" : "#2d6a73"}
                    radius={
                      (item.plottedShift < 0 ? [0, 4, 4, 0] : item.plottedShift > 0 ? [0, 4, 4, 0] : 0) as unknown as number
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function PersuadabilityChart({ items }: { items: PersuadabilityAgentEntry[] }) {
  const AXIS_MAX = 30;

  return (
    <Card className="stage-card h-full min-w-0">
      <CardHeader>
        <CardTitle>How Easily Each Model Changes Its Mind</CardTitle>
        <CardDescription>
          Persuadability means how often a model ends a debate with a different answer than the one
          it started with. Higher percentages mean the model was more likely to be persuaded by the
          discussion.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="h-[320px] min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={items} layout="vertical" margin={{ top: 22, right: 28, left: 8, bottom: 8 }}>
              <CartesianGrid vertical stroke="var(--line-subtle)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, AXIS_MAX]}
                ticks={[0, 5, 10, 20, 30]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
              />
              <YAxis
                type="category"
                dataKey="agent"
                width={72}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ stroke: "var(--line)", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;

                  const point = payload[0]?.payload as
                    | {
                        agent: string;
                        model: string;
                        noRoleChangeRate: number;
                        roleChangeRate: number;
                      }
                    | undefined;

                  if (!point) return null;

                  return (
                    <div
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--surface)",
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{point.agent}</div>
                      <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{point.model}</div>
                      <div style={{ marginTop: 4 }}>No role: {point.noRoleChangeRate.toFixed(1)}%</div>
                      <div>With role: {point.roleChangeRate.toFixed(1)}%</div>
                    </div>
                  );
                }}
              />
              {(Legend as any)({
                payload: [
                  { value: "No role", type: "square", color: "var(--bronze)" },
                  { value: "With role", type: "square", color: "var(--accent)" },
                ]
              })}
              <Bar
                name="No role"
                dataKey="noRoleChangeRate"
                fill="var(--bronze)"
                radius={[0, 4, 4, 0]}
                barSize={12}
              />
              <Bar
                name="With role"
                dataKey="roleChangeRate"
                fill="var(--accent)"
                radius={[0, 4, 4, 0]}
                barSize={12}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.agent} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
              <div className="font-semibold">{item.agent}</div>
              <div className="mt-1 text-[var(--muted-foreground)]">
                No role: {item.noRoleChangeRate.toFixed(1)}%
              </div>
              <div className="text-[var(--muted-foreground)]">
                Role: {item.roleChangeRate.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RoleEffectModule({ items }: { items: PersuadabilityAgentEntry[] }) {
  const [agent, setAgent] = useState(items[0]?.agent ?? "");
  const activeEntry = items.find((item) => item.agent === agent) ?? items[0];

  if (!activeEntry) return null;

  return (
    <Card className="stage-card">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Role Effect On {activeEntry.agent}</CardTitle>
            <CardDescription>
              See how each assigned role affected persuadability for one model at a time.
            </CardDescription>
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Agent
            <select
              value={activeEntry.agent}
              onChange={(event) => setAgent(event.target.value as "ChatGPT" | "Claude" | "Gemini" | "Grok")}
              className="h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm"
            >
              {items.map((item) => (
                <option key={item.agent} value={item.agent}>
                  {item.agent}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 text-sm text-[var(--muted-foreground)]">{activeEntry.model}</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {activeEntry.roleEffects.map((role) => (
            <div key={role.role} className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
              <div className="font-semibold">{role.role}</div>
              <div className="mt-1 text-2xl">{role.changeRate.toFixed(1)}%</div>
              <div className="text-xs text-[var(--muted-foreground)]">{role.sampleSize} debates</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function VisualizationsPage() {
  const {
    data: dataset,
    isLoading,
    error,
  } = useVisualizationDataset();

  if (isLoading) {
    return <StateBox title="Loading visualizations..." message="Preparing chart datasets." />;
  }

  if (!dataset || error) {
    return (
      <StateBox
        title="Visualization data unavailable"
        message={error ?? "Could not load metrics."}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <section className="forum-hero">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="forum-hero-content w-full">
            <div className="max-w-4xl">
            <Badge variant="accent" className="w-fit">
              Visualizations
            </Badge>
            <h1 className="forum-title mt-4">Data Visualization</h1>
            <p className="forum-subtitle mt-4">
              Each module stands on its own. Swap metrics, topics, and agents directly inside the
              visualization you are using.
            </p>
            </div>
            <div className="senate-seal" aria-hidden="true">
              AS
            </div>
          </div>
        </div>
      </section>

      <TopicHeatmapModule topics={dataset.topicLean} />
      <DebateEffectModule topics={dataset.topicLean} />
      <AgentLeanModule topics={dataset.singleNoRoleAgentLean} />
      <PersuadabilityChart items={dataset.persuadability} />
      <RoleEffectModule items={dataset.persuadability} />
    </div>
  );
}
