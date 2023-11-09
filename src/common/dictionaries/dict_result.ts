import { XmlNode } from "@/common/xml/xml_node";
import {
  matches,
  instanceOf,
  isString,
  maybeUndefined,
  isArray,
  isNumber,
} from "@/web/utils/rpc/parsing";

export interface OutlineSection {
  text: string;
  level: number;
  ordinal: string;
  sectionId: string;
}

export namespace OutlineSection {
  export const isMatch: (x: unknown) => x is OutlineSection =
    matches<OutlineSection>([
      ["text", isString],
      ["level", isNumber],
      ["ordinal", isString],
      ["sectionId", isString],
    ]);
}

/** A pre-processed outline for a dictionary entry. */
export interface EntryOutline {
  mainKey: string;
  mainLabel?: string;
  mainSection: OutlineSection;
  senses?: OutlineSection[];
}

export namespace EntryOutline {
  export const isMatch: (x: unknown) => x is EntryOutline =
    matches<EntryOutline>([
      ["mainKey", isString],
      ["mainLabel", maybeUndefined(isString)],
      ["mainSection", OutlineSection.isMatch],
      ["senses", maybeUndefined(isArray(OutlineSection.isMatch))],
    ]);
}

/** Data for the inflection of a word. */
export interface InflectionData {
  form: string;
  lemma: string;
  data: string;
}

export namespace InflectionData {
  export const isMatch: (x: unknown) => x is InflectionData =
    matches<InflectionData>([
      ["form", isString],
      ["lemma", isString],
      ["data", isString],
    ]);
}

/** The pre-processed result for a dictionary entry. */
export interface EntryResult {
  entry: XmlNode;
  outline: EntryOutline;
  inflections?: InflectionData[];
}

export namespace EntryResult {
  export const isMatch: (x: unknown) => x is EntryResult = matches<EntryResult>(
    [
      ["entry", instanceOf(XmlNode)],
      ["outline", EntryOutline.isMatch],
      ["inflections", maybeUndefined(isArray(InflectionData.isMatch))],
    ]
  );
}
