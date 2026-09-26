import {
  type GlobalSettings,
  isStoredPageWidth,
  settingsStore,
} from "@/web/v2/core/settings.client";

/**
 * Page width presets for the reader and the standalone dictionary.
 *
 * The preset is mirrored onto `<html data-{surface}-width="...">`, and
 * `shell/page_width.css` maps it to pixel widths. The inline `<head>` script
 * (`shell/critical_theme.client.ts`) applies the same attribute before first
 * paint, so this module only runs when the user changes the setting.
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

/**
 * Applies and saves a preset. Unknown values (including `"default"`) clear
 * the preset, so an option's `value` can be passed straight through.
 */
export function setPageWidth(surface: PageWidthSurface, value: string): void {
  const stored = isStoredPageWidth(value) ? value : undefined;
  const attr = `data-${surface}-width`;
  if (stored) {
    document.documentElement.setAttribute(attr, stored);
  } else {
    document.documentElement.removeAttribute(attr);
  }
  const patch: Partial<GlobalSettings> = {};
  patch[SETTINGS_KEY[surface]] = stored;
  settingsStore.update(patch);
}
