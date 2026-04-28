import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public", "data");
const manifestPath = path.join(publicDir, "manifest.json");
const outputPath = path.join(publicDir, "metrics", "visualization.json");

const CONDITION_KEYS = ["single_no_role", "single_role", "debate_no_role", "debate_role"];
const AGENTS = ["ChatGPT", "Claude", "Gemini", "Grok"];
const REVERSE_CODED_TOPICS = new Set(["data-privacy"]);

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function parseAspectLabels(title) {
  const [firstAspect = title, secondAspect = ""] = title.split(" vs ");
  return { firstAspect, secondAspect };
}

function outcomeToAspect(outcome, yesLeansFirst) {
  if (outcome === "Maybe" || outcome === "Stalemate" || outcome === "ERROR") {
    return "undecided";
  }

  if (outcome === "Yes") {
    return yesLeansFirst ? "first" : "second";
  }

  if (outcome === "No") {
    return yesLeansFirst ? "second" : "first";
  }

  return "undecided";
}

function createCounter() {
  return { first: 0, second: 0, undecided: 0, stalemate: 0, total: 0 };
}

function ratesFromCounter(counter) {
  const total = Math.max(counter.total, 1);
  const firstRate = (counter.first / total) * 100;
  const secondRate = (counter.second / total) * 100;
  const undecidedRate = (counter.undecided / total) * 100;
  return {
    firstRate: round(firstRate),
    secondRate: round(secondRate),
    undecidedRate: round(undecidedRate),
    netLean: round(firstRate - secondRate),
    stalemateRate: round((counter.stalemate / total) * 100),
    mindChangedRate: null,
    initialAgreementRate: null,
    avgDebateRounds: null,
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const manifest = await readJson(manifestPath);
  const topicLean = [];
  const singleNoRoleAgentLean = [];
  const persuadabilityAccumulator = new Map();

  let totalQuestions = 0;
  let debateShiftNoRoleSum = 0;
  let debateShiftRoleSum = 0;

  for (const topic of manifest.topics) {
    const questionPath = path.join(publicDir, "questions", `${topic.slug}.json`);
    const conversationPath = path.join(publicDir, "conversations", `${topic.slug}.json`);
    const questionChunk = await readJson(questionPath);
    const conversationChunk = await readJson(conversationPath);

    const { firstAspect, secondAspect } = parseAspectLabels(topic.title);
    const yesLeansFirst = !REVERSE_CODED_TOPICS.has(topic.slug);
    const conditionCounters = Object.fromEntries(
      CONDITION_KEYS.map((key) => [key, createCounter()])
    );
    const agentCounters = Object.fromEntries(
      AGENTS.map((agent) => [agent, createCounter()])
    );

    let debateOutcomeFlipsNoRole = 0;
    let debateOutcomeFlipsRole = 0;
    let mindChangedNoRole = 0;
    let mindChangedRole = 0;

    for (const item of questionChunk.items) {
      totalQuestions += 1;

      for (const conditionKey of CONDITION_KEYS) {
        const summary = item.conditionSummary?.[conditionKey];
        const bucket = outcomeToAspect(summary?.outcome ?? summary?.rawOutcome, yesLeansFirst);
        conditionCounters[conditionKey][bucket] += 1;
        if (summary?.rawOutcome === "Stalemate") {
          conditionCounters[conditionKey].stalemate += 1;
        }
        conditionCounters[conditionKey].total += 1;
      }

      for (const agent of AGENTS) {
        const decision = item.agentVotes?.single_no_role?.[agent] ?? "Maybe";
        const bucket = outcomeToAspect(decision, yesLeansFirst);
        agentCounters[agent][bucket] += 1;
        agentCounters[agent].total += 1;
      }

      if (
        item.conditionSummary?.single_no_role?.outcome !== item.conditionSummary?.debate_no_role?.outcome
      ) {
        debateOutcomeFlipsNoRole += 1;
      }

      if (item.conditionSummary?.single_role?.outcome !== item.conditionSummary?.debate_role?.outcome) {
        debateOutcomeFlipsRole += 1;
      }

      for (const agent of AGENTS) {
        const response = item.conditionDetails?.single_no_role?.responses?.[agent];
        if (!response) continue;
        if (!persuadabilityAccumulator.has(agent)) {
          persuadabilityAccumulator.set(agent, {
            agent,
            provider: response.provider ?? "unknown",
            model: response.model ?? "unknown",
            noRoleChanged: 0,
            noRoleTotal: 0,
            roleChanged: 0,
            roleTotal: 0,
            roleEffects: new Map(),
          });
        }
      }
    }

    const noRoleConversations = conversationChunk.items.filter(
      (item) => item.roleMode === "no-role"
    );
    const roleConversations = conversationChunk.items.filter((item) => item.roleMode === "role");
    const noRoleRoundsAvg =
      noRoleConversations.reduce((sum, item) => sum + (item.roundsCompleted ?? 0), 0) /
      Math.max(noRoleConversations.length, 1);
    const roleRoundsAvg =
      roleConversations.reduce((sum, item) => sum + (item.roundsCompleted ?? 0), 0) /
      Math.max(roleConversations.length, 1);

    let initialAgreementCount = 0;
    let initialSplitCount = 0;
    let initialAgreementRoleCount = 0;

    for (const conversation of conversationChunk.items) {
      const initialDecisions = AGENTS.map(
        (agent) => conversation.initialResponses?.[agent]?.decision ?? "Maybe"
      );
      const uniqueDecisions = new Set(initialDecisions);

      if (conversation.roleMode === "no-role") {
        if (uniqueDecisions.size === 1) initialAgreementCount += 1;
        const yesCount = initialDecisions.filter((decision) => decision === "Yes").length;
        const noCount = initialDecisions.filter((decision) => decision === "No").length;
        if (yesCount === 2 && noCount === 2) initialSplitCount += 1;
      }else {
        if (uniqueDecisions.size === 1) initialAgreementRoleCount += 1;
      }

      for (const agent of AGENTS) {
        const initial = conversation.initialResponses?.[agent]?.decision ?? "Maybe";
        const final = conversation.finalState?.[agent]?.decision ?? initial;
        const changed = initial !== final;
        const stats = persuadabilityAccumulator.get(agent);

        if (!stats) continue;

        if (conversation.roleMode === "no-role") {
          stats.noRoleTotal += 1;
          if (changed) stats.noRoleChanged += 1;
          if (changed) mindChangedNoRole += 1;
        } else {
          stats.roleTotal += 1;
          if (changed) stats.roleChanged += 1;
          if (changed) mindChangedRole += 1;

          const role = conversation.finalState?.[agent]?.role ?? "Unassigned";
          if (!stats.roleEffects.has(role)) {
            stats.roleEffects.set(role, { role, changed: 0, total: 0 });
          }
          const roleStats = stats.roleEffects.get(role);
          roleStats.total += 1;
          if (changed) roleStats.changed += 1;
        }
      }
    }

    const byCondition = Object.fromEntries(
      CONDITION_KEYS.map((conditionKey) => [
        conditionKey,
        ratesFromCounter(conditionCounters[conditionKey]),
      ])
    );

    byCondition.single_no_role.mindChangedRate = null;
    byCondition.single_no_role.initialAgreementRate = null;
    byCondition.single_no_role.avgDebateRounds = null;
    byCondition.single_role.mindChangedRate = null;
    byCondition.single_role.initialAgreementRate = null;
    byCondition.single_role.avgDebateRounds = null;
    byCondition.debate_no_role.mindChangedRate = round(
      (mindChangedNoRole / Math.max(noRoleConversations.length * AGENTS.length, 1)) * 100
    );
    byCondition.debate_no_role.initialAgreementRate = round(
      (initialAgreementCount / Math.max(noRoleConversations.length, 1)) * 100
    );
    byCondition.debate_no_role.avgDebateRounds = round(noRoleRoundsAvg, 2);
    byCondition.debate_role.mindChangedRate = round(
      (mindChangedRole / Math.max(roleConversations.length * AGENTS.length, 1)) * 100
    );
    byCondition.debate_role.initialAgreementRate = round(
      (initialAgreementRoleCount / Math.max(roleConversations.length, 1)) * 100
    );
    byCondition.debate_role.avgDebateRounds = round(roleRoundsAvg, 2);

    const debateShiftNoRole = round(
      byCondition.debate_no_role.netLean - byCondition.single_no_role.netLean
    );
    const debateShiftRole = round(byCondition.debate_role.netLean - byCondition.single_role.netLean);

    debateShiftNoRoleSum += debateShiftNoRole;
    debateShiftRoleSum += debateShiftRole;

    topicLean.push({
      topicSlug: topic.slug,
      title: topic.title,
      spectrum: topic.spectrum,
      firstAspect,
      secondAspect,
      yesLeansFirst,
      questionCount: questionChunk.items.length,
      byCondition,
      debateShiftNoRole,
      debateShiftRole,
      debateOutcomeFlipRateNoRole: round(
        (debateOutcomeFlipsNoRole / Math.max(questionChunk.items.length, 1)) * 100
      ),
      debateOutcomeFlipRateRole: round(
        (debateOutcomeFlipsRole / Math.max(questionChunk.items.length, 1)) * 100
      ),
      avgDebateRoundsNoRole: round(noRoleRoundsAvg, 2),
      avgDebateRoundsRole: round(roleRoundsAvg, 2),
      initialAgreementRateNoRole: round(
        (initialAgreementCount / Math.max(noRoleConversations.length, 1)) * 100
      ),
      initialSplitRateNoRole: round(
        (initialSplitCount / Math.max(noRoleConversations.length, 1)) * 100
      ),
    });

    singleNoRoleAgentLean.push({
      topicSlug: topic.slug,
      title: topic.title,
      spectrum: topic.spectrum,
      firstAspect,
      secondAspect,
      yesLeansFirst,
      byAgent: Object.fromEntries(
        AGENTS.map((agent) => [agent, ratesFromCounter(agentCounters[agent])])
      ),
    });
  }

  const persuadability = AGENTS.map((agent) => {
    const stats = persuadabilityAccumulator.get(agent);
    const overallChanged = stats.noRoleChanged + stats.roleChanged;
    const overallTotal = stats.noRoleTotal + stats.roleTotal;
    return {
      agent,
      provider: stats.provider,
      model: stats.model,
      overallChangeRate: round((overallChanged / Math.max(overallTotal, 1)) * 100),
      noRoleChangeRate: round((stats.noRoleChanged / Math.max(stats.noRoleTotal, 1)) * 100),
      roleChangeRate: round((stats.roleChanged / Math.max(stats.roleTotal, 1)) * 100),
      roleEffects: Array.from(stats.roleEffects.values())
        .map((roleStats) => ({
          role: roleStats.role,
          changeRate: round((roleStats.changed / Math.max(roleStats.total, 1)) * 100),
          sampleSize: roleStats.total,
        }))
        .sort((a, b) => b.changeRate - a.changeRate),
    };
  });

  const averagePersuadability =
    persuadability.reduce((sum, entry) => sum + entry.overallChangeRate, 0) /
    Math.max(persuadability.length, 1);

  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      topicCount: manifest.topics.length,
      questionCount: totalQuestions,
      averageDebateShiftNoRole: round(debateShiftNoRoleSum / Math.max(topicLean.length, 1)),
      averageDebateShiftRole: round(debateShiftRoleSum / Math.max(topicLean.length, 1)),
      averagePersuadability: round(averagePersuadability),
    },
    topicLean,
    singleNoRoleAgentLean,
    persuadability,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
