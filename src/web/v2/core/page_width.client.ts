import {
  type GlobalSettings,
  isStoredPageWidth,
  settingsStore,
} from "@/web/v2/core/settings.client";
import { setPrepaint } from "@/web/v2/core/prepaint.client";

/**
 * Page width presets for the reader and the standalone dictionary.
 *
 * The preset is mirrored onto `<html data-{surface}-width="...">`, and
 * `shell/page_width.css` maps it to pixel widths. It's recorded with
 * `setPrepaint`, so the critical script applies it before first paint.
 */
export type PageWidthSurface = "reader" | "dict";

const SETTINGS_KEY = {
  reader: "readerWidth",
  dict: "dictWidth",
} as const satisfies Record<PageWidthSurface, keyof GlobalSettings>;

/** Returns the saved preset for `surface`, or `"default"` if none is saved. */
export function getPageWidth(surface: PageWidthSurface): string {
  return settingsStore.get()[SETTINGS_KEY[surface]] ?? "default";
}

function applyPageWidth(
  surface: PageWidthSurface,
  stored: string | undefined
): void {
  setPrepaint(`data-${surface}-width`, stored ?? null);
}

/**
 * Re-records the saved preset for the critical script. Owners call this on
 * connect, so a snapshot that went stale (e.g. V1 changed the setting) heals
 * after one load.
 */
export function syncPageWidth(surface: PageWidthSurface): void {
  const saved = getPageWidth(surface);
  applyPageWidth(surface, isStoredPageWidth(saved) ? saved : undefined);
}

/**
 * Applies and saves a preset. Unknown values (including `"default"`) clear
 * the preset, so an option's `value` can be passed straight through.
 */
export function setPageWidth(surface: PageWidthSurface, value: string): void {
  const stored = isStoredPageWidth(value) ? value : undefined;
  applyPageWidth(surface, stored);
  const patch: Partial<GlobalSettings> = {};
  patch[SETTINGS_KEY[surface]] = stored;
  settingsStore.update(patch);
}
