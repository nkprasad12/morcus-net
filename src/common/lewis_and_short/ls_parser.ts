import { readFileSync } from "fs";
import { XmlNode } from "./xml_node";
import { extractEntries, parseEntriesInline } from "./ls_xml_utils";

export function getRaw(path: string): string[] {
  const xmlContents = readFileSync(path, "utf8");
  return extractEntries(xmlContents);
}

export function parse(path: string): Generator<XmlNode> {
  return parseEntriesInline(getRaw(path));
}
