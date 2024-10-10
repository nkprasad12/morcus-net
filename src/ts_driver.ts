/* istanbul ignore file */

import * as dotenv from "dotenv";

dotenv.config();

const startTime = performance.now();

// expandTemplatesAndSave();
const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);

// const DOC_PATH =
//   "/home/nitin/Downloads/raw.githubusercontent.com_PerseusDL_canonical-latinLit_master_data_phi0690_phi001_phi0690.phi001.perseus-lat2.xml";

// const root = parseTeiXml(DOC_PATH);

// export function schemataCounts() {
//   const words = new Tally<string>();
//   for (const entry of parseLsXml()) {
//     const bold: XmlNode[] = [];
//     const queue: XmlNode[] = [entry];
//     while (queue.length > 0) {
//       const current = queue.pop()!;
//       for (const child of current.children) {
//         if (typeof child === "string") {
//           continue;
//         }
//         if (child.getAttr("rend") === "ital") {
//           bold.push(child);
//         } else {
//           queue.push(child);
//         }
//       }
//     }
//     bold.flatMap(findTextNodes).forEach((data) => {
//       if (data.text.includes(".")) {
//         words.count(data.text);
//       }
//     });
//     // const hiNodes = entry
//     //   .findDescendants("hi")
//     //   .filter((n) => n.getAttr("rend") === "ital");
//     // for (const match of hiNodes) {
//     //   console.log(XmlNode.getSoleText(match));
//     // }
//   }
//   console.log(words.toString(2));
// }

// schemataCounts();
// export function printLsSchema(): void {
//   let pbs = 1;
//   let cbs = 1;
//   for (const entry of parseLsXml()) {
//     const queue: XmlNode[] = [entry];
//     while (queue.length > 0) {
//       const current = queue.pop()!;
//       if (current.name === "pb") {
//         cbs = 0;
//         pbs += 1;
//       } else if (current.name === "cb") {
//         cbs += 1;
//       } else if (current.name === "foreign" && current.children.length === 0) {
//         console.log(`P${pbs},C${cbs} ${entry.getAttr("key")}`);
//       }
//       current.children
//         .filter((child) => typeof child !== "string")
//         .map((x) => XmlNode.assertIsNode(x))
//         .reverse()
//         .forEach((x) => queue.push(x));
//     }
//   }
// }

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

// console.log(LatinWords.callMorpheus("salve"));
