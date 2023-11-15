/* istanbul ignore file */

// import { parseTeiXml } from "@/common/xml/xml_files";
import { parse } from "@/common/lewis_and_short/ls_parser";
import { LS_PATH } from "@/common/lewis_and_short/ls_scripts";
import { Tally } from "@/common/misc_utils";
import * as dotenv from "dotenv";
import { XmlNode } from "@/common/xml/xml_node";
import { findTextNodes } from "@/common/xml/xml_utils";
import { LatinWords } from "@/common/lexica/latin_words";
// import { LewisAndShort } from "@/common/lewis_and_short/ls";
// import { LatinWords } from "@/common/lexica/latin_words";
// import { removeDiacritics } from "@/common/text_cleaning";

dotenv.config();

// const DOC_PATH =
//   "/home/nitin/Downloads/raw.githubusercontent.com_PerseusDL_canonical-latinLit_master_data_phi0690_phi001_phi0690.phi001.perseus-lat2.xml";

const startTime = performance.now();

// const root = parseTeiXml(DOC_PATH);

export function schemataCounts() {
  const words = new Tally<string>();
  for (const entry of parse(LS_PATH)) {
    const bold: XmlNode[] = [];
    const queue: XmlNode[] = [entry];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const child of current.children) {
        if (typeof child === "string") {
          continue;
        }
        if (child.getAttr("rend") === "ital") {
          bold.push(child);
        } else {
          queue.push(child);
        }
      }
    }
    bold.flatMap(findTextNodes).forEach((data) => {
      if (data.text.includes(".")) {
        words.count(data.text);
      }
    });
    // const hiNodes = entry
    //   .findDescendants("hi")
    //   .filter((n) => n.getAttr("rend") === "ital");
    // for (const match of hiNodes) {
    //   console.log(XmlNode.getSoleText(match));
    // }
  }
  console.log(words.toString(2));
}

// schemataCounts();
export function printLsSchema(): void {
  let pbs = 1;
  let cbs = 1;
  for (const entry of parse(LS_PATH)) {
    const queue: XmlNode[] = [entry];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (current.name === "pb") {
        cbs = 0;
        pbs += 1;
      } else if (current.name === "cb") {
        cbs += 1;
      } else if (current.name === "foreign" && current.children.length === 0) {
        console.log(`P${pbs},C${cbs} ${entry.getAttr("key")}`);
      }
      current.children
        .filter((child) => typeof child !== "string")
        .map((x) => XmlNode.assertIsNode(x))
        .reverse()
        .forEach((x) => queue.push(x));
    }
    for (const foreign of entry.findDescendants("foreign")) {
      if (foreign.children.length === 0) {
      }
    }
  }
}

// printLsSchema();
// const root = parseTeiXml(DOC_PATH);
// console.log(root);
// const allLs = [...LewisAndShort.createProcessedRaw()];
// const morphWords = LatinWords.allWords();

// let missingCount = 0;
// let totalCount = 0;
// for (const lsEntry of allLs) {
//   const missingKeys = lsEntry.keys.filter(
//     (key) => !morphWords.has(removeDiacritics(key))
//   );
//   totalCount += lsEntry.keys.length;
//   if (missingKeys.length === 0) {
//     continue;
//   }
//   console.log();
//   console.log(
//     `Entry: ${lsEntry.entry.getAttr("id")} ${lsEntry.entry.getAttr("key")}`
//   );
//   console.log(missingKeys.join(", "));
//   missingCount += missingKeys.length;
// }
// console.log("missing: " + missingCount + " / " + totalCount);

console.log(LatinWords.callMorpheus("salve"));

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
