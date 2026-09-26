/**
 * Types shared between the visual diff generator (Node) and the viewer
 * (browser). This file must stay free of runtime imports so that the viewer
 * bundle only pulls in type information.
 */

export type SnapshotCategory =
  | "Dictionary"
  | "Reader"
  | "Library"
  | "About"
  | "Other";

/** `small` = mobile / narrow viewport projects, `large` = desktop projects. */
export type SnapshotSize = "small" | "large" | "unknown";

/**
 * - `modified`: both a baseline and a new image exist.
 * - `added`: only the new image exists (no baseline yet).
 * - `deleted`: only the baseline exists (the snapshot was removed).
 */
export type SnapshotStatus = "modified" | "added" | "deleted";

export interface ImageDims {
  width: number;
  height: number;
}

export interface SnapshotMeta {
  /** Unique identifier; also the file stem used for the generated images. */
  id: string;
  /** Original snapshot file name. */
  name: string;
  scenario: string;
  category: SnapshotCategory;
  mode: "js" | "nojs" | "default";
  theme: "light" | "dark" | "default";
  /** Form factor, derived from the Playwright project. */
  size: SnapshotSize;
  browser: string;
  status: SnapshotStatus;
  /** Dimensions of the baseline image, if present. */
  before?: ImageDims;
  /** Dimensions of the new image, if present. */
  after?: ImageDims;
  /** Number of differing pixels, if it could be computed. */
  diffPixels?: number;
  /** Percentage of differing pixels (0-100), if it could be computed. */
  diffPct?: number;
  beforeUrl?: string;
  afterUrl?: string;
  diffUrl?: string;
}

export type VisualDiffSource = "git" | "results";

export interface VisualDiffManifest {
  source: VisualDiffSource;
  /** Human readable label for the baseline, e.g. `HEAD` or `Expected`. */
  beforeLabel: string;
  /** Human readable label for the new images, e.g. `Working copy`. */
  afterLabel: string;
  items: SnapshotMeta[];
}
