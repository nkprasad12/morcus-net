import { XmlNode } from "@/common/xml_node";
import {
  matches,
  instanceOf,
  isString,
  maybeUndefined,
  isArray,
  isNumber,
} from "@/web/utils/rpc/parsing";

export interface SectionOutline {
  text: string;
  level: number;
  ordinal: string;
  sectionId: string;
}

export namespace SectionOutline {
  export const isMatch: (x: unknown) => x is SectionOutline =
    matches<SectionOutline>([
      ["text", isString],
      ["level", isNumber],
      ["ordinal", isString],
      ["sectionId", isString],
    ]);
}

export interface LsOutline {
  mainOrth: string;
  mainSection: SectionOutline;
  senses?: SectionOutline[];
}

export namespace LsOutline {
  export const isMatch: (x: unknown) => x is LsOutline = matches<LsOutline>([
    ["mainSection", SectionOutline.isMatch],
    ["senses", maybeUndefined(isArray(SectionOutline.isMatch))],
  ]);
}

export interface LsResult {
  entry: XmlNode;
  outline?: LsOutline;
}

export namespace LsResult {
  export const isMatch: (x: unknown) => x is LsResult = matches<LsResult>([
    ["entry", instanceOf(XmlNode)],
    ["outline", maybeUndefined(LsOutline.isMatch)],
  ]);
}
