/* istanbul ignore file */

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
  | "Corpus"
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
  /**
   * The baseline file this snapshot belongs to, as used by
   * `visual-baselines accept` and `checkpoint`. Missing for `results` items
   * whose Playwright project couldn't be determined.
   */
  snapshotName?: string;
}

export type VisualDiffSource = "git" | "results" | "local";

/**
 * What the viewer may write, and whether it currently can. Present only when
 * the Inspector serves the viewer with write endpoints (`results` and
 * `local` sources).
 */
export interface ViewerActions {
  /** `results`: accept, then checkpoint. `local`: checkpoint only. */
  flow: "accept-then-checkpoint" | "checkpoint";
  /** Why actions are unavailable, if they are. */
  disabledReason?: string;
}

/** Results of the write endpoints, shared by the server and the viewer. */
export interface AcceptResponse {
  added: string[];
  updated: string[];
  reverted: string[];
  unchanged: string[];
  /** Local vs checkpoint, for the accepted names that are now local baselines. */
  items: SnapshotMeta[];
}

export interface CheckpointResponse {
  promoted: string[];
  skippedStale: string[];
  /** Files written, relative to the repository root. */
  files: string[];
}

export interface ApiError {
  error: string;
}

export interface VisualDiffManifest {
  source: VisualDiffSource;
  /** Human readable label for the baseline, e.g. `HEAD` or `Expected`. */
  beforeLabel: string;
  /** Human readable label for the new images, e.g. `Working copy`. */
  afterLabel: string;
  items: SnapshotMeta[];
  /**
   * `results` source only: failed tests with no screenshot to compare (e.g.
   * timeouts). Listed separately because there is no image to show.
   */
  failuresWithoutSnapshot?: { dir: string; project?: string }[];
  /**
   * `local` source only: local baselines ignored because the checkpoint
   * changed after they were accepted.
   */
  staleLocalBaselines?: string[];
  /**
   * Identifies what is being reviewed (the run marker for `results`, the
   * local store contents for `local`), so review verdicts kept in the
   * browser's `sessionStorage` don't carry over to different screenshots.
   */
  reviewKey?: string;
  actions?: ViewerActions;
}
