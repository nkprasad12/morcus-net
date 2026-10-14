import {
  type DraggedPageWidth,
  type GlobalSettings,
  isDraggedPageWidth,
  settingsStore,
} from "@/web/v2/core/state/settings.client";
import { setPrepaint } from "@/web/v2/core/dom/prepaint.client";
import {
  WIDTH_SURFACES,
  type WidthSurface,
  type WidthSurfaceConfig,
} from "@/web/v2/core/widgets/page_width.common";

export * from "@/web/v2/core/widgets/page_width.common";

/**
 * Page widths, saved per surface in `GlobalSettings`.
 *
 * Each surface (reader, dict, library, corpus) stores a px width or
 * `"full"`, recorded with `setPrepaint` as `--{surface}-page-max`, so the
 * critical script applies it before first paint. The handles live in
 * `shell/page_width_handles.client.ts`.
 */

// --- Draggable surfaces ---------------------------------------------------

const DRAGGED_KEY = {
  reader: "readerWidth",
  dict: "dictWidth",
  library: "libraryWidth",
  corpus: "corpusWidth",
} as const satisfies Record<WidthSurface, keyof GlobalSettings>;

/** The saved width for `surface`, or `undefined` for the default. */
export function getSurfaceWidth(
  surface: WidthSurface
): DraggedPageWidth | undefined {
  const saved = settingsStore.get()[DRAGGED_KEY[surface]];
  return isDraggedPageWidth(saved) ? saved : undefined;
}

/** The CSS value for `--{surface}-page-max`; `null` for the default. */
export function widthCssValue(
  width: DraggedPageWidth | undefined
): string | null {
  if (width === undefined) return null;
  return width === "full" ? "100vw" : `${width}px`;
}

function recordSurfaceWidth(
  surface: WidthSurface,
  width: DraggedPageWidth | undefined
): void {
  setPrepaint(`--${surface}-page-max`, widthCssValue(width));
}

/**
 * Applies and saves a width. The surface's default (or `undefined`) clears
 * the saved value. Call it on commit only (release, key, reset): a root
 * custom property restyles the whole page.
 */
export function setSurfaceWidth(
  surface: WidthSurface,
  width: DraggedPageWidth | undefined
): void {
  const stored = width === WIDTH_SURFACES[surface].def ? undefined : width;
  recordSurfaceWidth(surface, stored);
  const patch: Partial<GlobalSettings> = {};
  patch[DRAGGED_KEY[surface]] = stored;
  settingsStore.update(patch);
}

/**
 * Re-records the saved width for the critical script. Owners call this on
 * connect, so a stale snapshot heals after one load.
 */
export function syncSurfaceWidth(surface: WidthSurface): void {
  recordSurfaceWidth(surface, getSurfaceWidth(surface));
}

/** Within this many px of a preset (or of full width), a drag snaps to it. */
export const SNAP_PX = 20;

/**
 * Clamps a raw width to `[min, max]` and snaps it to a preset or to full.
 * `max` is the viewport width; reaching it (within {@link SNAP_PX}) returns
 * `"full"`, so the page keeps following the window.
 */
export function resolveSurfaceWidth(
  raw: number,
  config: WidthSurfaceConfig,
  max: number
): DraggedPageWidth {
  let width = Math.round(Math.max(config.min, Math.min(max, raw)));
  for (const preset of config.presets) {
    if (Math.abs(width - preset) <= SNAP_PX && preset < max) width = preset;
  }
  return max - width <= SNAP_PX ? "full" : width;
}
