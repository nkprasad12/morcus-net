import { XmlNode } from "@/common/xml/xml_node";
import {
  Validator,
  instanceOf,
  isArray,
  isOneOf,
  isString,
  matches,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";

export interface DocumentInfo {
  title: string;
  author: string;
  editor?: string;
  sponsor?: string;
  funder?: string;
}

export namespace DocumentInfo {
  export const isMatch: Validator<DocumentInfo> = matches([
    ["title", isString],
    ["author", isString],
    ["editor", maybeUndefined(isString)],
    ["sponsor", maybeUndefined(isString)],
    ["funder", maybeUndefined(isString)],
  ]);
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
}

export namespace ProcessedWorkNode {
  export const isMatch: Validator<ProcessedWorkNode> = matches([
    ["id", isArray(isString)],
    ["header", maybeUndefined(isString)],
    // Apparently it doesn't work resursively, so just check that it's
    // a JSON object.
    ["children", isArray(isOneOf(instanceOf(XmlNode), matches([])))],
  ]);
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
  export const isMatch: Validator<ProcessedWork> = matches([
    ["info", DocumentInfo.isMatch],
    ["textParts", isArray(isString)],
    ["root", ProcessedWorkNode.isMatch],
  ]);
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
  export const isMatch: Validator<LibraryWorkMetadata> = matches([
    ["author", isString],
    ["name", isString],
    ["id", isString],
    ["urlAuthor", isString],
    ["urlName", isString],
  ]);
}

export type ListLibraryWorksResponse = LibraryWorkMetadata[];

export namespace ListLibraryWorksResponse {
  export const isMatch: Validator<ListLibraryWorksResponse> =
    isArray<LibraryWorkMetadata>(LibraryWorkMetadata.isMatch);
}
