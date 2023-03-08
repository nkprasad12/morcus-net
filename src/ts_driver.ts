/* istanbul ignore file */

import * as dotenv from "dotenv";
dotenv.config();

import { parse } from "@/common/ls_parser";

for (const entry of parse(process.env.LS_PATH!)) {
  console.log(entry.formatAsString(true));
}
