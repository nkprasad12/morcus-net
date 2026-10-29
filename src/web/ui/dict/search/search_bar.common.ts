import { html, joinHtml } from "@/web/ui/core/dom/html.common";
import type { SafeHtml } from "@/web/ui/core/dom/html.common";
import { DICT_SOURCE_LANG } from "@/web/ui/dict/settings/dict_bitmask.common";

/** The dictionary settings `<dialog>`, also the `#hash` that opens it without JS. */
export const DICT_SETTINGS_DIALOG_ID = "dict-settings";
/** The tray button (a `#dict-settings` link) that opens the settings dialog. */
export const DICT_SETTINGS_TRIGGER_ID = "dict-settings-btn";

/**
 * Computes unique source languages ('from') from a collection of active LatinDict keys.
 * Filters out wildcard '*' (such as Numeral).
 */
export function computeActiveLanguages(
  activeDictKeys: Iterable<string>
): string[] {
  const seen = new Set<string>();
  for (const key of activeDictKeys) {
    const from = DICT_SOURCE_LANG[key];
    if (from && from !== "*" && !seen.has(from)) {
      seen.add(from);
    }
  }
  return Array.from(seen);
}

/**
 * Generates HTML for active language chips.
 *
 * This and `renderInflectChipHtml` are deliberately the only HTML renderers in
 * the `.common.ts` tier: the server paints the chips on load and the client
 * repaints them on toggle, and the markup must be byte-identical on both sides.
 */
export function renderLangChipsHtml(languages: string[]): SafeHtml {
  if (languages.length === 0) {
    return html`<span class="lang-chip lang-chip-none">None</span>`;
  }
  const chips = languages.map(
    (lang) =>
      html`<span
        class="lang-chip lang-chip-${lang.toLowerCase()}"
        title="${lang}"
        >${lang}</span
      >`
  );
  return html`${joinHtml(chips)}`;
}

/**
 * Generates HTML for the inflection status badge.
 */
export function renderInflectChipHtml(isInflected: boolean): SafeHtml {
  return html`<span class="inflect-chip ${isInflected ? "is-on" : "is-off"}"
    >${isInflected ? "On" : "Off"}</span
  >`;
}
