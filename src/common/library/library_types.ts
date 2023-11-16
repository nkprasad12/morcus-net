import { Validator, isArray, isString } from "@/web/utils/rpc/parsing";

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
  export function isMatch(x: unknown): x is LibraryWorkMetadata {
    return isMatch([
      ["author", isString],
      ["name", isString],
      ["id", isString],
    ]);
  }
}

export type ListLibraryWorksResponse = LibraryWorkMetadata[];

export namespace ListLibraryWorksResponse {
  export const isMatch: Validator<ListLibraryWorksResponse> =
    isArray<LibraryWorkMetadata>(LibraryWorkMetadata.isMatch);
}
