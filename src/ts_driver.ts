/* istanbul ignore file */

import * as dotenv from "dotenv";
import { checkPresent } from "./common/assert";
import { displayEntryFree } from "./common/lewis_and_short/ls_display";
import { parse, XmlNode } from "./common/lewis_and_short/ls_parser";
dotenv.config();

// @ts-ignore
function childrenMatching(node: XmlNode, name: string): XmlNode[] {
  const results = [];
  for (const child of node.children) {
    if (typeof child !== "string" && child.name === name) {
      results.push(child);
    }
  }
  return results;
}

// let multiplePos = 0;
// let multipleEtym = 0;
// for (const entry of parse(checkPresent(process.env.LS_PATH))) {
//   if (childrenMatching(entry, "pos").length > 1) {
//     multiplePos += 1;
//   }
//   if (childrenMatching(entry, "etym").length > 1) {
//     multipleEtym += 1;
//     console.log(entry.attrs);
//   }
// }
// console.log(`multiplePos: ${multiplePos}`);
// console.log(`multipleEtym: ${multipleEtym}`);

let errors = 0;
let successes = 0;
for (const entry of parse(checkPresent(process.env.LS_PATH))) {
  try {
    displayEntryFree(entry);
    successes += 1;
  } catch (e) {
    errors += 1;
    console.log("================");
    console.log(entry.attrs);
    console.log(e);
    console.log("================");
  }
}
console.log(`successes: ${successes}`);
console.log(`errors: ${errors}`);
