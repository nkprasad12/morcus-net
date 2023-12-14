/* istanbul ignore file */

import { spawnSync } from "child_process";
import { mkdirSync, rmSync } from "fs";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import { assertEqual, envVar } from "@/common/assert";
import { processSmithHall } from "@/common/smith_and_hall/sh_process";
import { shListToRaw } from "@/common/smith_and_hall/sh_process";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { makeMorpheusDb } from "@/common/lexica/latin_words";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import { processLibrary } from "@/common/library/process_library";

function syncProc(command: string): number | null {
  console.log(`Executing: '${command}'`);
  const result = spawnSync(command, { shell: true });
  for (const outputLine of result.output) {
    console.log(outputLine?.toString());
  }
  console.log(result.stdout.toString());
  if (result.status !== 0) {
    console.log(result.error?.message);
    console.log(result.stderr.toString());
  }
  return result.status;
}

function download(url: string, path: string): number | null {
  return syncProc(`curl --compressed ${url} > ${path}`);
}

function cleanupDownload(path: string): void {
  console.log(`Attempting to clean up ${path}`);
  try {
    rmSync(path);
  } catch (error) {
    console.log(`Error cleaning up failed download: ${path}`);
  }
}

function simpleStep(command: string): void {
  const status = syncProc(command);
  assertEqual(status, 0, "Command had nonzero status!");
}

interface StepConfig {
  operation: () => Promise<void> | void;
  options?: {
    label?: string;
    dlInfo?: {
      url: string;
      path: string;
    };
  };
}

async function runStep(config: StepConfig): Promise<boolean> {
  const label = config.options?.label || "operation";
  const dlInfo = config.options?.dlInfo;

  if (dlInfo) {
    const dlStatus = download(dlInfo.url, dlInfo.path);
    if (dlStatus !== 0) {
      cleanupDownload(dlInfo.path);
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

  if (dlInfo) {
    cleanupDownload(dlInfo.path);
  }

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

// "make-data-files": "npm run make-sh && npm run make-lat-infl-db && npm run make-ls && npm run make-lat-lib",
// "download-lat-infl-raw": "curl --compressed https://raw.githubusercontent.com/nkprasad12/morcus-raw-data/main/morpheus_out_aug1_suff_removed.txt > lat_raw.txt",
// "make-lat-infl-db": "npm run download-lat-infl-raw && npm run tsnp src/scripts/latin_inflections.ts && rm lat_raw.txt",
// "make-lat-lib": "npm run tsnp src/scripts/process_lat_lib.ts",

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
  operation: () => {
    try {
      rmSync(LIB_DEFAULT_DIR, { recursive: true, force: true });
    } catch {}
    mkdirSync(LIB_DEFAULT_DIR, { recursive: true });
    processLibrary(LIB_DEFAULT_DIR);
  },
  options: { label: "Latin library processing" },
};
const MAKE_BUNDLE: StepConfig = {
  operation: () => simpleStep("npx webpack -- --env production"),
  options: { label: "Building client bundle" },
};

const overallStart = performance.now();
runSteps([MAKE_BUNDLE, MAKE_INFL_DB, MAKE_SH, MAKE_LS, PROCESS_LAT_LIB]).then(
  (status) => {
    console.log(
      status ? "\x1b[32m" : "\x1b[31m",
      "Setup " + (status ? "complete!" : "failed.")
    );
    runtimeMessage(overallStart, status);
  }
);
