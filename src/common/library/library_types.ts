import { XmlNode } from "@/common/xml/xml_node";
import {
  Validator,
  instanceOf,
  isArray,
  isNumber,
  isPair,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";

export interface DocumentInfo {
  title: string;
  author: string;
  editor?: string;
  sponsor?: string;
  funder?: string;
  workId: string;
}

export namespace DocumentInfo {
  export const isMatch = matchesObject<DocumentInfo>({
    title: isString,
    author: isString,
    editor: maybeUndefined(isString),
    sponsor: maybeUndefined(isString),
    funder: maybeUndefined(isString),
    workId: isString,
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
  | "s"
  | "gap"
  | "b"
  | "space"
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
}

export namespace LibraryWorkMetadata {
  export const isMatch = matchesObject<LibraryWorkMetadata>({
    author: isString,
    name: isString,
    id: isString,
    urlAuthor: isString,
    urlName: isString,
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
  });
}
