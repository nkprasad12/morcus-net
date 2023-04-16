/* istanbul ignore file */

import * as dotenv from "dotenv";
import { parse } from "./common/lewis_and_short/ls_parser";
import { LS_PATH } from "./common/lewis_and_short/ls_scripts";
import { XmlNode } from "./common/lewis_and_short/xml_node";

dotenv.config();

const startTime = performance.now();

function getTextNodes(root: XmlNode): string[] {
  let result: string[] = [];
  for (const child of root.children) {
    if (typeof child === "string") {
      result.push(child);
    } else {
      result = result.concat(getTextNodes(child));
    }
  }
  return result;
}

const S = ["v. n.", "v. a. and n.", "v. freq. a. and n.", "v. freq. n."];
const cats = new Map<string, number>();

for (const entry of parse(LS_PATH)) {
  const texts = getTextNodes(entry);
  const rawEntry = texts.join("");
  const posTexts = entry
    .findDescendants("pos")
    .map((n) => XmlNode.getSoleText(n));
  for (const s of S) {
    if (!rawEntry.includes(s)) {
      continue;
    }
    if (!posTexts.includes(s)) {
      if (!cats.has(s)) {
        cats.set(s, 0);
      }
      cats.set(s, cats.get(s)! + 1);
      console.log(entry.attrs);
    }
  }
}
console.log(cats);

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
