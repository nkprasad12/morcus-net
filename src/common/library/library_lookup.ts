import type { LibraryWorkMetadata } from "@/common/library/library_types";

export const LIB_DEFAULT_DIR = "build/library_processed";
export const LIBRARY_INDEX = "morcus_library_index.json";

export interface LibraryIndex {
  [workId: string]: [filePath: string, LibraryWorkMetadata];
}
