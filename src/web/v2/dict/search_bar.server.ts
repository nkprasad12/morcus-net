import * as he from "he";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { DEFAULT_DICT_KEYS } from "@/web/v2/dict/dict_selection.server";
import { encodeDictBitmask } from "@/web/v2/dict/dict_bitmask.common";
import { ICON_PATHS } from "@/web/v2/core/icons";

import {
  computeActiveLanguages,
  renderLangChipsHtml,
  renderInflectChipHtml,
} from "@/web/v2/dict/search_bar.common";

const TUNE_PATH = ICON_PATHS.tune;
const SEARCH_PATH = ICON_PATHS.search;

export interface SearchBarOptions {
  query?: string;
  action: string;
  placeholder?: string;
  includeSettings?: boolean;
  activeDicts?: string[];
  isInflected?: boolean;
  extraHiddenInputs?: Record<string, string>;
}

/**
 * Shared search bar component rendering the two-tier compound search card,
 * text input, submit button with magnifying glass SVG, status badges tray,
 * and dictionary settings popover.
 */
export function renderDictSearchBar(options: SearchBarOptions): string {
  const query = options.query?.trim() ?? "";
  const queryEscaped = query ? he.escape(query) : "";
  const placeholder = options.placeholder ?? "Search for a word";
  const includeSettings = options.includeSettings ?? true;
  const isInflected = options.isInflected !== false; // default true

  const activeDictList = options.activeDicts ?? DEFAULT_DICT_KEYS;
  const activeDictKeys = new Set(activeDictList);
  const dictBitmask = encodeDictBitmask(activeDictList);

  const activeLangs = computeActiveLanguages(activeDictKeys);
  const langChipsHtml = renderLangChipsHtml(activeLangs);
  const inflectChipHtml = renderInflectChipHtml(isInflected);

  const dictItemsHtml = LatinDict.AVAILABLE.map((d) => {
    const isChecked = activeDictKeys.has(d.key);
    const langText = `${d.languages.from} \u2192 ${d.languages.to}`;
    return `
      <label class="v2-dict-item" title="${he.encode(
        d.displayName
      )} (${langText})">
        <input
          type="checkbox"
          name="dict"
          value="${he.encode(d.key)}"
          class="v2-dict-checkbox"
          data-key="${he.encode(d.key)}"
          ${isChecked ? "checked" : ""}
        />
        <span class="v2-dict-name">${he.encode(d.displayName)}</span>
        <span class="v2-dict-lang">${langText}</span>
      </label>
    `;
  }).join("\n");

  const settingsHtml = includeSettings
    ? `
      <morcus-dict-settings>
        <details class="v2-dict-settings-details">
          <summary
            class="v2-settings-btn"
            aria-label="Dictionary and highlight settings"
            title="Dictionary and highlight settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="${TUNE_PATH}"></path>
            </svg>
          </summary>

          <div class="v2-settings-popover">
            <div class="v2-settings-inflected-section">
              <div class="v2-settings-section-title">Search Scope</div>
              <input type="hidden" name="o" value="0" />
              <label class="v2-dict-item" title="Search conjugated verbs and declined nouns/adjectives">
                <input
                  type="checkbox"
                  name="o"
                  value="1"
                  id="v2-toggle-inflected"
                  class="v2-inflected-checkbox"
                  ${isInflected ? "checked" : ""}
                />
                <span class="v2-dict-name">Latin inflected forms</span>
              </label>
              <p class="v2-settings-caption">Match conjugated verbs and declined nouns/adjectives.</p>
            </div>

            <div class="v2-settings-divider" role="separator"></div>

            <div class="v2-settings-section-title">Enabled Dictionaries</div>
            <div class="v2-dict-list">
              ${dictItemsHtml}
            </div>
            <noscript>
              <div class="v2-settings-noscript-actions">
                <button type="submit" class="v2-btn v2-btn-secondary v2-settings-apply-btn">Apply Selection</button>
              </div>
            </noscript>
          </div>
        </details>
      </morcus-dict-settings>
    `.trim()
    : "";

  const trayHtml = includeSettings
    ? `
      <div class="v2-search-tray">
        <div class="v2-search-tray-left">
          <span class="v2-tray-label">In</span>
          <div class="v2-lang-chips">
            ${langChipsHtml}
          </div>
          <span class="v2-tray-dot" aria-hidden="true">•</span>
          <span class="v2-tray-label">Inflection</span>
          ${inflectChipHtml}
        </div>
        <div class="v2-search-tray-right">
          ${settingsHtml}
        </div>
      </div>
    `.trim()
    : "";

  const hiddenInputsHtml = options.extraHiddenInputs
    ? Object.entries(options.extraHiddenInputs)
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${he.escape(k)}" value="${he.escape(
              v
            )}">`
        )
        .join("\n")
    : "";

  return `
    <form class="v2-search-form" action="${he.escape(
      options.action
    )}" method="GET">
      <input type="hidden" name="d" value="${he.escape(dictBitmask)}" />
      ${hiddenInputsHtml}
      <div class="v2-input-wrapper">
        <input
          type="text"
          name="q"
          class="v2-input"
          value="${queryEscaped}"
          placeholder="${he.escape(placeholder)}"
          autocomplete="off"
          enterkeyhint="search"
        />
        <button
          type="submit"
          class="v2-search-btn"
          aria-label="Search"
          title="Search"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="${SEARCH_PATH}"></path>
          </svg>
        </button>
      </div>
      ${trayHtml}
    </form>
  `.trim();
}
