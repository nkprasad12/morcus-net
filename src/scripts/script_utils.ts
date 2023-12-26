/* istanbul ignore file */

import { spawn } from "child_process";
import { assert, assertEqual } from "@/common/assert";
import { mkdir, rm } from "fs/promises";

export interface DownloadConfig {
  url: string;
  path: string;
}

export interface StepConfig {
  operation: () => Promise<void> | void;
  label?: string;
  dlInfo?: DownloadConfig | DownloadConfig[];
}

export async function safeCreateDir(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {}
  await mkdir(path, { recursive: true });
}

export async function runCommand(command: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    console.log(`Executing: '${command}'`);
    const result = spawn(command, { shell: true, stdio: "inherit" });
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

export async function simpleStep(command: string): Promise<void> {
  const status = await runCommand(command);
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

async function runStep(config: StepConfig): Promise<boolean> {
  const label = config.label || "operation";
  const dlInfos = resolveDownloads(config);

  for (const dlInfo of dlInfos) {
    try {
      await download(dlInfo.url, dlInfo.path);
    } catch (err) {
      await cleanupDownloads(dlInfos);
      return false;
    }
  }

  let success = true;
  try {
    console.log("\x1b[32m", `Beginning ${label}`);
    console.log("\x1b[0m", "");
    await config.operation();
  } catch (error) {
    console.log(`${label} failed!`);
    console.log(error);
    success = false;
  }

  await cleanupDownloads(dlInfos);

  return success;
}

function runtimeMessage(start: number, success: boolean): void {
  const totalMs = performance.now() - start;
  const totalSecs = (totalMs / 1000).toFixed(2);
  const message =
    (success ? "Succeeded in" : "Failed after") + ` ${totalSecs} seconds.`;
  console.log("\x1b[34m", message);
  console.log("\x1b[0m", "");
}

export async function runSteps(configs: StepConfig[]): Promise<boolean> {
  for (const config of configs) {
    const start = performance.now();
    const success = await runStep(config);
    runtimeMessage(start, success);
    if (!success) {
      return false;
    }
  }
  return true;
}
