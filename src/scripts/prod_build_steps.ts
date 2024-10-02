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
import { writePwaManifestStep } from "@/scripts/write_webmanifest";
import { createCleanDir } from "@/utils/file_utils";
import { generateShArtifacts } from "@/common/smith_and_hall/sh_generate";
import { MorceusTables } from "@/morceus/cruncher_tables";

const RAW_LAT_LIB_DIR = "latin_works_raw";
const OFFLINE_DATA_DIR = envVar("OFFLINE_DATA_DIR");

const PERSEUS_CLL_TAG = "master";
const PERSEUS_CLL_ROOT =
  "https://raw.githubusercontent.com/nkprasad12/canonical-latinLit";
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
  "data/phi1351/phi002/phi1351.phi002.perseus-lat1.xml",
  `data/phi1276/phi001/phi1276.phi001.perseus-lat2.xml`,
].map(perseusDownloadConfig);

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
const MAKE_SH: StepConfig = {
  operation: generateShArtifacts,
  label: "Smith and Hall DB creation",
  dlInfo: {
    url: "https://raw.githubusercontent.com/nkprasad12/smithandhall/v1edits/sh_F2_latest.txt",
    path: envVar("SH_RAW_PATH"),
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
  SAVE_TABLES,
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
