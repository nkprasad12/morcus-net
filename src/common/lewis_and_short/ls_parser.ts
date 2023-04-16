import { readFileSync } from "fs";
import { extractEntries, parseEntriesInline, XmlNode } from "./xml_node";

export function getRaw(path: string): string[] {
  const xmlContents = readFileSync(path, "utf8");
  return extractEntries(xmlContents);
}

export function parse(path: string): Generator<XmlNode> {
  return parseEntriesInline(getRaw(path));
}
