/* istanbul ignore file */

import * as dotenv from "dotenv";
import { parse, XmlNode } from "./common/lewis_and_short/ls_parser";
dotenv.config();

function childrenMatching(node: XmlNode, name: string): XmlNode[] {
  const results = [];
  for (const child of node.children) {
    if (typeof child !== "string" && child.name === name) {
      results.push(child);
    }
  }
  return results;
}

let multiplePos = 0;
let multipleEtym = 0;
for (const entry of parse(process.env.LS_PATH!)) {
  if (childrenMatching(entry, "pos").length > 1) {
    multiplePos += 1;
  }
  if (childrenMatching(entry, "etym").length > 1) {
    multipleEtym += 1;
    console.log(entry.attrs);
  }
}
console.log(`multiplePos: ${multiplePos}`);
console.log(`multipleEtym: ${multipleEtym}`);
