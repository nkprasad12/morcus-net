import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { html, joinHtml } from "@/web/v2/core/html.common";
import type { SafeHtml } from "@/web/v2/core/html.common";

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
