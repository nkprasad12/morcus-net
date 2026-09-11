import { LatinDict } from "@/common/dictionaries/latin_dicts";

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
export function renderLangChipsHtml(languages: string[]): string {
  if (languages.length === 0) {
    return '<span class="v2-lang-chip v2-lang-chip-none">None</span>';
  }
  return languages
    .map(
      (lang) =>
        `<span class="v2-lang-chip v2-lang-chip-${escapeHtml(
          lang.toLowerCase()
        )}" title="${escapeHtml(lang)}">${escapeHtml(lang)}</span>`
    )
    .join("");
}

/**
 * Generates HTML for the inflection status badge.
 */
export function renderInflectChipHtml(isInflected: boolean): string {
  return `<span class="v2-inflect-chip ${isInflected ? "is-on" : "is-off"}">${
    isInflected ? "On" : "Off"
  }</span>`;
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
