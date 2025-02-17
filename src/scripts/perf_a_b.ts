/* istanbul ignore file. */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import chalk from "chalk";
import ttest from "ttest";

import { assert, checkPresent } from "@/common/assert";
import { METRICS_DIR, type PerformanceTestResult } from "@/perf/e2e_perf";
import { safeParseInt } from "@/common/misc_utils";

const BASE_COMMAND = "npx playwright test --grep performance/*.test.ts";

function readResults(): PerformanceTestResult[] {
  const resultFiles = fs
    .readdirSync(METRICS_DIR)
    .filter((file) => file.endsWith(".json"));
  if (resultFiles.length === 0) {
    throw new Error(`No results found in directory: ${METRICS_DIR}`);
  }
  return resultFiles.flatMap((file) =>
    JSON.parse(fs.readFileSync(path.join(METRICS_DIR, file), "utf-8"))
  );
}

function runPerformanceTest(tag: string): PerformanceTestResult[] {
  console.log(`Running performance tests for tag: ${tag}`);
  const iters = findArg("N", false) ?? "25";
  const env = [`IMAGE_TAG=${tag}`, `PERF_TEST_ITERATIONS=${iters}`];
  const args: string[] = [];

  const cpuThrottle = safeParseInt(findArg("cpuThrottle", false));
  if (cpuThrottle !== undefined) {
    env.push(`CPU_THROTTLE=${cpuThrottle}`);
  }
  if (process.argv.includes("--largeOnly")) {
    args.push("--project=chromium");
  }

  const command = `${env.join(" ")} ${BASE_COMMAND} ${args.join(" ")}`;
  execSync(command, { stdio: "inherit" });
  return readResults();
}

function runABTest(tagA: string, tagB: string): void {
  const resultsA = runPerformanceTest(tagA);
  const resultsB = runPerformanceTest(tagB);
  compareResults(resultsA, resultsB);
}

function testIdToKey(testId: PerformanceTestResult["testId"]): string {
  return Object.values(testId).sort().join("+");
}

function resultsByKey(
  results: PerformanceTestResult[]
): Map<string, PerformanceTestResult> {
  const resultsByKey = new Map<string, PerformanceTestResult>();
  for (const result of results) {
    const key = testIdToKey(result.testId);
    const existing = resultsByKey.get(key);
    if (existing === undefined) {
      resultsByKey.set(key, result);
      continue;
    }
    for (const [metric, values] of Object.entries(result.metrics)) {
      if (existing.metrics[metric]) {
        existing.metrics[metric].push(...values);
      } else {
        existing.metrics[metric] = values;
      }
    }
  }
  return resultsByKey;
}

function compareResults(
  resultsA: PerformanceTestResult[],
  resultsB: PerformanceTestResult[]
): void {
  const resultsByKeyA = resultsByKey(resultsA);
  const resultsByKeyB = resultsByKey(resultsB);
  const keys = new Set(resultsByKeyA.keys());
  for (const keyB of resultsByKeyB.keys()) {
    assert(keys.has(keyB), `Key not found in A: ${keyB}`);
  }

  const sorted = Array.from(keys).sort((a, b) => {
    const aId = resultsByKeyA.get(a)!.testId;
    const bId = resultsByKeyB.get(b)!.testId;
    return aId.name.localeCompare(bId.name);
  });
  printComparisonHeader();
  for (const key of sorted) {
    const resultA = checkPresent(resultsByKeyA.get(key));
    const resultB = checkPresent(resultsByKeyB.get(key));
    printComparison(resultA, resultB);
  }
}

function printComparisonHeader() {
  console.log(chalk.bgBlue("\nPerformance test comparison"));
  const tagA = findArg("A", true);
  const tagB = findArg("B", true);
  console.log(`- A is "${tagA}", B is "${tagB}"`);
  console.log(`- ${chalk.red("Red")} means ${tagB} is higher than ${tagA}`);
  console.log(`- ${chalk.green("Green")} means ${tagB} is lower than ${tagA}`);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function printComparison(
  resultA: PerformanceTestResult,
  resultB: PerformanceTestResult
) {
  console.log(
    chalk.blue(`\nComparing scenario: ${JSON.stringify(resultA.testId)}`)
  );
  const metricsA = resultA.metrics;
  const metricsB = resultB.metrics;
  const keys = new Set([...Object.keys(metricsA), ...Object.keys(metricsB)]);
  const longestKeyLength = Math.max(
    ...Array.from(keys).map((key) => key.length)
  );
  const verbose = process.argv.includes("--verbose");
  for (const key of keys) {
    const valuesA = metricsA[key];
    const valuesB = metricsB[key];
    if (valuesA === undefined || valuesB === undefined) {
      console.log(`Missing value for key: ${key}`);
      continue;
    }

    const stats = ttest(valuesA, valuesB, { alpha: 0.04 });
    const meanA = mean(valuesA);
    const meanB = mean(valuesB);
    const rawDiff = meanB - meanA;

    // If the null hypothesis is valid (e.g. there was no statistically significant difference),
    // then we can skip printing the result unles we're in verbose mode.
    const noDiff = Math.abs(rawDiff) < 0.00000000001;
    if (
      (stats.valid() || (noDiff && Number.isNaN(stats.pValue()))) &&
      !verbose
    ) {
      continue;
    }
    const sign = rawDiff > 0 ? "+" : "";
    const diffPercent = ((rawDiff / meanA) * 100).toFixed(2);
    const diffText = (rawDiff > 0 ? chalk.red : chalk.green)(
      `${sign}${diffPercent}%`.padEnd(7)
    );
    const values = chalk.gray(`   ${meanA} -> ${meanB}`);
    const paddedKey = key.padEnd(longestKeyLength, " ");
    const pValue = stats.pValue().toPrecision(4);
    console.log(`• ${chalk.cyan(paddedKey)} | ${diffText} | p=${pValue}`);
    console.log(values);
  }
}

function findArg(name: string, required: true): string;
function findArg(name: string, required?: false): string | undefined;
function findArg(name: string, required?: boolean): string | undefined {
  const prefix = `--${name}=`;
  const matches = process.argv.filter((arg) => arg.startsWith(prefix));
  assert(matches.length <= 1, `Multiple matches for arg: ${name}`);
  if (required) {
    assert(matches.length === 1, `Missing required arg: --${name}`);
  }
  return matches.length === 1 ? matches[0].slice(prefix.length) : undefined;
}

const tagA = findArg("A", true);
const tagB = findArg("B", true);
if (!tagA || !tagB) {
  console.error("Please provide two tags for the versions to test.");
  process.exit(1);
}
try {
  runABTest(tagA, tagB);
} catch (error) {
  console.error("Error running performance tests:", error);
  process.exit(1);
}
