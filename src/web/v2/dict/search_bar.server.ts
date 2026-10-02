import * as he from "he";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { DEFAULT_DICT_KEYS } from "@/web/v2/dict/dict_selection.server";
import { encodeDictBitmask } from "@/web/v2/dict/dict_bitmask.common";
import { ICON_PATHS } from "@/web/v2/core/icons.common";
import { SAVE_PARAM } from "@/web/v2/dict/dict_selection.common";

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
  /**
   * Set when the rendered settings disagree with the user's saved ones (`isBorrowedView`). Shows
   * the borrowed-view chip; `useMineHref` is the same page without settings params.
   */
  borrowed?: { useMineHref: string };
  /**
   * A scoped view (reader iframe, `lang=` filter) shows a narrowed selection that must never be
   * saved. Published as `data-scoped` so the client skips persistence too.
   */
  scoped?: boolean;
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
      <label class="dict-item" title="${he.escape(
        d.displayName
      )} (${langText})">
        <input
          type="checkbox"
          name="dict"
          value="${he.escape(d.key)}"
          class="dict-checkbox"
          data-key="${he.escape(d.key)}"
          ${isChecked ? "checked" : ""}
        />
        <span class="dict-name">${he.escape(d.displayName)}</span>
        <span class="dict-lang">${langText}</span>
      </label>
    `;
  }).join("\n");

  // The Apply button is a *named* submitter: `save=1` is sent only when it is clicked, so an
  // ordinary search never persists (see `dict_persistence.server.ts`). LOAD-BEARING ORDER: Enter in
  // the search input submits with the form's FIRST submit button in tree order, so `.search-btn`
  // must stay ahead of every `name="save"` button or Enter would silently save. Tested.
  const settingsHtml = includeSettings
    ? `
      <morcus-dict-settings>
        <details class="settings-details dict-settings-details">
          <summary
            class="settings-btn"
            aria-label="Dictionary and highlight settings"
            title="Dictionary and highlight settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="${TUNE_PATH}"></path>
            </svg>
          </summary>

          <div class="settings-popover">
            <div class="settings-slider-section" data-js-only>
              <div class="settings-header">
                <span class="settings-title">Highlight Strength</span>
                <span class="settings-value">50%</span>
              </div>

              <div class="settings-control-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value="50"
                  class="settings-slider"
                  aria-label="Highlight strength"
                />
              </div>

              <div class="settings-preview" aria-hidden="true">
                <span class="lsOrth">Caesar</span>
                <span class="lsGrammar">noun</span>
                <span class="lsBibl">Gall. 1.1</span>
                <span class="lsQuote">omnia</span>
              </div>

              <div class="settings-divider" role="separator"></div>
            </div>

            <div class="settings-inflected-section">
              <div class="settings-section-title">Search Scope</div>
              <input type="hidden" name="o" value="0" />
              <label class="dict-item" title="Search conjugated verbs and declined nouns/adjectives">
                <input
                  type="checkbox"
                  name="o"
                  value="1"
                  id="toggle-inflected"
                  class="inflected-checkbox"
                  ${isInflected ? "checked" : ""}
                />
                <span class="dict-name">Latin inflected forms</span>
              </label>
              <p class="settings-caption">Match conjugated verbs and declined nouns/adjectives.</p>
            </div>

            <div class="settings-divider" role="separator"></div>

            <div class="settings-section-title">Enabled Dictionaries</div>
            <div class="dict-list">
              ${dictItemsHtml}
            </div>
            
            <div class="settings-noscript-actions" data-nojs-only>
              <button type="submit" name="${SAVE_PARAM}" value="1" class="btn btn-secondary settings-apply-btn">Apply Selection</button>
            </div>
          </div>
        </details>
      </morcus-dict-settings>
    `.trim()
    : "";

  // Save these is another `name="save"` submitter. It lives in the tray, after `.search-btn`, so
  // the Enter rule above still holds. Use mine is a plain link to the page without settings params.
  const borrowedChipHtml = options.borrowed
    ? `
          <span class="borrowed-chip" role="status">
            <span class="borrowed-chip-text">Not your saved settings</span>
            <button type="submit" name="${SAVE_PARAM}" value="1" class="borrowed-chip-btn borrowed-save-btn">Save these</button>
            <a class="borrowed-chip-btn borrowed-use-mine" href="${he.escape(
              options.borrowed.useMineHref
            )}">Use mine</a>
          </span>`
    : "";

  const trayHtml = includeSettings
    ? `
      <div class="search-tray">
        <div class="search-tray-left">
          <span class="tray-label">In</span>
          <div class="lang-chips">
            ${langChipsHtml}
          </div>
          <span class="tray-dot" aria-hidden="true">•</span>
          <span class="tray-label">Inflection</span>
          ${inflectChipHtml}${borrowedChipHtml}
        </div>
        <div class="search-tray-right">
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

  // The settings popover renders live `dict` checkboxes, which are the real form controls.
  // A static bitmask submitted alongside them can only ever be stale in No-JS mode, where nothing
  // updates it. When the popover is omitted the form has no other carrier of dictionary state,
  // so the hidden field is kept there.
  const dictStateInputHtml = includeSettings
    ? ""
    : `<input type="hidden" name="d" value="${he.escape(dictBitmask)}" />`;

  // `data-d` / `data-o` publish the selection the server resolved for this render. The client
  // adopts them (`readRenderedDictState`) instead of re-deriving state from the URL or storage.
  // `data-borrowed` / `data-scoped` tell it when *not* to save changes (`dict_preferences.client`).
  const persistenceAttrs =
    (options.borrowed ? " data-borrowed" : "") +
    (options.scoped ? " data-scoped" : "");
  return `
    <form class="search-form" action="${he.escape(
      options.action
    )}" method="GET" data-d="${he.escape(dictBitmask)}" data-o="${
    isInflected ? "1" : "0"
  }"${persistenceAttrs}>
      ${dictStateInputHtml}
      ${hiddenInputsHtml}
      <div class="input-wrapper">
        <input
          type="text"
          id="dict-q"
          name="q"
          class="input"
          value="${queryEscaped}"
          placeholder="${he.escape(placeholder)}"
          autocomplete="off"
          enterkeyhint="search"
        />
        <button
          type="submit"
          class="search-btn"
          aria-label="Search"
          title="Search"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="${SEARCH_PATH}"></path>
          </svg>
        </button>
        <morcus-dict-suggestions data-js-only data-input="dict-q"
          ><ul
            id="dict-suggestions-list"
            class="suggestions"
            role="listbox"
            hidden></ul
        ></morcus-dict-suggestions>
      </div>
      ${trayHtml}
    </form>
  `.trim();
}
