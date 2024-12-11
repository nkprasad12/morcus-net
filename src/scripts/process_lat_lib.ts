/* istanbul ignore file */

import fs from "fs";
import * as dotenv from "dotenv";
import {
  ALL_SUPPORTED_WORKS,
  processLibrary,
} from "@/common/library/process_library";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import { envVar } from "@/common/env_vars";
dotenv.config();

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
processLibrary(LIB_DEFAULT_DIR, worksList);

const runTime = Math.round(performance.now() - startTime);
console.log(`Latin library processing runtime: ${runTime} ms.`);
