import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { html, joinHtml } from "@/web/v2/core/dom/html.common";
import type { SafeHtml } from "@/web/v2/core/dom/html.common";

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
  const keysSet =
    activeDictKeys instanceof Set ? activeDictKeys : new Set(activeDictKeys);
  const langs = new Set<string>();

  for (const dict of LatinDict.AVAILABLE) {
    if (keysSet.has(dict.key) && dict.languages.from !== "*") {
      langs.add(dict.languages.from);
    }
  }

  return Array.from(langs);
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
