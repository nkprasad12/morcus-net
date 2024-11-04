import { XmlNode } from "@/common/xml/xml_node";
import {
  Validator,
  instanceOf,
  isArray,
  isOneOf,
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
  workId?: string;
}

export namespace DocumentInfo {
  export const isMatch = matchesObject<DocumentInfo>({
    title: isString,
    author: isString,
    editor: maybeUndefined(isString),
    sponsor: maybeUndefined(isString),
    funder: maybeUndefined(isString),
    workId: maybeUndefined(isString),
  });
}

export interface ProcessedWorkNode {
  /** The identified for this node. */
  id: string[];
  /** A header for this section, if any. */
  header?: string;
  /**
   * The data for this node. Any recursive children are themselves versioned sections,
   * while raw `XmlNode` children are data attached to this node.
   */
  children: (XmlNode | ProcessedWorkNode)[];
  /** Notes for rendering this node and all its children. */
  rendNote?: string;
}

export namespace ProcessedWorkNode {
  export const isMatch = matchesObject<ProcessedWorkNode>({
    id: isArray(isString),
    header: maybeUndefined(isString),
    // Apparently it doesn't work resursively, so just check that it's
    // a JSON object.
    children: isArray(isOneOf(instanceOf(XmlNode), matchesObject<any>({}))),
    rendNote: maybeUndefined(isString),
  });
}

export interface ProcessedWork {
  /** Basic information about this work such as author or title. */
  info: DocumentInfo;
  /**
   * The high level divisions of texts, like chapter, section, and so on.
   * These are returned in descending order of size.
   */
  textParts: string[];
  /** Root node for the content of this work. */
  root: ProcessedWorkNode;
}

export namespace ProcessedWork {
  export const isMatch = matchesObject<ProcessedWork>({
    info: DocumentInfo.isMatch,
    textParts: isArray(isString),
    root: ProcessedWorkNode.isMatch,
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
