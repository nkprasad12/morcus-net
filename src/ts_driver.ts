/* istanbul ignore file */

import * as dotenv from "dotenv";
import { assert } from "./common/assert";
import { parse } from "./common/lewis_and_short/ls_parser";
import { LS_PATH } from "./common/lewis_and_short/ls_scripts";
import { XmlNode } from "./common/lewis_and_short/xml_node";
import {
  findTextNodes,
  // modifyInTree,
  removeTextNode,
} from "@/common/lewis_and_short/ls_write";
// import { LsRewriters } from "@/common/lewis_and_short/ls_write";
// import { LsRewriters } from "@/common/lewis_and_short/ls_write";

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

findMistaggedPos();
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
//   for (const [parent, index] of hiNodes) {
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
//     // posTypes.count(firstChild.split(",")[0]);
//     const parts = firstChild.split(" ");
//     if (parts.filter((part) => !ALLOWED_PARTS.has(part)).length > 0) {
//       continue;
//     }
//     parent.children[index] = new XmlNode("pos", [], [firstChild]);
//   }
//   return entry;
// });

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
