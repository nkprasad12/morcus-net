/* istanbul ignore file */

import * as dotenv from "dotenv";
dotenv.config();

import { parse } from "@/common/lewis_and_short/ls_parser";
import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { parseAuthorAbbreviations } from "@/common/lewis_and_short/ls_abbreviations";
import { checkPresent } from "../assert";
import { getOrths, isRegularOrth } from "./ls_orths";

const LS_PATH = checkPresent(process.env.LS_PATH);

interface Schema {
  entry: string;
  childrenTypes: Set<string>;
}

const schemaMap = new Map<string, Schema>();

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
  for (const entry of parse(LS_PATH)) {
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
  for (const entry of parse(LS_PATH)) {
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
  for (const entry of parse(LS_PATH)) {
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
  for (const entry of parse(LS_PATH)) {
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
  for (const entry of parse(LS_PATH)) {
    const matchNodes = entry.findDescendants(name);
    for (const node of matchNodes) {
      node.attrs.forEach((attribute) => valueSet.add(attribute[0]));
    }
  }
  console.log(valueSet);
}

export function printElementAttributeValues(name: string, attrName: string) {
  const valueSet = new Set<string>();
  for (const entry of parse(LS_PATH)) {
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
  for (const entry of parse(LS_PATH)) {
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
  for (const entry of parse(checkPresent(process.env.LS_PATH))) {
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
