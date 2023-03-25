import { readFileSync } from "fs";

import { assert, assertEqual } from "@/common/assert";
import { parseEntries, XmlNode } from "@/common/lewis_and_short/ls_parser";
import { attachHoverText } from "./ls_styling";

function parseListItem(root: XmlNode, onUl: (ulNode: XmlNode) => any) {
  assertEqual(root.name, "li");
  let i = 0;
  const keys: string[] = [];
  while (i < root.children.length) {
    const currentNode = XmlNode.assertIsNode(root.children[i], "b");
    keys.push(XmlNode.getSoleText(currentNode));
    i += 1;
    const nextNode = root.children[i];
    const hasOtherKey = typeof nextNode === "string" && nextNode === " or ";
    if (!hasOtherKey) {
      break;
    }
    i += 1;
  }
  let expanded = "";
  while (i < root.children.length) {
    const currentNode = root.children[i];
    if (typeof currentNode === "string") {
      expanded += currentNode;
    } else if (currentNode.name === "ul") {
      onUl(currentNode);
    } else {
      expanded += XmlNode.getSoleText(currentNode);
    }
    i += 1;
  }

  return new Map<string, string>(
    keys.map((key) => [
      key.trim().replace(/(^,)|(,$)/g, ""),
      expanded.trim().replace(/(^,)|(,$)/g, ""),
    ])
  );
}

export interface LsAuthorAbbreviation {
  key: string;
  expanded: string;
  works: Map<string, string>;
}

export function parseAuthorAbbreviations(
  path: string = "texts/latin/lewisAndShort/ls_abbreviations.html"
): LsAuthorAbbreviation[] {
  const xmlContents = readFileSync(path, "utf8");
  const result = parseEntries([xmlContents])[0];
  const entries: LsAuthorAbbreviation[] = [];
  for (const author of result.children) {
    if (typeof author === "string") {
      assert(author.trim() === "");
      continue;
    }
    const works = new Map<string, string>();
    const authorResults = parseListItem(author, (worksList) => {
      for (const work of worksList.children) {
        if (typeof work === "string") {
          assert(work.trim() === "");
          continue;
        }
        parseListItem(work, (_) => {
          throw new Error("This should never happen");
        }).forEach((value, key) => {
          works.set(key, value);
        });
      }
    });

    authorResults.forEach((expanded, key) => {
      entries.push({
        key: key,
        expanded: expanded,
        works: works,
      });
    });
  }
  return entries;
}

export const NUMBER_ABBREVIATIONS = new Map<string, string>([
  ["sing.", "singular"],
  ["plur.", "plural"],
]);

export const MOOD_ABBREVIATIONS = new Map<string, string>([
  ["Part.", "Participle"],
]);

export const CASE_ABBREVIATIONS = new Map<string, string>([
  ["nom.", "nominative"],
  ["acc.", "accusative"],
  ["dat.", "dative"],
  ["gen.", "genitive"],
  ["abl.", "ablative"],
  ["voc.", "vocative"],
]);

export const LBL_ABBREVIATIONS = new Map<string, Map<string, string>>([
  ["entryFree", new Map<string, string>([["dim.", "diminutive"]])],
  ["xr", new Map<string, string>([["v.", "look [at entry]"]])],
]);

export const GEN_ABBREVIATIONS = new Map<string, string>([
  ["f.", "feminine"],
  ["m.", "masculine"],
  ["n.", "neuter"],
]);

export const POS_ABBREVIATIONS = new Map<string, string>([
  ["prep.", "preposition"],
  ["interj.", "interjection"],
  ["adj.", "adjective"],
  ["v. n.", "verb [intransitive]"],
  ["v. a.", "verb [transitive]"],
  [
    "v. freq. a.",
    `verb [${attachHoverText(
      "freq.",
      "frequentative or frequently"
    )} transitive]`,
  ],
  ["adv.", "adverb"],
  ["P. a.", "participal adjective"],
  ["v. dep.", "verb [deponent]"],
  ["Adj.", "Adjective"],
  ["Subst.", "Substantive"],
  ["adv. num.", "adverb [numeral]"],
  ["num. adj.", "adjective [numeral]"],
  ["pron. adj.", "adjective [pronoun]"],
]);

export const USG_ABBREVIATIONS = new Map<string, string>([
  ["poet.", "poetical(ly)"],
  ["Transf.", "Transferred"],
  ["Lit.", "Literal [in a literal sense]"],
  ["Absol.", "Absolute(ly) [without case or adjunct]"],
  ["Trop.", "Figurative [tropical or figurative sense]"],
  ["Polit. t. t.", "Political [technical term]"],
  ["Meton.", "By Metonymy"],
  ["Poet.", "Poetical(ly)"],
  ["Medic. t. t.", "Medical [technical term]"],
  ["Milit. t. t.", "Military [technical term]"],
  ["Mercant. t. t.", "Mercantile [technical term]"],
]);

export namespace LsAuthorAbbreviations {
  const authorMap = new Map<string, string>();
  const worksMap = new Map<string, Map<string, string>>();

  function populateMaps() {
    if (authorMap.size === 0) {
      const data = parseAuthorAbbreviations();
      for (const datum of data) {
        authorMap.set(datum.key, datum.expanded);
        worksMap.set(datum.key, datum.works);
      }
    }
  }

  export function authors(): Map<string, string> {
    populateMaps();
    return authorMap;
  }

  export function works(): Map<string, Map<string, string>> {
    populateMaps();
    return worksMap;
  }
}
