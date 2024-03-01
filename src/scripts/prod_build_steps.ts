/* istanbul ignore file */

import chalk from "chalk";
import { mkdirSync, rmSync } from "fs";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import { assert, envVar } from "@/common/assert";
import { processSmithHall } from "@/common/smith_and_hall/sh_process";
import { shListToRaw } from "@/common/smith_and_hall/sh_process";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { makeMorpheusDb } from "@/common/lexica/latin_words";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import { processLibrary } from "@/common/library/process_library";
import { writeCommitId } from "@/scripts/write_source_version";
import {
  DownloadConfig,
  StepConfig,
  runPipeline,
  runtimeMessage,
  shellStep,
} from "@/scripts/script_utils";
import { writePwaManifestStep } from "@/scripts/write_webmanifest";

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
  "data/phi0959/phi001/phi0959.phi001.perseus-lat2.xml",
  "data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml",
  "data/phi0975/phi001/phi0975.phi001.perseus-lat2.xml",
].map(perseusDownloadConfig);

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

const SETUP_DIRS: StepConfig = {
  operation: () => {
    safeCreateDir(LIB_DEFAULT_DIR);
    safeCreateDir(RAW_LAT_LIB_DIR);
  },
  label: "Setting up directories",
};
const MAKE_LS: StepConfig = {
  operation: GenerateLs.saveToDb,
  label: "Lewis and Short DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/lexica/master/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml",
    path: envVar("LS_PATH"),
  },
};
const MAKE_SH: StepConfig = {
  operation: async () => {
    const unprocessed = await processSmithHall();
    const dbReady = shListToRaw(unprocessed);
    SqlDict.save(dbReady, envVar("SH_PROCESSED_PATH"));
  },
  label: "Smith and Hall DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/smithandhall/v1edits/sh_F2_latest.txt",
    path: envVar("SH_RAW_PATH"),
  },
};
const MAKE_INFL_DB: StepConfig = {
  operation: makeMorpheusDb,
  label: "Inflection DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/morcus-raw-data/main/morpheus_out_aug1_suff_removed.txt",
    path: envVar("RAW_LATIN_WORDS"),
  },
};
const PROCESS_LAT_LIB: StepConfig = {
  operation: () =>
    processLibrary(
      LIB_DEFAULT_DIR,
      PERSEUS_DOWNLOADS.map((dl) => dl.path)
    ),
  label: "Latin library processing",
  dlInfo: PERSEUS_DOWNLOADS,
};
const MAKE_BUNDLE: StepConfig = {
  operation: () => {
    const childEnv = { ...process.env, RUN_TSC: "1" };
    return shellStep(
      "npm run tsnp src/esbuild/morcus-net.esbuild.ts",
      childEnv
    );
  },
  label: "Building client bundle",
};
const WRITE_COMMIT_ID: StepConfig = {
  operation: writeCommitId,
  label: "Writing commit hash",
};
const ALL_STEPS = [
  SETUP_DIRS,
  WRITE_COMMIT_ID,
  writePwaManifestStep(),
  MAKE_BUNDLE,
  MAKE_INFL_DB,
  MAKE_SH,
  MAKE_LS,
  PROCESS_LAT_LIB,
];

export async function prodBuildSteps(): Promise<boolean> {
  const overallStart = performance.now();
  const success = await runPipeline(ALL_STEPS);
  runtimeMessage(overallStart, success, "Prod Build Steps");
  console.log(
    (success ? chalk.bgGreen : chalk.bgRed)(
      `\nSetup ${success ? "complete!" : "failed."}\n`
    )
  );
  return success;
}

if (process.env.MAIN === "build") {
  prodBuildSteps().then((success) => assert(success));
}
