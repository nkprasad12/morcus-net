/* istanbul ignore file. */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import chalk from "chalk";
import ttest from "ttest";

import { assert, checkPresent } from "@/common/assert";
import {
  E2E_RAW_METRICS_DIR,
  E2E_REPORTS_DIR,
  type PerformanceTestResult,
} from "@/perf/e2e_perf";
import { safeParseInt } from "@/common/misc_utils";
import { setMap } from "@/common/data_structures/collect_map";

interface ComparedMetric {
  name: string;
  diff: number;
  rawMeans: [number, number];
  samples: number;
  pValue: number;
}

interface PerformanceComparison {
  id: PerformanceTestResult["testId"];
  metrics: Record<string, ComparedMetric>;
}

const BASE_COMMAND = "npx playwright test src/integration/performance/";
const TAG_HEAD = "head";
const SPECIAL_TAGS = new Set(["main-latest", "dev-latest"]);
const CRUCIAL_METRICS = new Set([
  "JSHeapMaxTotal",
  "JSHeapTotalSize",
  "LargestContentfulPaint",
]);

const REPORT_HEAD = `
  <head>
    <style>
      body {
        background-color: #121212;
        color: #e0e0e0;
        font-family: Arial, sans-serif;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #333;
        padding: 8px;
        text-align: left;
        opacity: 0.8;
      }
      th {
        background-color: #333;
      }
      tr:nth-child(even) {
        background-color: #1e1e1e;
      }
      tr:nth-child(odd) {
        background-color: #2a2a2a;
      }
      .diff {
        font-weight: bold;
        opacity: 0.8;
      }
      .diff.positive {
        color: #ff0000;
      }
      .diff.negative {
        color: #00ff00;
      }
      .pValue {
        opacity: 0.9;
        font-size: 0.9em;
      }
      .rawValues {
        opacity: 0.8;
        font-size: 0.75em;
      }
      .scenarioName {
        font-weight: bold;
        color: #00a0a0;
      }
      .scenarioData {
        opacity: 0.9;
        font-size: 0.9em;
        border-radius: 8px;
        background-color: #6a6a6a;
        padding: 0px 6px;
        margin: 0px 4px;
      }
      .compA {
        color: #f0aaff;
      }
      .compB {
        color: #f0a000;
      }   
    </style>
  </head>`;

function generateCiReport(results: PerformanceComparison[]) {
  interface ReportStats {
    screenSize: string;
    improved: ReturnType<typeof setMap<string, string>>;
    regressed: ReturnType<typeof setMap<string, string>>;
  }
  const allStats = new Map<string, ReportStats>();
  for (const result of results) {
    const id = result.id;
    for (const key of Object.keys(result.metrics)) {
      if (!CRUCIAL_METRICS.has(key)) {
        continue;
      }
      const metric = result.metrics[key];
      if (metric.pValue > 0.01) {
        continue;
      }
      if (Math.abs(metric.diff) < 0.01) {
        continue;
      }
      if (!allStats.has(id.screenSize)) {
        allStats.set(id.screenSize, {
          screenSize: id.screenSize,
          improved: setMap<string, string>(),
          regressed: setMap<string, string>(),
        });
      }
      const stats = allStats.get(id.screenSize)!;
      const mapToUse = metric.diff > 0 ? stats.regressed : stats.improved;
      mapToUse.add(key, id.name);
    }
  }
  for (const stats of allStats.values()) {
    // ::notice file={name},line={line},endLine={endLine},title={title}::{message}
    const title = `Performance A/B [${stats.screenSize}]`;
    const improvedSummary: string[] = [];
    for (const [key, names] of stats.improved.map) {
      improvedSummary.push(`${key} (${names.size})`);
    }
    if (improvedSummary.length > 0) {
      console.log(
        `::notice title=${title} Improved::${improvedSummary.join(", ")}`
      );
    }
    const regressedSummary: string[] = [];
    for (const [key, names] of stats.regressed.map) {
      regressedSummary.push(`${key} (${names.size})`);
    }
    if (regressedSummary.length > 0) {
      console.log(
        `::warning title=${title} Regressed::${regressedSummary.join(", ")}`
      );
    }
  }
}

