import { XmlNode } from "@/common/xml/xml_node";
import {
  Validator,
  instanceOf,
  isArray,
  isNumber,
  isPair,
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

export type ProcessedWorkChunk = [number[], XmlNode];

export interface ProcessedWork {
  /** Basic information about this work such as author or title. */
  info: DocumentInfo;
  /**
   * The high level divisions of texts, like chapter, section, and so on.
   * These are returned in descending order of size.
   */
  textParts: string[];
  /**
   * The index of each of the chunks of the text, along with the marked
   * up text. The index has one part for each of the `textParts`, so for example
   * if `textParts` is `["Chapter", "Section"]`, then the index of `[2, 5]`
   * identifies `Chapter 2, Section 5`.
   */
  chunks: ProcessedWorkChunk[];
}

export namespace ProcessedWork {
  export const isMatch: Validator<ProcessedWork> = matches([
    ["info", DocumentInfo.isMatch],
    ["textParts", isArray(isString)],
    ["chunks", isArray(isPair(isArray(isNumber), instanceOf(XmlNode)))],
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
}

export namespace LibraryWorkMetadata {
  export const isMatch: Validator<LibraryWorkMetadata> = matches([
    ["author", isString],
    ["name", isString],
    ["id", isString],
  ]);
}

export type ListLibraryWorksResponse = LibraryWorkMetadata[];

export namespace ListLibraryWorksResponse {
  export const isMatch: Validator<ListLibraryWorksResponse> =
    isArray<LibraryWorkMetadata>(LibraryWorkMetadata.isMatch);
}
