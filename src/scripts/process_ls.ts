/* istanbul ignore file */

import { LewisAndShort } from "@/common/lewis_and_short/ls";
import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();
const verify = process.argv[2] && process.argv[2] === "--verify";
if (verify) {
  console.debug("Verifying displayEntryFree for all entries.");
  const allProcessed = LewisAndShort.createProcessedRaw();
  const result = [];
  for (const item of allProcessed) {
    result.push(LewisAndShort.processedToRaw(item));
    displayEntryFree(item.entry);
  }
  LewisAndShort.save(result);
} else {
  LewisAndShort.save(LewisAndShort.createProcessed());
}

const runTime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runTime} ms.`);
