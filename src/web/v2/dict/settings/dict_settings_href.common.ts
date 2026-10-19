import { SAVE_PARAM } from "@/web/v2/dict/settings/dict_selection.common";

/** Every query parameter that carries dictionary content settings (or the save marker). */
export const SETTINGS_PARAMS = ["d", "dict", "in", "o", SAVE_PARAM] as const;

/**
 * The same page with every settings parameter removed, so the server falls back to the user's
 * cookies. This is guest mode's **Restore saved** link: a plain GET, so it works without JS.
 *
 * `keepInflection` (scoped views) keeps `o`: there it's the lookup's, not a setting.
 */
export function ownSettingsHref(
  originalUrl: string,
  options?: { keepInflection?: boolean }
): string {
  const url = new URL(originalUrl, "http://localhost");
  for (const name of SETTINGS_PARAMS) {
    if (name === "o" && options?.keepInflection) continue;
    url.searchParams.delete(name);
  }
  return url.pathname + url.search;
}
