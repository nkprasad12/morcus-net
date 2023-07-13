/* istanbul ignore file */

import * as dotenv from "dotenv";
import { assert, checkPresent } from "./common/assert";
import { parse } from "./common/lewis_and_short/ls_parser";
import { LS_PATH } from "./common/lewis_and_short/ls_scripts";
import { XmlNode } from "./common/lewis_and_short/xml_node";
import {
  XmlOperations,
  // LsRewriters,
  findTextNodes,
  modifyInTree,
  // modifyInTree,
  removeTextNode,
} from "@/common/lewis_and_short/ls_write";
import { cleanOrths, regularizeOrths } from "./common/lewis_and_short/ls_orths";
import { removeDiacritics } from "./common/text_cleaning";
import { isString } from "./web/utils/rpc/parsing";
import { LsRewriters } from "@/common/lewis_and_short/ls_write";

dotenv.config();

const startTime = performance.now();

class Tally<T> {
  private readonly counts = new Map<T, number>();

  count(item: T) {
    if (!this.counts.has(item)) {
      this.counts.set(item, 0);
    }
    this.counts.set(item, this.counts.get(item)! + 1);
  }

  toString(): string {
    const entries = Array.from(this.counts.entries());
    const total = entries.map(([_, count]) => count).reduce((a, b) => a + b, 0);
    return (
      `Total: ${total}\n` +
      entries
        .sort(([_a, aCount], [_b, bCount]) => bCount - aCount)
        .map(([label, count]) => `${count} <= ${label}`)
        .join("\n")
    );
  }
}

const VERB_SPLITS = [
  "v. n.",
  "v. a. and n.",
  "v. freq. a. and n.",
  "v. freq. n.",
];

export function verbPosSplits() {
  for (const entry of parse(LS_PATH)) {
    correctPosSplits(entry, VERB_SPLITS);
  }
}

export function correctPosSplits(node: XmlNode, conjugenda: string[]): XmlNode {
  const root = node.deepcopy();
  const children = findTextNodes(root);
  const chunks = children.map((data) =>
    XmlNode.assertIsString(data.parent.children[data.textIndex])
  );
  const starts = [0];
  for (let i = 0; i < chunks.length; i++) {
    starts.push(starts[i] + chunks[i].length);
  }
  const allText = chunks.join("");

  for (const substring of conjugenda) {
    const matchStarts: number[] = [];
    let startIndex = 0;
    while (true) {
      const matchStart = allText.indexOf(substring, startIndex);
      if (matchStart === -1) {
        break;
      }
      matchStarts.push(matchStart);
      startIndex = matchStart + substring.length;
    }
    for (const start of matchStarts) {
      let startChunk = -1;
      for (let i = 0; i < starts.length - 1; i++) {
        if (starts[i] <= start && start < starts[i + 1]) {
          startChunk = i;
          break;
        }
      }
      const end = start + substring.length - 1;
      let endChunk = -1;
      for (let i = 0; i < starts.length - 1; i++) {
        if (starts[i] <= end && end < starts[i + 1]) {
          endChunk = i;
          break;
        }
      }

      assert(startChunk > -1, "Expected to find a start chunk");
      assert(endChunk > -1, "Expected to find an end chunk");
      assert(
        endChunk >= startChunk,
        "Expected end chunk to be after the start chunk"
      );
      if (startChunk === endChunk) {
        continue;
      }
      const splitChunks = children.slice(startChunk, endChunk + 1);

      function logInfo() {
        console.log("===");
        console.log(root.attrs);
        console.log(chunks.slice(startChunk, endChunk + 1));
      }

      if (splitChunks.length !== 3) {
        logInfo();
        continue;
      }

      if (splitChunks[0].parent.name !== "pos") {
        logInfo();
        console.log("1st chunk parent: " + splitChunks[0].parent.name);
        continue;
      }

      const middleChunk = chunks[startChunk + 1];
      if (middleChunk !== " and ") {
        logInfo();
        console.log("2nd chunk: " + middleChunk);
        continue;
      }

      if (splitChunks[2].parent.name !== "gen") {
        logInfo();
        console.log("3nd chunk parent: " + splitChunks[1].parent.name);
        continue;
      }

      const levels = splitChunks.map((chunk) => chunk.ancestors.length + 1);
      if (levels[0] !== levels[2] || levels[0] !== levels[1] + 1) {
        logInfo();
        console.log("Levels: " + JSON.stringify(levels));
        continue;
      }

      splitChunks[0].parent.children[splitChunks[0].textIndex] =
        splitChunks[0].text + splitChunks[1].text + splitChunks[2].text;
      removeTextNode(splitChunks[1]);
      removeTextNode(splitChunks[2]);
    }
  }
  return root;
}