function generateHtmlReport(
  results: PerformanceComparison[],
  forCi?: boolean
): string {
  const allMetricNames = Array.from(
    new Set(results.flatMap((result) => Object.keys(result.metrics)))
  ).sort();

  const headerRow = `
    <tr>
      <th>Scenario</th>
      ${allMetricNames.map((name) => `<th>${name}</th>`).join("")}
    </tr>
  `;

  const bodyRows = results
    .map((result) => {
      const metricCells = allMetricNames
        .map((name) => {
          const metric = result.metrics[name];
          if (metric === undefined) {
            return "<td/>";
          }
          const pos = metric.diff > 0;
          const diffColor =
            metric.pValue > 0.025 ? "" : pos ? "positive" : "negative";
          const diffClass = `class="diff ${diffColor}"`;
          const diffText = `${pos ? "+" : ""}${metric.diff.toFixed(1)}%`;
          const diffEl = `<span ${diffClass}>${diffText}</span>`;

          const pValueText = `p=${metric.pValue.toPrecision(2)}`;
          const pValueEl = `<span class="pValue">[${pValueText}]</span>`;

          const [meanA, meanB] = metric.rawMeans.map((x) => x.toPrecision(3));
          const rawValueText = `${meanA} 🡒 ${meanB}, N=${metric.samples}`;
          const rawValuesEl = `<span class="rawValues">${rawValueText}</span>`;
          return `<td>${diffEl} ${pValueEl}<br>${rawValuesEl}</td>`;
        })
        .join("");
      const nameEl = `<span class="scenarioName">${result.id.name}</span>`;
      const screenSizeEl = `<span class="scenarioData">${result.id.screenSize}</span>`;
      return `<tr><td>${nameEl}${screenSizeEl}</td>${metricCells}</tr>`;
    })
    .join("");
  const table = `<table>${headerRow}${bodyRows}</table>`;
  if (forCi) {
    const header = reportPreamble(true);
    return `<html>${header}${table}</html>`;
  }
  const scriptIdx = process.argv.indexOf(__filename);
  const args =
    scriptIdx === -1
      ? process.argv
      : [
          __filename.slice(__dirname.length + 1),
          ...process.argv.slice(scriptIdx + 1),
        ];
  return `
    <html>
      ${REPORT_HEAD}
      <body>
        ${reportPreamble()}
        ${table}
        <br/>
        <div class="rawValues">${args.join(" ")}</div>
      </body>
    </html>
  `;
}

function reportPreamble(forCi?: boolean) {
  const tagA = resolveTag("A");
  const tagB = resolveTag("B");
  const tagAEl = `<span class="compA">${tagA}</span>`;
  const tagBEl = `<span class="compB">${tagB}</span>`;
  const header = `<h3>Performance comparison: ${tagAEl} vs ${tagBEl}</h3>`;
  if (forCi) {
    return header;
  }
  return `
      ${header}
      <p>
        <div>
          <span class="compA">A</span> is ${tagAEl};
          <span class="compB">B</span> is ${tagBEl}
        </div>
        <div><span class="diff positive">Red</span> means ${tagBEl} <b>is greater than</b> (usually worse) ${tagAEl}.</div>
        <div><span class="diff negative">Green</span> means ${tagBEl} <b>is less than</b> (usually better) ${tagAEl}.</div>
      </p>  
    `;
}

function readResults(): PerformanceTestResult[] {
  const resultFiles = fs
    .readdirSync(E2E_RAW_METRICS_DIR)
    .filter((file) => file.endsWith(".json"));
  if (resultFiles.length === 0) {
    throw new Error(`No results found in directory: ${E2E_RAW_METRICS_DIR}`);
  }
  return resultFiles.flatMap((file) =>
    JSON.parse(fs.readFileSync(path.join(E2E_RAW_METRICS_DIR, file), "utf-8"))
  );
}

