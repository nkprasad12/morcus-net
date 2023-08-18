/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { LewisAndShort } from "@/common/lewis_and_short/ls";
import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import { extractOutline } from "@/common/lewis_and_short/ls_outline";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();

const dbPath = checkPresent(process.env.LS_PROCESSED_PATH);
const verify = process.argv[2] && process.argv[2] === "--verify";
if (verify) {
  console.debug("Verifying displayEntryFree for all entries.");
  const allProcessed = LewisAndShort.createProcessedRaw();
  const result = [];
  for (const item of allProcessed) {
    result.push(LewisAndShort.processedToRaw(item));
    try {
      displayEntryFree(item.entry);
      extractOutline(item.entry);
    } catch (e) {
      console.log(item.entry);
      throw e;
    }
  }
  SqlDict.save(result, dbPath);
} else {
  SqlDict.save(LewisAndShort.createProcessed(), dbPath);
}

const runTime = Math.round(performance.now() - startTime);
console.log(`Lewis and Short runtime: ${runTime} ms.`);
