/* istanbul ignore file */

import { envVar } from "@/common/env_vars";
import { RawDictEntry, SqlDict } from "@/common/dictionaries/dict_storage";
// import { unmatched } from "@/common/smith_and_hall/sh_abbreviations";
import {
  shListToRaw,
  processSmithHall,
} from "@/common/smith_and_hall/sh_process";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();

const dbPath = envVar("SH_PROCESSED_PATH");

processSmithHall().then((data) => {
  const rawData: RawDictEntry[] = shListToRaw(data);
  SqlDict.save(rawData, dbPath);
  const runTime = Math.round(performance.now() - startTime);
  console.log(`Smith and Hall runtime: ${runTime} ms.`);
  // for (const [author, cits] of unmatched) {
  //   console.log(author);
  //   console.log("=\n=\n=\n");
  //   for (const cit of cits) {
  //     console.log(cit);
  //   }
  //   console.log("=\n=\n=\n=\n=\n=\n");
  // }
});
