/* istanbul ignore file */

import * as dotenv from "dotenv";
import { checkPresent } from "./common/assert";
import { getOrths, isRegularOrth } from "./common/lewis_and_short/ls_orths";
import { parse } from "./common/lewis_and_short/ls_parser";
dotenv.config();

let unhandled = 0;
for (const entry of parse(checkPresent(process.env.LS_PATH))) {
  const orths = getOrths(entry);
  if (orths.filter((orth) => !isRegularOrth(orth)).length > 0) {
    console.log(orths);
    unhandled += 1;
  }
}
console.log(unhandled);
