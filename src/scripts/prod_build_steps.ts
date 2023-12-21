/* istanbul ignore file */

import { spawnSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import { assert, assertEqual, envVar } from "@/common/assert";
import { processSmithHall } from "@/common/smith_and_hall/sh_process";
import { shListToRaw } from "@/common/smith_and_hall/sh_process";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { makeMorpheusDb } from "@/common/lexica/latin_words";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import { processLibrary } from "@/common/library/process_library";
import { writeCommitId } from "@/scripts/write_source_version";

const RAW_LAT_LIB_DIR = "latin_works_raw";
const PERSEUS_CLL_TAG = "0.0.6853394170";
const PERSEUS_CLL_ROOT =
  "https://raw.githubusercontent.com/PerseusDL/canonical-latinLit";

const PERSEUS_DOWNLOADS = [
  // Remove these next two for now, since it has strange optional
  // nested elements that are not marked in the CTS header
  // "data/phi0472/phi001/phi0472.phi001.perseus-lat2.xml",
  // "data/phi0893/phi001/phi0893.phi001.perseus-lat2.xml",

  // Remove this for now, since it has whitespace between elements.
  // "data/phi1318/phi001/phi1318.phi001.perseus-lat1.xml",

  "data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml",
  "data/phi0975/phi001/phi0975.phi001.perseus-lat2.xml",
].map(perseusDownloadConfig);

interface DownloadConfig {
  url: string;
  path: string;
}

interface StepConfig {
  operation: () => Promise<void> | void;
  options?: {
    label?: string;
    dlInfo?: DownloadConfig | DownloadConfig[];
  };
}

function perseusUrl(resource: string): string {
  return `${PERSEUS_CLL_ROOT}/${PERSEUS_CLL_TAG}/${resource}`;
}

function perseusDownloadConfig(resource: string): DownloadConfig {
  const url = perseusUrl(resource);
  const name = url.split("/").slice(-1)[0];
  return { url, path: `${RAW_LAT_LIB_DIR}/${name}` };
}

function safeCreateDir(path: string) {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {}
  mkdirSync(path, { recursive: true });
}

function syncProc(command: string): number | null {
  console.log(`Executing: '${command}'`);
  const result = spawnSync(command, { shell: true, stdio: "inherit" });
  if (result.status !== 0) {
    console.log(result.error?.message);
  }
  return result.status;
}

function download(url: string, path: string): number | null {
  return syncProc(`curl --compressed ${url} > ${path}`);
}

function cleanupDownloads(files: DownloadConfig[]): void {
  for (const dlFile of files) {
    const path = dlFile.path;
    console.log(`Attempting to clean up ${path}`);
    try {
      rmSync(path);
    } catch {}
  }
}

function simpleStep(command: string): void {
  const status = syncProc(command);
  assertEqual(status, 0, "Command had nonzero status!");
}

function resolveDowloads(config: StepConfig): DownloadConfig[] {
  const info = config.options?.dlInfo;
  if (info === undefined) {
    return [];
  }
  if (Array.isArray(info)) {
    return info;
  }
  return [info];
}

async function runStep(config: StepConfig): Promise<boolean> {
  const label = config.options?.label || "operation";
  const dlInfos = resolveDowloads(config);

  for (const dlInfo of dlInfos) {
    const dlStatus = download(dlInfo.url, dlInfo.path);
    if (dlStatus !== 0) {
      cleanupDownloads(dlInfos);
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

  cleanupDownloads(dlInfos);

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

async function runSteps(configs: StepConfig[]): Promise<boolean> {
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

const SETUP_DIRS: StepConfig = {
  operation: () => {
    safeCreateDir(LIB_DEFAULT_DIR);
    safeCreateDir(RAW_LAT_LIB_DIR);
  },
  options: { label: "Setting up directories" },
};
const MAKE_LS: StepConfig = {
  operation: GenerateLs.saveToDb,
  options: {
    label: "Lewis and Short DB creation",
    dlInfo: {
      url: "https://raw.githubusercontent.com/nkprasad12/lexica/master/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml",
      path: envVar("LS_PATH"),
    },
  },
};
const MAKE_SH: StepConfig = {
  operation: async () => {
    const unprocessed = await processSmithHall();
    const dbReady = shListToRaw(unprocessed);
    SqlDict.save(dbReady, envVar("SH_PROCESSED_PATH"));
  },
  options: {
    label: "Smith and Hall DB creation",
    dlInfo: {
      url: "https://raw.githubusercontent.com/nkprasad12/smithandhall/v1edits/sh_F2_latest.txt",
      path: envVar("SH_RAW_PATH"),
    },
  },
};
const MAKE_INFL_DB: StepConfig = {
  operation: makeMorpheusDb,
  options: {
    label: "Inflection DB creation",
    dlInfo: {
      url: "https://raw.githubusercontent.com/nkprasad12/morcus-raw-data/main/morpheus_out_aug1_suff_removed.txt",
      path: envVar("RAW_LATIN_WORDS"),
    },
  },
};
const PROCESS_LAT_LIB: StepConfig = {
  operation: () =>
    processLibrary(
      LIB_DEFAULT_DIR,
      PERSEUS_DOWNLOADS.map((dl) => dl.path)
    ),
  options: { label: "Latin library processing", dlInfo: PERSEUS_DOWNLOADS },
};
const MAKE_BUNDLE: StepConfig = {
  operation: () => simpleStep("npx webpack -- --env production"),
  options: { label: "Building client bundle" },
};
const WRITE_COMMIT_ID: StepConfig = {
  operation: writeCommitId,
  options: { label: "Writing commit hash" },
};
const ALL_STEPS = [
  SETUP_DIRS,
  WRITE_COMMIT_ID,
  MAKE_BUNDLE,
  MAKE_INFL_DB,
  MAKE_SH,
  MAKE_LS,
  PROCESS_LAT_LIB,
];

export async function prodBuildSteps(): Promise<boolean> {
  const overallStart = performance.now();
  const success = await runSteps(ALL_STEPS);
  runtimeMessage(overallStart, success);
  console.log(
    success ? "\x1b[32m" : "\x1b[31m",
    "Setup " + (success ? "complete!" : "failed.")
  );
  return success;
}

if (process.env.MAIN === "build") {
  prodBuildSteps().then((success) => assert(success));
}
