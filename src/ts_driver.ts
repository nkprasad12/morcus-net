/* istanbul ignore file */

import * as dotenv from "dotenv";
import { checkPresent } from "./common/assert";
import { parse } from "./common/lewis_and_short/ls_parser";
import { XmlNode } from "./common/lewis_and_short/xml_node";
dotenv.config();

function childrenMatching(node: XmlNode, name: string): [XmlNode, number][] {
  const results: [XmlNode, number][] = [];
  node.children.forEach((child, i) => {
    if (typeof child !== "string" && child.name === name) {
      results.push([child, i]);
    }
  });
  return results;
}

// let multiplePos = 0;
// let multipleEtym = 0;
// const counts = new Map<number, number>();
for (const entry of parse(checkPresent(process.env.LS_PATH))) {
  if (childrenMatching(entry, "pos").length > 1) {
    console.log(
      childrenMatching(entry, "pos").forEach((x) => console.log(x.toString()))
    );
    console.log("\n");
    // multiplePos += 1;
  }
  // const etyms = childrenMatching(entry, "etym");
  // const keyToIncr = etyms.length === 0 ? -1 : etyms[0][1];
  // if (keyToIncr > 17) {
  //   console.log(entry.formatAsString(true));
  //   console.log("\n");
  // }
  // if (!counts.has(keyToIncr)) {
  //   counts.set(keyToIncr, 0);
  // }
  // counts.set(keyToIncr, counts.get(keyToIncr)! + 1);
  // if (etyms.length > 1) {
  //   multipleEtym += 1;
  //   console.log(entry.attrs);
  // }
}
// console.log(`multiplePos: ${multiplePos}`);
// console.log(`multipleEtym: ${multipleEtym}`);
// console.log(counts);
