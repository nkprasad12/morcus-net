/* istanbul ignore file */

import fs, { readFileSync } from "fs";
import { processLibrary } from "@/common/library/process_library";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import { envVar } from "@/common/env_vars";
import { ALL_SUPPORTED_WORKS } from "@/common/library/library_constants";

const startTime = performance.now();

try {
  fs.rmSync(LIB_DEFAULT_DIR, { recursive: true, force: true });
} catch (e) {
  console.debug(e);
}
fs.mkdirSync(LIB_DEFAULT_DIR, { recursive: true });

const LIB_XML_ROOT = envVar("LIB_XML_ROOT", "unsafe");
const worksList =
  LIB_XML_ROOT === undefined
    ? undefined
    : ALL_SUPPORTED_WORKS.map((work) => `${LIB_XML_ROOT}/${work}`);

const buildCorpus = process.env.BUILD_CORPUS === "1";
process.env.COMMIT_ID = readFileSync("build/morcusnet.commit.txt").toString();

processLibrary({
  outputDir: LIB_DEFAULT_DIR,
  works: worksList,
  shouldBuildCorpus: buildCorpus,
});

const runTime = Math.round(performance.now() - startTime);
console.log(`Latin library processing runtime: ${runTime} ms.`);
