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
   * `visual-baselines accept` and `drop`. Missing for `results` items
   * whose Playwright project couldn't be determined.
   */
  snapshotName?: string;
  /** When the baseline was accepted (ISO). */
  acceptedAt?: string;
}

export type VisualDiffSource = "results" | "previous";

/**
 * What the viewer may write, and whether it currently can. Present when
 * the Inspector serves the viewer with write endpoints (`results` and
 * `previous` sources).
 */
export interface ViewerActions {
  /**
   * `accept`: the everyday `results` mode; accepting locally ends the flow.
   * `previous`: inspecting the last `--update` or `accept` against `.visual-baselines/previous/`;
   * allows undoing the last update or dropping individual baselines.
   */
  mode: "accept" | "previous";
  /** Why actions are unavailable, if they are. */
  disabledReason?: string;
}

/** The local baseline store at a glance, for hints in the viewer. */
export interface StoreSummary {
  /** Stored local baselines. */
  active: number;
  /** Disk size of the stored PNGs. */
  bytes: number;
  /** Oldest `acceptedAt` among the active ones. */
  oldestAcceptedAt?: string;
  /** Snapshots in the 1-deep `.visual-baselines/previous/` backup, if any. */
  previousCount?: number;
  /** When the 1-deep backup was recorded (ISO). */
  previousUpdatedAt?: string;
}

/** Results of the write endpoints, shared by the server and the viewer. */
export interface AcceptResponse {
  added: string[];
  updated: string[];
  unchanged: string[];
  store: StoreSummary;
}

export interface DropResponse {
  /** Local baselines removed. */
  dropped: string[];
  /** Earlier local baselines put back (on undo). */
  restored: string[];
  store: StoreSummary;
}

export interface ApiError {
  error: string;
}

export interface VisualDiffManifest {
  source: VisualDiffSource;
  /** Human readable label for the baseline, e.g. `Expected` or `Previous baseline`. */
  beforeLabel: string;
  /** Human readable label for the new images, e.g. `Actual` or `Local baseline`. */
  afterLabel: string;
  items: SnapshotMeta[];
  /**
   * `results` source only: failed tests with no screenshot to compare (e.g.
   * timeouts). Listed separately because there is no image to show.
   */
  failuresWithoutSnapshot?: { dir: string; project?: string }[];
  /**
   * Identifies what is being reviewed (the run marker for `results`, the
   * previous backup contents for `previous`), so review verdicts kept in the
   * browser's `sessionStorage` don't carry over to different screenshots.
   */
  reviewKey?: string;
  actions?: ViewerActions;
  /** The local store when the viewer was generated. */
  localStore?: StoreSummary;
}