export function findMistaggedPos() {
  const posTypes = new Tally<string>();
  for (const entry of parse(LS_PATH)) {
    const hiNodes = entry.findDescendants("hi");
    for (const node of hiNodes) {
      if (node.getAttr("rend") !== "ital") {
        continue;
      }
      if (node.children.length !== 1) {
        continue;
      }
      const firstChild = node.children[0];
      if (typeof firstChild !== "string") {
        continue;
      }
      if (!firstChild.startsWith("v.")) {
        continue;
      }
      if ((firstChild.match(/\./g) || []).length <= 1) {
        continue;
      }
      // const parts = firstChild.split(" ");
      // if (parts.filter((part) => !ALLOWED_PARTS.has(part)).length > 0) {
      //   continue;
      // }

      posTypes.count(firstChild);
    }
  }
  console.log(posTypes.toString());
}

export function capsInKeys() {
  function extractOrth(node: XmlNode): string {
    const rawOrth = [[XmlNode.getSoleText(node)][0]];
    const cleanedOrth = regularizeOrths(cleanOrths(rawOrth))[0];
    let orth = cleanedOrth.split(" ")[0];
    orth = removeDiacritics(orth);
    orth = orth.replaceAll("^", "").replaceAll("_", "");
    orth = orth.slice(-1) === "-" ? orth.slice(0, -1) : orth;
    return orth;
  }

  function startsWithLowerCase(a: string) {
    const aStart = a.charAt(0);
    return aStart === aStart.toLowerCase();
  }

  function startWithSameCase(a: string, b: string) {
    return startsWithLowerCase(a) === startsWithLowerCase(b);
  }

  function capitalize(a: string) {
    return a.charAt(0).toUpperCase() + a.slice(1);
  }

  // const wrongKey = new Set(["ino", "hypatius"]);
  // const intentionalMismatches = new Set(["satiricus"]);
  const falseMatches = new Set<string>(["Typhoeus"]);

  LsRewriters.transformEntries(LS_PATH, (entry) => {
    // for (const entry of parse(LS_PATH)) {
    const orthNodes = entry
      .findChildren("orth")
      // .filter((node) => node.getAttr("type") !== "alt")
      .filter((node) => node.children.length === 1)
      .filter((node) => isString(node.children[0]));

    if (orthNodes.length === 0) {
      // continue;
      return entry;
    }

    let key = checkPresent(entry.getAttr("key"));
    key = key.split(" ")[0];
    key = isNaN(+key.slice(-1)) ? key : key.slice(0, -1);

    if (key.length === 1) {
      // continue;
      return entry;
    }

    const nodeAndOrths = orthNodes.map((n) => ({
      node: n,
      orth: extractOrth(n),
    }));

    const firstOrth = nodeAndOrths[0].orth;
    if (key.toLowerCase() !== firstOrth.toLowerCase()) {
      // continue;
      return entry;
    }
    if (falseMatches.has(key)) {
      //continue;
      return entry;
    }

    const toChange = nodeAndOrths
      .filter((x) => x.orth.charAt(0) !== "-")
      .filter((x) => x.orth !== key)
      .filter((x) => !startWithSameCase(key, x.orth))
      .filter(
        (x) => x.orth.charAt(0).toLowerCase() === key.charAt(0).toLowerCase()
      );

    if (toChange.length > 0 && !startsWithLowerCase(key)) {
      // const results = toChange.map(
      //   (x) => `${x.orth} (${capitalize(XmlNode.getSoleText(x.node))})`
      // );
      // console.log(`${key} : ${results}`);
      toChange.forEach((x) => {
        x.node.children[0] = capitalize(XmlNode.getSoleText(x.node));
      });
    }
    return entry;
    // }
  });
}

