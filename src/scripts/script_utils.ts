/* istanbul ignore file */

import chalk from "chalk";
import { spawn } from "child_process";
import { assert, assertEqual } from "@/common/assert";
import { rm } from "fs/promises";
import { arrayMap } from "@/common/data_structures/collect_map";

export const TS_NODE: ReadonlyArray<string> = [
  "node",
  "--max-old-space-size=4096",
  "--env-file=.env",
  "--",
  "node_modules/.bin/ts-node",
  "-P",
  "tsconfig.json",
  "-r",
  "tsconfig-paths/register",
  "--transpile-only",
];

export interface DownloadConfig {
  url: string;
  path: string;
}

export interface StepConfig {
  operation: () => Promise<void> | void;
  label?: string;
  dlInfo?: DownloadConfig | DownloadConfig[];
  priority?: number;
}

export function runCommand(
  command: string,
  env?: Record<string, string | undefined>,
  cwd?: string
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    console.log(`Executing: '${chalk.yellow(command)}'`);
    const result = spawn(command, {
      shell: true,
      stdio: "inherit",
      env: { NODE_ENV: "production", ...env },
      cwd: cwd,
    });
    result.on("error", (err) => reject(err));
    result.on("exit", () => resolve(result.exitCode));
  });
}

export async function download(url: string, path: string): Promise<void> {
  let success = false;
  try {
    const result = await runCommand(`curl --compressed ${url} > ${path}`);
    success = result === 0;
  } catch (err) {
    console.log(err);
  }
  assert(success);
}

export async function cleanupDownloads(files: DownloadConfig[]): Promise<void> {
  const removals: Promise<void>[] = [];
  for (const dlFile of files) {
    const path = dlFile.path;
    console.log(`Attempting to clean up ${path}`);
    removals.push(rm(path));
  }
  await Promise.allSettled(removals);
}

export async function shellStep(
  command: string,
  env?: Record<string, string | undefined>
): Promise<void> {
  const status = await runCommand(command, env);
  assertEqual(status, 0, "Command had nonzero status!");
}

function resolveDownloads(config: StepConfig): DownloadConfig[] {
  const info = config.dlInfo;
  if (info === undefined) {
    return [];
  }
  if (Array.isArray(info)) {
    return info;
  }
  return [info];
}

async function downloadAll(configs: DownloadConfig[]): Promise<boolean> {
  if (configs.length === 0) {
    return true;
  }
  console.log(chalk.blue("Downloading dependencies"));
  const start = performance.now();
  let success = true;
  for (const dlInfo of configs) {
    try {
      await download(dlInfo.url, dlInfo.path);
    } catch (err) {
      success = false;
      await cleanupDownloads(configs);
      break;
    }
  }
  runtimeMessage(start, success, "Downloading");
  return success;
}

async function runStep(config: StepConfig): Promise<boolean> {
  const label = config.label || "operation";
  const dlInfos = resolveDownloads(config);
  const downloadResult = await downloadAll(dlInfos);
  if (!downloadResult) {
    return false;
  }

  let success = true;
  const start = performance.now();
  try {
    console.log(chalk.bgGreen(`Beginning ${label}`));
    await config.operation();
  } catch (error) {
    console.log(chalk.red(`${label} failed!`));
    console.log(chalk.red(error));
    success = false;
  }
  runtimeMessage(start, success, label);

  await cleanupDownloads(dlInfos);

  return success;
}

export function runtimeMessage(
  start: number,
  success: boolean,
  label?: string
): void {
  const totalMs = performance.now() - start;
  const totalSecs = (totalMs / 1000).toFixed(2);
  const message =
    (success ? "Succeeded in" : "Failed after") + ` ${totalSecs} seconds.`;
  const prefix = label === undefined ? "" : `[${label}] `;
  console.log((success ? chalk.blue : chalk.red)(prefix + message + "\n"));
}

function groupByPriority(
  configs: StepConfig[],
  parallel?: boolean
): StepConfig[][] {
  const stepMap = arrayMap<number, StepConfig>();
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const priority =
      parallel && config.priority !== undefined ? config.priority : i;
    stepMap.add(priority, config);
  }
  return Array.from(stepMap.map.entries())
    .sort((a, b) => a[0] - b[0])
    .map((a) => a[1]);
}

async function runStage(
  steps: StepConfig[],
  i: number,
  totalStages: number
): Promise<boolean> {
  console.log(
    chalk.green.underline(`\nBeginning stage ${i + 1} of ${totalStages}\n`)
  );
  const stepResults = await Promise.all(steps.map(runStep));
  const allGood = stepResults.reduce((prev, curr) => prev && curr, true);
  if (!allGood) {
    console.log(chalk.bgRed(`\nStage ${i + 1} failed!\n`));
  }
  return allGood;
}

export interface PipelineOptions {
  parallel?: boolean;
}

export async function runPipeline(
  configs: StepConfig[],
  options?: PipelineOptions
): Promise<boolean> {
  const stages = groupByPriority(configs, options?.parallel);
  for (let i = 0; i < stages.length; i++) {
    const success = await runStage(stages[i], i, stages.length);
    if (!success) {
      return false;
    }
  }
  return true;
}
