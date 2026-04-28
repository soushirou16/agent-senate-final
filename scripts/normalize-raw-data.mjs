import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const rawDataDir = path.join(rootDir, "data");

const TOPIC_ABBREVIATIONS = {
  "Data Privacy": "DP",
  "Fast Deployment": "FD",
  "Free Choice": "FC",
  "Immediate Support": "IS",
  "Individual Rights": "IR",
  "Institutional Confidence": "IC",
  "Personal Agency": "PA",
  "Public Safety": "PS",
  "Rule Consistency": "RC",
  "Self Expression": "SE",
};

const CONDITION_TARGETS = {
  single_no_role: ({ abbr }) => `${abbr}-single-norole.json`,
  single_role: ({ abbr }) => `${abbr}-single-role.json`,
  debate_no_role: ({ abbr }) => `${abbr}-group-norole.json`,
  debate_role: ({ abbr }) => `${abbr}-group-role.json`,
};

const CONDITION_ORDER = [
  "single_no_role",
  "single_role",
  "debate_no_role",
  "debate_role",
];

function inferConditionKey(fileName) {
  const lower = fileName.toLowerCase();
  const runMode = lower.includes("single") ? "single" : "debate";
  const roleMode = lower.includes("no role") || lower.includes("norole") ? "no-role" : "role";
  return `${runMode}_${roleMode.replace("-", "_")}`;
}

function parseRangesFromFileName(fileName) {
  return [...fileName.matchAll(/(\d+)-(\d+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

function expandRanges(ranges) {
  return ranges.flatMap(([start, end]) =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index)
  );
}

function stableStringify(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function mergeAgents(existingAgents = [], incomingAgents = []) {
  const byName = new Map();
  for (const agent of [...existingAgents, ...incomingAgents]) {
    byName.set(agent.name, agent);
  }
  return [...byName.values()];
}

function mergeRoles(existingRoles = {}, incomingRoles = {}) {
  return { ...existingRoles, ...incomingRoles };
}

function sortResults(results) {
  return [...results].sort((left, right) => left.question_number - right.question_number);
}

function remapResultsIfNeeded(payload, fileName) {
  const explicitRanges = parseRangesFromFileName(fileName);
  const explicitQuestionNumbers = expandRanges(explicitRanges);
  const sourceQuestionNumbers = (payload.results ?? []).map((result) => result.question_number);
  const sourceMatchesExpandedRanges =
    explicitQuestionNumbers.length > 0 &&
    explicitQuestionNumbers.length === sourceQuestionNumbers.length &&
    explicitQuestionNumbers.every((questionNumber) => sourceQuestionNumbers.includes(questionNumber));
  const sourceIsChunkLocalSequence =
    explicitQuestionNumbers.length > 0 &&
    explicitQuestionNumbers.length === sourceQuestionNumbers.length &&
    sourceQuestionNumbers.every((questionNumber, index) => questionNumber === index + 1);

  return (payload.results ?? []).map((result, index) => ({
    ...result,
    question_number:
      sourceMatchesExpandedRanges || !sourceIsChunkLocalSequence
        ? result.question_number
        : explicitQuestionNumbers[index],
  }));
}

function buildMergedPayload(conditionKey, fileEntries) {
  let merged = null;
  const resultMap = new Map();

  for (const entry of fileEntries) {
    const payload = entry.payload;
    const remappedResults = remapResultsIfNeeded(payload, entry.fileName);

    if (!merged) {
      merged = {
        ...payload,
        results: [],
        agents: mergeAgents([], payload.agents ?? []),
        roles: mergeRoles({}, payload.roles ?? {}),
      };
    } else {
      merged = {
        ...merged,
        timestamp: merged.timestamp ?? payload.timestamp,
        concede_threshold: merged.concede_threshold ?? payload.concede_threshold,
        questions_count: Math.max(merged.questions_count ?? 0, payload.questions_count ?? 0),
        total_permutations: merged.total_permutations ?? payload.total_permutations,
        agents: mergeAgents(merged.agents ?? [], payload.agents ?? []),
        roles: mergeRoles(merged.roles ?? {}, payload.roles ?? {}),
      };
    }

    for (const result of remappedResults) {
      resultMap.set(result.question_number, result);
    }
  }

  const sortedResults = sortResults([...resultMap.values()]);
  merged.results = sortedResults;
  merged.questions_count = sortedResults.length;

  if (conditionKey === "single_no_role" || conditionKey === "debate_no_role") {
    delete merged.total_permutations;
    if (!merged.roles || Object.keys(merged.roles).length === 0) {
      delete merged.roles;
    }
  }

  return merged;
}

async function main() {
  const topicDirs = (await fs.readdir(rawDataDir)).sort((a, b) => a.localeCompare(b));

  for (const topicDirName of topicDirs) {
    const topicDir = path.join(rawDataDir, topicDirName);
    const stat = await fs.stat(topicDir);
    if (!stat.isDirectory()) continue;

    const abbr = TOPIC_ABBREVIATIONS[topicDirName];
    if (!abbr) {
      throw new Error(`Missing abbreviation for topic: ${topicDirName}`);
    }

    const fileNames = (await fs.readdir(topicDir)).filter((name) => name.endsWith(".json"));
    const grouped = new Map(CONDITION_ORDER.map((conditionKey) => [conditionKey, []]));

    for (const fileName of fileNames) {
      const filePath = path.join(topicDir, fileName);
      const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
      const conditionKey = inferConditionKey(fileName);
      grouped.get(conditionKey).push({ fileName, filePath, payload });
    }

    const expectedNumbersByCondition = new Map();
    const writes = [];

    for (const conditionKey of CONDITION_ORDER) {
      const entries = grouped.get(conditionKey) ?? [];
      if (entries.length === 0) {
        throw new Error(`Missing ${conditionKey} data for topic ${topicDirName}`);
      }

      const mergedPayload = buildMergedPayload(conditionKey, entries);
      expectedNumbersByCondition.set(
        conditionKey,
        new Set(mergedPayload.results.map((result) => result.question_number))
      );

      const targetName = CONDITION_TARGETS[conditionKey]({ abbr });
      const targetPath = path.join(topicDir, targetName);
      writes.push({ targetPath, content: stableStringify(mergedPayload) });
    }

    const reference = expectedNumbersByCondition.get(CONDITION_ORDER[0]);
    for (const conditionKey of CONDITION_ORDER.slice(1)) {
      const current = expectedNumbersByCondition.get(conditionKey);
      if (
        reference.size !== current.size ||
        [...reference].some((questionNumber) => !current.has(questionNumber))
      ) {
        throw new Error(
          `Question number mismatch inside topic ${topicDirName} between ${CONDITION_ORDER[0]} and ${conditionKey}`
        );
      }
    }

    for (const fileName of fileNames) {
      await fs.rm(path.join(topicDir, fileName));
    }

    for (const write of writes) {
      await fs.writeFile(write.targetPath, write.content);
    }

    for (const write of writes) {
      const rewrittenContent = await fs.readFile(write.targetPath, "utf8");
      if (rewrittenContent.trim().length === 0) {
        throw new Error(`Failed to write normalized file ${write.targetPath}`);
      }
    }

    console.log(`Normalized ${topicDirName}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
