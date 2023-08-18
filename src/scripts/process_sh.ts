/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { RawDictEntry, SqlDict } from "@/common/dictionaries/dict_storage";
import { displayShEntry } from "@/common/smith_and_hall/sh_display";
import { processSmithHall } from "@/common/smith_and_hall/sh_process";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();

const dbPath = checkPresent(process.env.SH_PROCESSED_PATH);
const verify = process.argv[2] && process.argv[2] === "--verify";

processSmithHall().then((data) => {
  const rawData: RawDictEntry[] = data.map((d) => ({
    keys: d.keys.join("@"),
    entry: JSON.stringify(d),
  }));
  SqlDict.save(rawData, dbPath);

  const runTime = Math.round(performance.now() - startTime);
  console.log(`Smith and Hall runtime: ${runTime} ms.`);
  if (verify) {
    const verificationStart = performance.now();
    console.log("Verifying that all entries can be displayed.");
    data.forEach((d, i) => displayShEntry(d, i));
    const verifyTime = Math.round(performance.now() - verificationStart);
    console.log(`Verify runtime: ${verifyTime} ms.`);
  }
});
