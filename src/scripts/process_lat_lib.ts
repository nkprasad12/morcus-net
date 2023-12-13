/* istanbul ignore file */

import fs from "fs";
import * as dotenv from "dotenv";
import { processLibrary } from "@/common/library/process_library";
import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
dotenv.config();

const startTime = performance.now();

try {
  fs.rmSync(LIB_DEFAULT_DIR, { recursive: true, force: true });
} catch (e) {
  console.debug(e);
}
fs.mkdirSync(LIB_DEFAULT_DIR, { recursive: true });
processLibrary(LIB_DEFAULT_DIR);

const runTime = Math.round(performance.now() - startTime);
console.log(`Latin library processing runtime: ${runTime} ms.`);
