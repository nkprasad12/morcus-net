import { readFileSync } from "fs";
import { extractEntries, parseEntries, XmlNode } from "./xml_node";

export function getRaw(path: string): string[] {
  const xmlContents = readFileSync(path, "utf8");
  return extractEntries(xmlContents);
}

export function parse(path: string): XmlNode[] {
  return parseEntries(getRaw(path));
}
