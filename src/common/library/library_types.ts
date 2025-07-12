import { XmlNode } from "@/common/xml/xml_node";
import {
  Validator,
  instanceOf,
  isArray,
  isBoolean,
  isNumber,
  isPair,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";

export interface TranslationInfo {
  title: string;
  id: string;
  translator?: string;
}

const isTranslationInfo = matchesObject<TranslationInfo>({
  title: isString,
  id: isString,
  translator: maybeUndefined(isString),
});

export interface DocumentInfo {
  title: string;
  shortTitle?: string;
  author: string;
  editor?: string;
  translator?: string;
  sponsor?: string;
  funder?: string;
  workId: string;
  translationId?: string;
  translationInfo?: TranslationInfo;
  sourceRef?: string[];
  attribution: "perseus" | "hypotactic";
}

export namespace DocumentInfo {
  export const isMatch = matchesObject<DocumentInfo>({
    title: isString,
    shortTitle: maybeUndefined(isString),
    author: isString,
    editor: maybeUndefined(isString),
    translator: maybeUndefined(isString),
    sponsor: maybeUndefined(isString),
    funder: maybeUndefined(isString),
    workId: isString,
    translationId: maybeUndefined(isString),
    translationInfo: maybeUndefined(isTranslationInfo),
    sourceRef: maybeUndefined(isArray(isString)),
    attribution: isString,
  });
}

export interface WorkPage {
  id: string[];
  // The start and end.
  rows: [number, number];
}

const isWorkPage = matchesObject<WorkPage>({
  id: isArray(isString),
  rows: isPair(isNumber, isNumber),
});

export interface NavTreeNode {
  id: string[];
  children: NavTreeNode[];
}

function isNavTreeNode(x: unknown): x is NavTreeNode {
  return matchesObject<NavTreeNode>({
    id: isArray(isString),
    children: isArray(isNavTreeNode),
  })(x);
}

export type ProcessedWorkContentNodeType =
  | "span"
  | "head"
  | "gap"
  | "b"
  | "br"
  | "space"
  | "ul"
  | "li"
  | "note";
export interface ProcessedWork2 {
  /** Basic information about this work such as author or title. */
  info: DocumentInfo;
  /**
   * The high level divisions of texts, like chapter, section, and so on.
   * These are returned in descending order of size.
   */
  textParts: string[];
  /** Rows representing the work content. */
  rows: [string[], XmlNode<ProcessedWorkContentNodeType>][];
  /** The default pagination for the content. */
  pages: WorkPage[];
  /** The default navigation tree for the content. */
  navTree: NavTreeNode;
  /** Notes for the document. */
  notes?: XmlNode[];
}

export namespace ProcessedWork2 {
  export const isMatch = matchesObject<ProcessedWork2>({
    info: DocumentInfo.isMatch,
    textParts: isArray(isString),
    rows: isArray(isPair(isArray(isString), instanceOf(XmlNode))),
    pages: isArray(isWorkPage),
    navTree: isNavTreeNode,
    notes: maybeUndefined(isArray(instanceOf(XmlNode))),
  });
}

/** Basic details about a single work in the library. */
export interface LibraryWorkMetadata {
  /** The author of this work. */
  author: string;
  /** The name of this work. */
  name: string;
  /** The id by which to obtain the full work. */
  id: string;
  /** The representation of the author in a URL. */
  urlAuthor: string;
  /** The representation of the work name in a URL. */
  urlName: string;
  /** The ID of the translation for this work. */
  translationId?: string;
  /** Whether this is a translation. */
  isTranslation?: boolean;
  /** The source of the raw data. */
  attribution: "perseus" | "hypotactic";
}

export namespace LibraryWorkMetadata {
  export const isMatch = matchesObject<LibraryWorkMetadata>({
    author: isString,
    name: isString,
    id: isString,
    urlAuthor: isString,
    urlName: isString,
    translationId: maybeUndefined(isString),
    isTranslation: maybeUndefined(isBoolean),
    attribution: isString,
  });
}

export type ListLibraryWorksResponse = LibraryWorkMetadata[];

export namespace ListLibraryWorksResponse {
  export const isMatch: Validator<ListLibraryWorksResponse> =
    isArray<LibraryWorkMetadata>(LibraryWorkMetadata.isMatch);
}

interface NameAndAuthor {
  urlName: string;
  urlAuthor: string;
}

export interface WorkId {
  id?: string;
  nameAndAuthor?: NameAndAuthor;
  commitHash?: string;
}

export namespace WorkId {
  export const isMatch = matchesObject<WorkId>({
    id: maybeUndefined(isString),
    nameAndAuthor: maybeUndefined(
      matchesObject<NameAndAuthor>({
        urlName: isString,
        urlAuthor: isString,
      })
    ),
    commitHash: maybeUndefined(isString),
  });
}
