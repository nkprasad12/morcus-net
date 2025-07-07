/* istanbul ignore file */

import chalk from "chalk";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
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
import { createCleanDir } from "@/utils/file_utils";
import { generateShArtifacts } from "@/common/smith_and_hall/sh_generate";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { processRiddleArnold } from "@/common/dictionaries/riddle_arnold/process_riddle_arnold";
import { ALL_SUPPORTED_WORKS } from "@/common/library/library_constants";
import { generateGaffiotArtifacts } from "@/common/gaffiot/gaf_generate";
import { processGeorges } from "@/common/dictionaries/georges/process_georges";
import { processPozo } from "@/common/dictionaries/pozo/process_pozo";
import { processGesner } from "@/common/dictionaries/gesner/process_gesner";

const RAW_LAT_LIB_DIR = "latin_works_raw";
const OFFLINE_DATA_DIR = envVar("OFFLINE_DATA_DIR");

const PERSEUS_CLL_TAG = "master";
const PERSEUS_CLL_ROOT =
  "https://raw.githubusercontent.com/nkprasad12/canonical-latinLit";
const PERSEUS_DOWNLOADS = ALL_SUPPORTED_WORKS.map(perseusDownloadConfig);

function perseusUrl(resource: string): string {
  return `${PERSEUS_CLL_ROOT}/${PERSEUS_CLL_TAG}/${resource}`;
}

function perseusDownloadConfig(resource: string): DownloadConfig {
  const url = perseusUrl(resource);
  const name = url.split("/").slice(-1)[0];
  return { url, path: `${RAW_LAT_LIB_DIR}/${name}` };
}

const SETUP_DIRS: StepConfig = {
  operation: () =>
    Promise.all([
      createCleanDir(LIB_DEFAULT_DIR),
      createCleanDir(RAW_LAT_LIB_DIR),
      createCleanDir(OFFLINE_DATA_DIR),
    ]).then(() => {}),

  label: "Setting up directories",
};
const SAVE_TABLES: StepConfig = {
  operation: MorceusTables.save,
  label: "Saving Morceus tables",
};
const MAKE_LS: StepConfig = {
  operation: GenerateLs.saveArtifacts,
  label: "Lewis and Short DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/lexica/master/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml",
    path: envVar("LS_PATH"),
  },
};
const MAKE_GAF: StepConfig = {
  operation: generateGaffiotArtifacts,
  label: "Gaffiot DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/gaffiot/refs/heads/main/gaffiot.js",
    path: envVar("GAFFIOT_RAW_PATH"),
  },
};
const MAKE_RA: StepConfig = {
  operation: processRiddleArnold,
  label: "Riddle and Arnold DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/riddle-arnold/refs/heads/main/riddle-arnold.tsv",
    path: envVar("RA_PATH"),
  },
};
const MAKE_SH: StepConfig = {
  operation: generateShArtifacts,
  label: "Smith and Hall DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/smithandhall/v1edits/sh_F2_latest.txt",
    path: envVar("SH_RAW_PATH"),
  },
};
const MAKE_GEORGES: StepConfig = {
  operation: processGeorges,
  label: "Georges DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/Georges1910/refs/heads/morcus-net-branch/Georges1910-ger-lat.xml",
    path: envVar("GEORGES_RAW_PATH"),
  },
};
const MAKE_POZO: StepConfig = {
  operation: processPozo,
  label: "Pozo DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/latin-dictionary/refs/heads/morcus/LopezPozo1997/diccionario.txt",
    path: envVar("POZO_RAW_PATH"),
  },
};
const MAKE_GESNER: StepConfig = {
  operation: processGesner,
  label: "Gesner DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/gesner/refs/heads/master/gesner.json",
    path: envVar("GESNER_RAW_PATH"),
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
    const childEnv = {
      ...process.env,
      RUN_TSC: "1",
      MINIFY: "1",
      COMPRESS: "1",
    };
    return shellStep(
      "npm run tsnp src/bundler/morcus-net.rsbuild.ts",
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
  MAKE_BUNDLE,
  SAVE_TABLES,
  MAKE_SH,
  MAKE_GAF,
  MAKE_LS,
  MAKE_RA,
  MAKE_GEORGES,
  MAKE_POZO,
  MAKE_GESNER,
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
