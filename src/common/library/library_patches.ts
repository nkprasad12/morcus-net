import fs from "fs";

import {
  isArray,
  isPair,
  isString,
  matchesObject,
} from "@/web/utils/rpc/parsing";
import { filesInPaths } from "@/utils/file_utils";
import { assertType } from "@/common/assert";
import path from "path";

const PATCHES_ROOT = "patches";
const PATCH_EXTENSION = ".xml.patch.json";

export interface LibraryPatch {
  /** The CTS location of the patch within the document. */
  location: [string, string][];
  /** The target substring to replace. Must be unique in the CTS location. */
  target: string;
  /** The replacement for the `target`. */
  replacement: string;
  /** The reason for replacement. */
  reason: string;
}

export type LibraryPatchMap = Map<string, LibraryPatch[]>;

const isLibraryPatch = matchesObject<LibraryPatch>({
  location: isArray(isPair(isString, isString)),
  target: isString,
  replacement: isString,
  reason: isString,
});

export function loadPatches(): LibraryPatchMap {
  const patches = Array.from(filesInPaths([PATCHES_ROOT]))
    .filter((filePath) => filePath.endsWith(PATCH_EXTENSION))
    .map((filePath): [string, LibraryPatch[]] => {
      const contents = JSON.parse(fs.readFileSync(filePath).toString());
      const patcheForFile = assertType(contents, isArray(isLibraryPatch));
      const key = path.basename(filePath).slice(0, -PATCH_EXTENSION.length);
      return [key, patcheForFile];
    });
  return new Map(patches);
}
