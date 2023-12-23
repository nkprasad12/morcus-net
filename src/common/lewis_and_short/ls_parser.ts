import { readFileSync } from "fs";
import { extractEntries } from "@/common/lewis_and_short/ls_xml_utils";

export function getRawLsXml(path: string): string[] {
  const xmlContents = readFileSync(path, "utf8");
  return extractEntries(xmlContents);
}