export function findSplitPos() {
  LsRewriters.transformEntries(LS_PATH, (node) =>
    modifyInTree(node, ["v. n. and a."], (match, _copy) => {
      XmlOperations.combine(match.chunks);
    })
  );

  // for (const entry of parse(LS_PATH)) {
  //   const results = searchTree(entry, "v. n. and a.");
  //   if (results.matches.length === 0) {
  //     continue;
  //   }
  //   for (const match of results.matches) {
  //     if (
  //       match.chunks.length === 1 &&
  //       match.chunks[0].data.parent.name === "pos"
  //     ) {
  //       continue;
  //     }
  //     const chunks = match.chunks;
  //     if (chunks[0].data.parent.name !== "pos" || chunks[0].match !== "v. n.") {
  //       console.log("weird first chunk");
  //     }
  //     if (chunks[1].match !== " and ") {
  //       console.log("weird second chunk");
  //     }
  //     if (chunks[2].match !== "a.") {
  //       console.log("weird third chunk");
  //     }
  //     if (chunks.length !== 3) {
  //       console.log("weird num of chunks");
  //     }
  //     // console.log(match.chunks.map((c) => c.match));
  //   }
  // console.log(entry.getAttr("key"));
}

findSplitPos();

// const SPLITS = [", ", " (", "; "];
// LsRewriters.transformEntries(LS_PATH, (root) => {
//   const orths = findTextNodes(root)
//     .filter((data) => data.parent.name === "orth")
//     .filter((data) => data.parent.children.length === 1)
//     .filter((data) => isString(data.parent.children[0]))
//     .filter((data) => SPLITS.some((splitter) => data.text.includes(splitter)))
//     .reverse();
//   for (const orth of orths) {
//     let chunks: string[] = [orth.text];
//     for (const splitter of SPLITS) {
//       chunks = chunks.flatMap((chunk) =>
//         chunk
//           .split(splitter)
//           .flatMap((subchunk) => [splitter, subchunk])
//           .slice(1)
//       );
//     }
//     const r: XmlChild[] = chunks.map((chunk, i) =>
//       i % 2 === 0
//         ? new XmlNode(orth.parent.name, orth.parent.attrs, [chunk])
//         : chunk
//     );
//     const grandparent = orth.ancestors[orth.ancestors.length - 1];
//     const parentIndex = grandparent.children.findIndex(
//       (child) => child === orth.parent
//     );
//     assert(parentIndex > -1);
//     grandparent.children.splice(parentIndex, 1, ...r);
//     // console.log(
//     //   `${orth.text} -> ${r
//     //     .map((c) => (typeof c === "string" ? c : c.toString()))
//     //     .join("")}`
//     // );
//   }
//   return root;
// });

// const ALLOWED_PARTS = new Set([
//   "v.",
//   "inch.",
//   "n.",
//   "dep.",
//   "a.",
//   "freq.",
//   "impers.",
//   "intens.",
// ]);

// findMistaggedPos();
// const posTypes = new Tally<string>();
// for (const entry of parse(LS_PATH)) {
//   entry
//     .findDescendants("pos")
//     .forEach((node) => posTypes.count(XmlNode.getSoleText(node)));
// }
// console.log(posTypes.toString());
// LsRewriters.transformEntries(LS_PATH, (entry) => {
//   const queue: XmlNode[] = [entry];
//   // Parent, index.
//   const hiNodes: [XmlNode, number][] = [];
//   while (queue.length > 0) {
//     const current = queue.pop()!;
//     current.children.forEach((child, i) => {
//       if (typeof child === "string") {
//         return;
//       }
//       if (child.name === "hi") {
//         hiNodes.push([current, i]);
//       }
//       queue.push(child);
//     });
//   }

//   // const hiNodes = entry.findDescendants("hi");
//   for (const [parent, index] of hiNodes.reverse()) {
//     const node = XmlNode.assertIsNode(parent.children[index]);
//     if (node.getAttr("rend") !== "ital") {
//       continue;
//     }
//     if (node.children.length !== 1) {
//       continue;
//     }
//     const firstChild = node.children[0];
//     if (typeof firstChild !== "string") {
//       continue;
//     }
//     if (!firstChild.startsWith("v.")) {
//       continue;
//     }
//     if ((firstChild.match(/\./g) || []).length <= 1) {
//       continue;
//     }

//     const sections = firstChild.split(", ");
//     if (sections.length === 0) {
//       continue;
//     }

//     // posTypes.count(firstChild.split(",")[0]);
//     const parts = sections[0].split(" ");
//     if (parts.filter((part) => !ALLOWED_PARTS.has(part)).length > 0) {
//       continue;
//     }

//     node.children[0] = sections.slice(1).join(", ");
//     parent.children.splice(index, 0, ", ");
//     parent.children.splice(index, 0, new XmlNode("pos", [], [sections[0]]));
//   }
//   return entry;
// });

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
