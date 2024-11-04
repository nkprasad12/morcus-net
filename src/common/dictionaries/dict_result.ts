import { XmlNode } from "@/common/xml/xml_node";
import {
  matchesObject,
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
  export const isMatch = matchesObject<OutlineSection>({
    text: isString,
    level: isNumber,
    ordinal: isString,
    sectionId: isString,
  });
}

/** A pre-processed outline for a dictionary entry. */
export interface EntryOutline {
  /** The main key (headword) for this entry. */
  mainKey: string;
  mainLabel?: string;
  mainSection: OutlineSection;
  senses?: OutlineSection[];
}

export namespace EntryOutline {
  export const isMatch = matchesObject<EntryOutline>({
    mainKey: isString,
    mainLabel: maybeUndefined(isString),
    mainSection: OutlineSection.isMatch,
    senses: maybeUndefined(isArray(OutlineSection.isMatch)),
  });
}

/** Data for the inflection of a word. */
export interface InflectionData {
  form: string;
  lemma: string;
  data: string;
  usageNote?: string;
}

export namespace InflectionData {
  export const isMatch = matchesObject<InflectionData>({
    form: isString,
    lemma: isString,
    data: isString,
    usageNote: maybeUndefined(isString),
  });
}

export interface DictSubsectionResult {
  id: string;
  name: string;
  inflections?: InflectionData[];
}

export namespace DictSubsectionResult {
  export const isMatch = matchesObject<DictSubsectionResult>({
    id: isString,
    name: isString,
    inflections: maybeUndefined(isArray(InflectionData.isMatch)),
  });
}

/** The pre-processed result for a dictionary entry. */
export interface EntryResult {
  entry: XmlNode;
  outline: EntryOutline;
  inflections?: InflectionData[];
  subsections?: DictSubsectionResult[];
}

export namespace EntryResult {
  export const isMatch: (x: unknown) => x is EntryResult =
    matchesObject<EntryResult>({
      entry: instanceOf(XmlNode),
      outline: EntryOutline.isMatch,
      inflections: maybeUndefined(isArray(InflectionData.isMatch)),
      subsections: maybeUndefined(isArray(DictSubsectionResult.isMatch)),
    });
}
