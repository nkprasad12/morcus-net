import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import {
  Validator,
  instanceOf,
  isArray,
  isNumber,
  isOneOf,
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

export interface ProcessedWork {
  info: DocumentInfo;
  textParts: string[];
  chunks: [number[], XmlChild[]][];
}

export namespace ProcessedWork {
  export const isMatch: Validator<ProcessedWork> = matches([
    ["info", DocumentInfo.isMatch],
    ["textParts", isArray(isString)],
    [
      "chunks",
      isArray(
        isPair(
          isArray(isNumber),
          isArray(isOneOf(isString, instanceOf(XmlNode)))
        )
      ),
    ],
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
