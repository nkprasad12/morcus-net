import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { matches, instanceOf } from "./parsing";

export interface LsResult {
  entry: XmlNode;
}

export namespace LsResult {
  export const isMatch: (x: unknown) => x is LsResult = matches<LsResult>([
    ["entry", instanceOf(XmlNode)],
  ]);
}
