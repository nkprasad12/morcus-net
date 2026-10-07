import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { encodeDictBitmask } from "@/web/v2/dict/dict_bitmask.common";
import {
  DEFAULT_DICT_KEYS,
  SAVE_PARAM,
  filterDictsByLang,
} from "@/web/v2/dict/dict_selection.common";
import { escapeHtml } from "@/web/v2/core/html.common";
import { ICON_PATHS } from "@/web/v2/core/icons.common";
import { renderDialog } from "@/web/v2/dialog/dialog.server";

import {
  DICT_SETTINGS_DIALOG_ID,
  DICT_SETTINGS_TRIGGER_ID,
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
  /**
   * View state carried by **both** forms (search and settings) as hidden inputs, so a No-JS
   * submit keeps it. An array emits one input per value; `undefined` emits nothing.
   */
  extraHiddenInputs?: Record<string, string | readonly string[] | undefined>;
  /**
   * Guest mode: the page shows a link's settings, which differ from the user's saved ones
   * (`isGuestView`). The settings are read-only and the tray offers a way back; `returnHref` is
   * the same page without settings params.
   */
  guest?: { returnHref: string };
  /**
   * A scoped view (reader iframe, `lang=` filter) shows a lookup-specific inflection (the reader
   * forces `o=1`), so the dialog omits the inflection toggle and saving never writes it. Saving
   * the dictionaries still works; see `lang`.
   */
  scoped?: boolean;
  /**
   * The view's `lang=` scope (the reader's dictionary sends `lang=La`). It narrows what each form
   * submits:
   *
   * - **Settings form**: shows only the dictionaries in scope (`filterDictsByLang`) and carries
   *   `lang` as a hidden input, so a save merges just those into the saved preference
   *   (`mergeDictKeysForSave`).
   * - **Search form**: carries neither `lang` nor `d`. A typed word may be English or German, so
   *   the search leaves the scope and the server uses the user's saved dictionaries in full. (A
   *   narrowed `d` without its `lang` would also offer, and save, every dictionary as if it were
   *   the whole selection.) The JS client does the same (`applyUnscopedDictSearch`).
   */
  lang?: string | readonly string[];
}

function hiddenInput(name: string, value: string): string {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(
    value
  )}" />`;
}

function hiddenInputs(
  entries: Record<string, string | readonly string[] | undefined>
): string {
  return Object.entries(entries)
    .flatMap(([name, value]) =>
      value === undefined
        ? []
        : (typeof value === "string" ? [value] : value).map((v) =>
            hiddenInput(name, v)
          )
    )
    .join("\n");
}

/**
 * Shared search bar component: the two-tier search card (input, search button, status tray) plus
 * the dictionary settings dialog.
 *
 * The settings live in a `<dialog>` with **their own form**, outside the search form. A search
 * therefore can't carry a settings change the user hasn't committed; instead the search form
 * carries the rendered view's settings as hidden `d` / `o` fields, so a new search keeps what's
 * on screen. Without JS the dialog opens via `#dict-settings` (`:target`) and **Done** submits
 * it; with JS, `<morcus-dict-settings>` opens it with `showModal()` and applies on close.
 */
