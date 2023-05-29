/* istanbul ignore file */

import * as dotenv from "dotenv";
import { assert } from "./common/assert";
import { parseAuthorAbbreviations } from "./common/lewis_and_short/ls_abbreviations";
import { parse } from "./common/lewis_and_short/ls_parser";
import { LS_PATH } from "./common/lewis_and_short/ls_scripts";
import { XmlNode } from "./common/lewis_and_short/xml_node";
import {
  LsRewriters,
  XmlOperations,
  // LsRewriters,
  findTextNodes,
  modifyInTree,
  removeTextNode,
} from "@/common/lewis_and_short/ls_write";

dotenv.config();

const startTime = performance.now();

class Tally<T> {
  readonly counts = new Map<T, number>();

  count(item: T) {
    if (!this.counts.has(item)) {
      this.counts.set(item, 0);
    }
    this.counts.set(item, this.counts.get(item)! + 1);
  }
}

const VERB_SPLITS = [
  "v. n.",
  "v. a. and n.",
  "v. freq. a. and n.",
  "v. freq. n.",
];

const CAES_GERM = [
  "Caes. Germ.",
  "Caes. German.",
  "Germ. Arat.",
  "German. Arat.",
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

export function findDuplicateAuthorAbbreviations() {
  const authors = parseAuthorAbbreviations();
  const authorNames = new Set<string>();
  for (const author of authors) {
    if (authorNames.has(author.key)) {
      console.log("Duplicate for " + author.key);
    }
    authorNames.add(author.key);
  }
}

export function countChildTypesAfterAuthor() {
  const afterAuthors = new Tally<string>();
  for (const entry of parse(LS_PATH)) {
    const textNodes = findTextNodes(entry);
    let lastWasAuthor = false;
    for (const data of textNodes) {
      if (data.parent.name === "bibl") {
        lastWasAuthor = true;
        continue;
      }
      if (lastWasAuthor) {
        afterAuthors.count(data.parent.name);
      }
      lastWasAuthor = false;
    }
  }
  console.log(afterAuthors.counts);
}

// LsRewriters.transformEntries(LS_PATH, (root) =>
//   correctPosSplits(root, VERB_SPLITS)
// );
// const root = new XmlNode(
//   "entryFree",
//   [],
//   [new XmlNode("pos", [], ["v. a."]), " and ", new XmlNode("gen", [], ["n."])]
// );
// const out = correctSplits(root, new Set(["v. a. and n."]));
// console.log(out.toString());

// const matches = new Tally<string>();
// for (const entry of parse(LS_PATH)) {
//   for (const match of searchTree(entry, VERB_SPLITS[0]).matches) {
//     matches.count(match.target);
//   }
// }
// console.log(matches);
LsRewriters.transformEntries(LS_PATH, (root) =>
  modifyInTree(root, CAES_GERM, (match) => XmlOperations.combine(match.chunks))
);

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
