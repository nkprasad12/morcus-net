/* istanbul ignore file */

import { getRawLsXml } from "@/common/lewis_and_short/ls_parser";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";
import {
  LsAuthorAbbreviations,
  parseAuthorAbbreviations,
} from "@/common/lewis_and_short/ls_abbreviations";
import { checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { getOrths, isRegularOrth } from "@/common/lewis_and_short/ls_orths";
import { parseXmlStringsInline } from "@/common/xml/xml_utils";
import { LsRewriters } from "@/common/lewis_and_short/ls_write";
import { AUTHOR_EDGE_CASES } from "@/common/lewis_and_short/ls_display";
import { findTextNodes } from "@/common/xml/xml_text_utils";

export const LS_PATH = envVar("LS_PATH");

interface Schema {
  entry: string;
  childrenTypes: Set<string>;
}

const schemaMap = new Map<string, Schema>();

export function parseLsXml(
  path: string = envVar("LS_PATH")
): Generator<XmlNode> {
  return parseXmlStringsInline(getRawLsXml(path));
}

export function absorb(node: XmlNode) {
  const entryType = node.name;
  if (!schemaMap.has(entryType)) {
    schemaMap.set(entryType, { entry: entryType, childrenTypes: new Set() });
  }
  const schema = checkPresent(schemaMap.get(entryType));
  for (const child of node.children) {
    if (typeof child === "string") {
      schema.childrenTypes.add("text");
      continue;
    }
    schema.childrenTypes.add(child.name);
    absorb(child);
  }
}

export function printLsSchema(): void {
  for (const entry of parseLsXml(LS_PATH)) {
    absorb(entry);
  }

  for (const schema of schemaMap.values()) {
    console.log(schema.entry + ":");
    for (const childType of schema.childrenTypes) {
      console.log("- " + childType);
    }
    console.log("");
  }
}

export function printAuthorAbbrevs() {
  const authorAbbrevs = parseAuthorAbbreviations();
  for (const x of authorAbbrevs) {
    console.log(x);
  }
}

export function printElementValues(name: string) {
  const valueSet = new Set<string>();
  for (const entry of parseLsXml(LS_PATH)) {
    const matchNodes = entry.findDescendants(name);
    for (const node of matchNodes) {
      valueSet.add(XmlNode.getSoleText(node));
    }
  }
  console.log(valueSet);
}

export function printElementsMatching(
  test: (node: XmlNode) => boolean,
  limit: number = 1000000
) {
  for (const entry of parseLsXml(LS_PATH)) {
    let printed = 0;
    const unprocessed = [entry];
    while (unprocessed.length > 0) {
      const current = checkPresent(unprocessed.pop());
      if (test(current)) {
        printed += 1;
        console.log(current.formatAsString(true));
        if (printed >= limit) {
          return;
        }
      }
      for (const child of current.children) {
        if (typeof child !== "string") {
          unprocessed.push(child);
        }
      }
    }
  }
}

export function printUniqueElementsMatching(test: (node: XmlNode) => boolean) {
  const reported = new Set<string>();
  for (const entry of parseLsXml(LS_PATH)) {
    const unprocessed = [entry];
    while (unprocessed.length > 0) {
      const current = checkPresent(unprocessed.pop());
      if (test(current)) {
        const currentText = current.formatAsString(true);
        if (!reported.has(currentText)) {
          console.log(currentText);
          reported.add(currentText);
        }
      }
      for (const child of current.children) {
        if (typeof child !== "string") {
          unprocessed.push(child);
        }
      }
    }
  }
}

export function printElementAttributeTypes(name: string) {
  const valueSet = new Set<string>();
  for (const entry of parseLsXml(LS_PATH)) {
    const matchNodes = entry.findDescendants(name);
    for (const node of matchNodes) {
      node.attrs.forEach((attribute) => valueSet.add(attribute[0]));
    }
  }
  console.log(valueSet);
}

export function printElementAttributeValues(name: string, attrName: string) {
  const valueSet = new Set<string>();
  for (const entry of parseLsXml(LS_PATH)) {
    const matchNodes = entry.findDescendants(name);
    for (const node of matchNodes) {
      const attrValue = new Map(node.attrs).get(attrName);
      valueSet.add(attrValue || "undefined");
    }
  }
  console.log(valueSet);
}

export function toSchemaString(
  root: XmlNode,
  terminals: string[] = []
): string {
  const result = [];
  const queue: [XmlNode | string, number][] = [[root, 0]];
  while (queue.length > 0) {
    const [node, depth] = checkPresent(queue.pop());
    const pad = "-   ".repeat(depth);
    if (typeof node === "string") {
      result.push(`${pad}#text`);
      continue;
    }
    const attrs = node.attrs.map((x) => x[0]);
    result.push(`${pad}${node.name} (${attrs.join(", ")})`);
    if (terminals.includes(node.name)) {
      continue;
    }
    node.children.forEach((child) => queue.push([child, depth + 1]));
  }
  return result.join("\n");
}

export function schemataCounts(name: string, terminals: string[] = []) {
  const schemata = new Map<string, number>();
  for (const entry of parseLsXml(LS_PATH)) {
    for (const match of entry.findDescendants(name)) {
      const schema = toSchemaString(match, terminals);
      schemata.set(schema, (schemata.get(schema) || 0) + 1);
    }
  }
  schemata.forEach((count, schema) => {
    console.log("=".repeat(10));
    console.log(schema);
    console.log(`Matches: ${count}`);
  });
}

export function printUnhandledOrths() {
  let unhandled = 0;
  const starts: [string[], string[]][] = [];
  const ends: [string[], string[]][] = [];
  for (const entry of parseLsXml(LS_PATH)) {
    const orths = getOrths(entry);
    if (orths.filter((orth) => !isRegularOrth(orth)).length === 0) {
      continue;
    }
    console.log(orths);
    unhandled += 1;
    let lastRegular: string | undefined = undefined;
    for (const orth of orths) {
      if (isRegularOrth(orth)) {
        lastRegular = orth;
        continue;
      }
      if (lastRegular === undefined) {
        continue;
      }
      if (orth.startsWith("-")) {
        ends.push([[orth], [lastRegular]]);
      }
      if (orth.endsWith("-")) {
        starts.push([[orth], [lastRegular]]);
      }
    }
  }
  console.log(unhandled);
  console.log(starts);
  console.log(ends);
}

function fixMissingAuthors(
  input: string,
  isBibl: boolean,
  authorList: string[]
): XmlChild[] {
  for (const author of authorList) {
    // Skip the edge case authors as they are not really authors
    // but more like prefixes for comment types of works (e.g. Codex)
    if (AUTHOR_EDGE_CASES.includes(author)) {
      continue;
    }
    let i = 0;
    while (true) {
      // Keep searching for the author string
      i = input.indexOf(author, i);
      if (i === -1) {
        break;
      }
      const authorStart = i;
      i += author.length;
      // Consume any spaces
      let gotSpace = false;
      while (i < input.length) {
        const c = input[i];
        if (c === " ") {
          i++;
          gotSpace = true;
        } else {
          break;
        }
      }
      if (!gotSpace) {
        continue;
      }
      // Find matching works for this matched author.
      const works = LsAuthorAbbreviations.authors().get(author)!;
      for (const work of works) {
        const workNames = Array.from(work.works.keys());
        for (const workName of workNames) {
          const maybeWork = input.substring(i, i + workName.length);
          if (maybeWork !== workName) {
            continue;
          }
          const prefix = input.substring(0, authorStart);
          const authorNode = new XmlNode("author", [], [author]);
          // If we're already in a bibl, we can just add fix the author tag issue
          // and leave the rest. Note the space is included because we may skip any
          // number of spaces between the author and work, but we only care about one.
          if (isBibl) {
            return [prefix, authorNode, " " + input.substring(i)];
          }
          return [
            prefix,
            new XmlNode("bibl", [], [authorNode, " " + maybeWork]),
            input.substring(i + workName.length),
          ];
        }
      }
    }
  }
  return [input];
}

/**
 * Finds instances where we have an author followed by a work for that author but
 * without author tags for that author, and adds <author> tags (and optionally
 * <bibl> tags around the author and work if needed).
 *
 * Note that this does not attempt to handle the case where we have multiple missing
 * authors in the same child string. This is rare enough that to handle those on the
 * unprocessed text, we just run this twice. The first pass fixed ~2000 issues, the second
 * pass fixed the remaining 9.
 */
export async function findMissingAuthorTags() {
  const authorList = Array.from(LsAuthorAbbreviations.authors().keys());
  let fixes = 0;
  await LsRewriters.transformEntries(envVar("LS_PATH"), (root) => {
    const allTextNodes = findTextNodes(root);
    // Make sure to go backwards so the parent indicies in `allTextNodes` don't
    // become out of date as we make fixes.
    for (let i = allTextNodes.length - 1; i >= 0; i--) {
      const textNode = allTextNodes[i];
      const result = fixMissingAuthors(
        textNode.text,
        textNode.parent.name === "bibl",
        authorList
      );
      if (result.length === 1 && result[0] === textNode.text) {
        continue;
      }
      fixes++;
      textNode.parent.children.splice(textNode.textIndex, 1, ...result);
    }
    return root;
  });
  console.log("Fixes found : " + fixes);
}
