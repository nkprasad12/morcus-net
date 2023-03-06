/* istanbul ignore file */

import { parse } from "@/common/ls_parser";

for (const entry of parse()) {
  console.log(entry.formatAsString(true));
}
