import * as he from "he";

export interface SearchBarOptions {
  query?: string;
  action: string;
  placeholder?: string;
  formClass?: string;
  inputClass?: string;
  includeSettings?: boolean;
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

  const settingsHtml = includeSettings
    ? "<morcus-dict-settings></morcus-dict-settings>"
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