function runPerformanceTest(tag: string): PerformanceTestResult[] {
  console.log(chalk.bgYellow(`Running performance tests for tag: ${tag}`));
  if (SPECIAL_TAGS.has(tag)) {
    console.log(
      chalk.yellow(
        `Special tag "${tag}" detected. Downloading from the container repository.`
      )
    );
    execSync(`docker pull ghcr.io/nkprasad12/morcus:${tag}`, {
      stdio: "inherit",
    });
  }
  const iters = findArg("N", false) ?? "25";
  const env = [
    `IMAGE_TAG=${tag}`,
    `PERF_TEST_ITERATIONS=${iters}`,
    "PERF_TEST=1",
  ];
  const args: string[] = [];

  const cpuThrottle = safeParseInt(findArg("cpuThrottle", false));
  if (cpuThrottle !== undefined) {
    env.push(`CPU_THROTTLE=${cpuThrottle}`);
  }
  const screenSize = findArg("screenSize", false);
  if (screenSize !== "small") {
    args.push("--project=chromium");
  }
  if (screenSize !== "large") {
    args.push("--project='MobileChrome'");
  }
  const filter = findArg("filter", false);
  if (filter) {
    args.push(`-g ${filter}`);
  }

  const command = `${env.join(" ")} ${BASE_COMMAND} ${args.join(" ")}`;
  execSync(command, { stdio: "inherit" });
  return readResults();
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
): PerformanceComparison[] {
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
  const comparisons: PerformanceComparison[] = [];
  for (const key of sorted) {
    const resultA = checkPresent(resultsByKeyA.get(key));
    const resultB = checkPresent(resultsByKeyB.get(key));
    comparisons.push(generateComparison(resultA, resultB));
  }
  return comparisons;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function generateComparison(
  resultA: PerformanceTestResult,
  resultB: PerformanceTestResult
) {
  const comparisons: PerformanceComparison["metrics"] = {};
  const metricsA = resultA.metrics;
  const metricsB = resultB.metrics;
  const keys = new Set([...Object.keys(metricsA), ...Object.keys(metricsB)]);
  const verbose = process.argv.includes("--verbose");

  for (const key of keys) {
    const valuesA = metricsA[key];
    const valuesB = metricsB[key];
    if (valuesA === undefined || valuesB === undefined) {
      console.error(`Missing value for key: ${key}`);
      continue;
    }

    const stats = ttest(valuesA, valuesB, { alpha: 0.1 });
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
    comparisons[key] = {
      name: key,
      pValue: stats.pValue(),
      diff: (rawDiff / meanA) * 100,
      rawMeans: [meanA, meanB],
      samples: Math.min(valuesA.length, valuesB.length),
    };
  }
  return { id: resultA.testId, metrics: comparisons };
}

function resolveTag(arg: "A" | "B"): string {
  const raw = findArg(arg, true);
  return raw === TAG_HEAD ? findArg("buildTag", true) : raw;
}

function handleResults(
  results: PerformanceComparison[],
  tagA: string,
  tagB: string
) {
  const isCi = process.argv.includes("--ci");
  const htmlReport = generateHtmlReport(results);
  if (isCi) {
    generateCiReport(results);
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    const simpleReport = generateHtmlReport(results, true);
    if (summaryFile) {
      fs.appendFileSync(
        summaryFile,
        "\n\n" + simpleReport.replaceAll("\n", " ").trim() + "\n\n"
      );
    }
  }
  const reportName = `performance_report_${tagA}_vs_${tagB}_${performance.now()}.html`;
  const reportPath = path.join(E2E_REPORTS_DIR, reportName);
  fs.writeFileSync(reportPath, htmlReport);
  console.log(chalk.bgGreen(`A/B report written to: ${reportPath}\n`));
  if (!isCi) {
    execSync(`xdg-open ${reportPath}`);
  }
}

function runABTest(rawTagA: string, rawTagB: string): void {
  if (rawTagA === TAG_HEAD || rawTagB === TAG_HEAD) {
    const buildTag = findArg("buildTag", true);
    console.log(
      chalk.bgYellow(
        `Special tag ${TAG_HEAD} specified. Building new image with name "${buildTag}"`
      )
    );
    execSync(`docker build . -t ghcr.io/nkprasad12/morcus:${buildTag}`, {
      stdio: "inherit",
    });
  }
  const tagA = resolveTag("A");
  const tagB = resolveTag("B");

  const resultsA = runPerformanceTest(tagA);
  const resultsB = runPerformanceTest(tagB);
  const results = compareResults(resultsA, resultsB);
  handleResults(results, tagA, tagB);
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

function main() {
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
}

main();
