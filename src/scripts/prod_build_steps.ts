/* istanbul ignore file */

import chalk from "chalk";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import { assert } from "@/common/assert";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import { processLibrary } from "@/common/library/process_library";
import { writeCommitId } from "@/scripts/write_source_version";
import {
  DownloadConfig,
  StepConfig,
  runPipeline,
  runtimeMessage,
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
import { processForcellini } from "@/common/dictionaries/forcellini/process_forcellini";
import { buildV2Bundle } from "@/bundler/client.rsbuild";
import { buildCompletionsDb } from "@/web/ui/dict/search/completions_db.server";
import { buildStaticPagesDb } from "@/web/ui/static_pages_seed.server";
import {
  pinnedDownload,
  pinnedFileUrl,
  upstreamSource,
} from "@/scripts/upstream/lock";

const RAW_LAT_LIB_DIR = "latin_works_raw";

// Every upstream input is pinned to a commit in `upstream_sources.lock.json`.
const PERSEUS_DOWNLOADS = ALL_SUPPORTED_WORKS.map(perseusDownloadConfig);

function perseusDownloadConfig(resource: string): DownloadConfig {
  const url = pinnedFileUrl("canonical-latinlit", resource);
  const name = url.split("/").slice(-1)[0];
  return { url, path: `${RAW_LAT_LIB_DIR}/${name}` };
}

const SETUP_DIRS: StepConfig = {
  operation: () =>
    Promise.all([
      createCleanDir(LIB_DEFAULT_DIR),
      createCleanDir(RAW_LAT_LIB_DIR),
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
  dlInfo: pinnedDownload("lexica"),
};
const MAKE_GAF: StepConfig = {
  operation: generateGaffiotArtifacts,
  label: "Gaffiot DB creation",
  dlInfo: pinnedDownload("gaffiot"),
};
const MAKE_RA: StepConfig = {
  operation: processRiddleArnold,
  label: "Riddle and Arnold DB creation",
  dlInfo: pinnedDownload("riddle-arnold"),
};
const MAKE_SH: StepConfig = {
  operation: generateShArtifacts,
  label: "Smith and Hall DB creation",
  dlInfo: pinnedDownload("smithandhall"),
};
const MAKE_GEORGES: StepConfig = {
  operation: processGeorges,
  label: "Georges DB creation",
  dlInfo: pinnedDownload("Georges1910"),
};
const MAKE_POZO: StepConfig = {
  operation: processPozo,
  label: "Pozo DB creation",
  dlInfo: pinnedDownload("latin-dictionary"),
};
const MAKE_GESNER: StepConfig = {
  operation: processGesner,
  label: "Gesner DB creation",
  dlInfo: pinnedDownload("gesner"),
};
const MAKE_FORCELLINI: StepConfig = {
  operation: processForcellini,
  label: "Forcellini DB creation",
  dlInfo: pinnedDownload("forcellini-words"),
};
const MAKE_COMPLETIONS_DB: StepConfig = {
  operation: () => buildCompletionsDb(),
  label: "Dictionary completions DB creation",
};
const PROCESS_LAT_LIB: StepConfig = {
  operation: () =>
    processLibrary({
      outputDir: LIB_DEFAULT_DIR,
      works: PERSEUS_DOWNLOADS.map((dl) => dl.path),
      shouldBuildCorpus: true,
    }),
  label: "Latin library processing",
  dlInfo: PERSEUS_DOWNLOADS,
  repoInfo: {
    repos: [
      upstreamSource("hypotactic"),
      upstreamSource("phi-public-domain-json"),
    ],
  },
};
const MAKE_V2_BUNDLE: StepConfig = {
  operation: () => buildV2Bundle(/* minify= */ true),
  label: "Building UI V2 assets",
};
const WRITE_COMMIT_ID: StepConfig = {
  operation: writeCommitId,
  label: "Writing commit hash",
};
// Last: it renders pages, so it needs everything above (the library DB, the
// corpus author list, the bundle manifest and the commit id).
const PRERENDER_STATIC_PAGES: StepConfig = {
  operation: () => buildStaticPagesDb(),
  label: "Pre-rendering static pages",
};
const ALL_STEPS = [
  SETUP_DIRS,
  WRITE_COMMIT_ID,
  MAKE_V2_BUNDLE,
  SAVE_TABLES,
  MAKE_SH,
  MAKE_GAF,
  MAKE_LS,
  MAKE_RA,
  MAKE_GEORGES,
  MAKE_POZO,
  MAKE_GESNER,
  MAKE_FORCELLINI,
  MAKE_COMPLETIONS_DB,
  PROCESS_LAT_LIB,
  PRERENDER_STATIC_PAGES,
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
  void prodBuildSteps().then((success) => assert(success));
}
