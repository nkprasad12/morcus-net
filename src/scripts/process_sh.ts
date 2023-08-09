/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { RawDictEntry, SqlDict } from "@/common/dictionaries/dict_storage";
import { processSmithHall } from "@/common/smith_and_hall/sh_process";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();

const dbPath = checkPresent(process.env.SH_PROCESSED_PATH);
const verify = process.argv[2] && process.argv[2] === "--verify";
if (verify) {
  console.debug("TODO: verify does nothing yet!");
}
processSmithHall().then((data) => {
  const rawData: RawDictEntry[] = data.map((d) => ({
    keys: d.keys.join("@"),
    entry: JSON.stringify(d),
  }));
  SqlDict.save(rawData, dbPath);

  const runTime = Math.round(performance.now() - startTime);
  console.log(`Runtime: ${runTime} ms.`);
});