export function renderDictSearchBar(options: SearchBarOptions): string {
  const query = options.query?.trim() ?? "";
  const queryEscaped = query ? escapeHtml(query) : "";
  const placeholder = options.placeholder ?? "Search for a word";
  const includeSettings = options.includeSettings ?? true;
  const isInflected = options.isInflected !== false; // default true

  const activeDictList = options.activeDicts ?? DEFAULT_DICT_KEYS;
  const activeDictKeys = new Set(activeDictList);
  const dictBitmask = encodeDictBitmask(activeDictList);

  const activeLangs = computeActiveLanguages(activeDictKeys);
  const langChipsHtml = renderLangChipsHtml(activeLangs);
  const inflectChipHtml = renderInflectChipHtml(isInflected);

  const extraHiddenInputsHtml = hiddenInputs(options.extraHiddenInputs ?? {});
  const langs =
    typeof options.lang === "string" ? [options.lang] : options.lang ?? [];
  const isLangScoped = langs.length > 0;

  // Guest mode locks the content settings; the way out is a plain link, so it works without JS.
  const guest = options.guest;
  const disabledAttr = guest ? "disabled" : "";
  const returnLinkHtml = guest
    ? `<a class="guest-return" href="${escapeHtml(
        guest.returnHref
      )}">Restore saved</a>`
    : "";

  const settingsDialogHtml = includeSettings
    ? renderSettingsDialog({
        action: options.action,
        query,
        extraHiddenInputsHtml: [
          extraHiddenInputsHtml,
          hiddenInputs({ lang: options.lang }),
        ]
          .filter(Boolean)
          .join("\n"),
        activeDictKeys,
        isInflected,
        disabledAttr,
        returnLinkHtml,
        isGuest: guest !== undefined,
        isScoped: options.scoped === true,
        lang: options.lang,
      })
    : "";

  const guestChipHtml = guest
    ? `
          <span class="tray-dot guest-tray-dot" aria-hidden="true">•</span>
          <span class="guest-chip" role="status">
            <span class="guest-chip-text">Using link settings</span>
            <span class="tray-dot" aria-hidden="true">·</span>
            ${returnLinkHtml}
          </span>`
    : "";

  // Without JS the trigger is a hash link that opens the dialog via `:target`; with JS,
  // `<morcus-dict-settings>` intercepts it and calls `showModal()`.
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
          ${inflectChipHtml}${guestChipHtml}
        </div>
        <div class="search-tray-right">
          <a
            href="#${DICT_SETTINGS_DIALOG_ID}"
            id="${DICT_SETTINGS_TRIGGER_ID}"
            class="settings-btn"
            role="button"
            aria-haspopup="dialog"
            aria-controls="${DICT_SETTINGS_DIALOG_ID}"
            aria-expanded="false"
            aria-label="Dictionary and highlight settings"
            title="Dictionary and highlight settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="${TUNE_PATH}"></path>
            </svg>
          </a>
        </div>
      </div>
    `.trim()
    : "";

  // `data-d` / `data-o` publish the selection the server resolved for this render. The client
  // adopts them (`readRenderedDictState`) instead of re-deriving state from the URL or storage.
  // A `lang=` view's search leaves the scope, so it submits no `d` (see `SearchBarOptions.lang`).
  return `
    <form class="search-form" action="${escapeHtml(
      options.action
    )}" method="GET" data-d="${escapeHtml(dictBitmask)}" data-o="${
    isInflected ? "1" : "0"
  }">
      ${isLangScoped ? "" : hiddenInput("d", dictBitmask)}
      ${hiddenInput("o", isInflected ? "1" : "0")}
      ${extraHiddenInputsHtml}
      <div class="input-wrapper">
        <input
          type="text"
          id="dict-q"
          name="q"
          class="input"
          value="${queryEscaped}"
          placeholder="${escapeHtml(placeholder)}"
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
    ${settingsDialogHtml}
  `.trim();
}

interface SettingsDialogInput {
  action: string;
  query: string;
  extraHiddenInputsHtml: string;
  activeDictKeys: Set<string>;
  isInflected: boolean;
  disabledAttr: string;
  returnLinkHtml: string;
  isGuest: boolean;
  isScoped: boolean;
  lang?: string | readonly string[];
}

function renderSettingsDialog(input: SettingsDialogInput): string {
  // Only the dictionaries this view's `lang=` scope can query: an out-of-scope checkbox would
  // show unchecked whatever was saved, and ticking it would have no effect here.
  const dictItemsHtml = filterDictsByLang(LatinDict.AVAILABLE, input.lang)
    .map((d) => {
      const isChecked = input.activeDictKeys.has(d.key);
      const langText = `${d.languages.from} \u2192 ${d.languages.to}`;
      return `
      <label class="dict-item" title="${escapeHtml(
        d.displayName
      )} (${langText})">
        <input
          type="checkbox"
          name="dict"
          value="${escapeHtml(d.key)}"
          class="dict-checkbox"
          data-key="${escapeHtml(d.key)}"
          ${isChecked ? "checked" : ""}
          ${input.disabledAttr}
        />
        <span class="dict-name">${escapeHtml(d.displayName)}</span>
        <span class="dict-lang">${langText}</span>
      </label>
    `;
    })
    .join("\n");

  // Done commits. Without JS it submits this form: `save=1` makes the server store the settings
  // and 303 back (`dict_persistence.server.ts`). With JS, `<morcus-dict-settings>` intercepts it
  // and closes the dialog, which applies. In guest mode there's nothing to commit, so Done only
  // closes.
  const doneHtml = input.isGuest
    ? `<a href="#" class="btn btn-primary dict-settings-done" role="button" data-dialog-close>Done</a>`
    : `<button type="submit" name="${SAVE_PARAM}" value="1" class="btn btn-primary dict-settings-done">Done</button>`;

  // A scoped view's inflection belongs to the lookup (the reader forces `o=1`), so there's no
  // toggle; the hidden input keeps it through a No-JS save and its redirect.
  const inflectedSectionHtml = input.isScoped
    ? input.isGuest
      ? ""
      : hiddenInput("o", input.isInflected ? "1" : "0")
    : `
      <div class="settings-inflected-section">
        <div class="settings-section-title">Search Scope</div>
        ${input.isGuest ? "" : hiddenInput("o", "0")}
        <label class="dict-item" title="Search conjugated verbs and declined nouns/adjectives">
          <input
            type="checkbox"
            name="o"
            value="1"
            id="toggle-inflected"
            class="inflected-checkbox"
            ${input.isInflected ? "checked" : ""}
            ${input.disabledAttr}
          />
          <span class="dict-name">Latin inflected forms</span>
        </label>
        <p class="settings-caption">Match conjugated verbs and declined nouns/adjectives.</p>
      </div>

      <div class="settings-divider" role="separator"></div>
    `;

  const bodyHtml = `
    <form class="dict-settings-form" action="${escapeHtml(
      input.action
    )}" method="GET">
      ${input.query ? hiddenInput("q", input.query) : ""}
      ${input.extraHiddenInputsHtml}
      ${
        input.isGuest
          ? `<p class="settings-guest-note">Using this link's settings (read-only). ${input.returnLinkHtml} to change them.</p>`
          : ""
      }
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

      ${inflectedSectionHtml}

      <div class="settings-section-title">Enabled Dictionaries</div>
      <div class="dict-list">
        ${dictItemsHtml}
      </div>

      <div class="dialog-actions">${doneHtml}</div>
    </form>
  `;

  return `<morcus-dict-settings>${renderDialog({
    id: DICT_SETTINGS_DIALOG_ID,
    title: "Dictionary settings",
    bodyHtml,
    customClass: "dict-settings-dialog",
    jsOnlyCloseButton: true,
  })}</morcus-dict-settings>`;
}
