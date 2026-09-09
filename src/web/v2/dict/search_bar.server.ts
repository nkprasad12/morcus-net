import * as he from "he";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { DEFAULT_DICT_KEYS } from "@/web/v2/dict/dict_selection.server";

// Material Design "tune" / sliders SVG icon
const TUNE_PATH =
  "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z";

export interface SearchBarOptions {
  query?: string;
  action: string;
  placeholder?: string;
  formClass?: string;
  inputClass?: string;
  includeSettings?: boolean;
  activeDicts?: string[];
  extraHiddenInputs?: Record<string, string>;
}

/**
 * Shared search bar component rendering the search form, text input,
 * submit button with magnifying glass SVG, and settings web component.
 */
export function renderDictSearchBar(options: SearchBarOptions): string {
  const query = options.query?.trim() ?? "";
  const queryEscaped = query ? he.escape(query) : "";
  const placeholder =
    options.placeholder ??
    "Search for a word (e.g. equōrum, equus, horse, cheval, Pferd)...";
  const formClasses = ["v2-search-form", options.formClass]
    .filter(Boolean)
    .join(" ");
  const inputClasses = ["v2-input", options.inputClass]
    .filter(Boolean)
    .join(" ");
  const includeSettings = options.includeSettings ?? true;

  const activeDictKeys = new Set(options.activeDicts ?? DEFAULT_DICT_KEYS);

  const dictItemsHtml = LatinDict.AVAILABLE.map((d) => {
    const isChecked = activeDictKeys.has(d.key);
    const langText = `${d.languages.from} \u2192 ${d.languages.to}`;
    return `
      <label class="v2-dict-item" title="${he.encode(d.displayName)} (${langText})">
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

  const hiddenInputsHtml = options.extraHiddenInputs
    ? Object.entries(options.extraHiddenInputs)
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${he.escape(k)}" value="${he.escape(v)}">`
        )
        .join("\n")
    : "";

  return `
    <form class="${formClasses}" action="${he.escape(
    options.action
  )}" method="GET">
      ${hiddenInputsHtml}
      <div class="v2-input-wrapper">
        <input
          type="text"
          name="q"
          class="${inputClasses}"
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
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
          </svg>
        </button>
      </div>
      ${settingsHtml}
    </form>
  `.trim();
}
