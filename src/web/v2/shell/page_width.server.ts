/**
 * Server-rendered page width `<select>`, shared by the reader Appearance
 * popover and the dictionary settings popover. The markup is rendered on the
 * server so the client bundle only has to bind a `change` listener
 * (see `core/page_width.client.ts`).
 *
 * The select has no `name`, so it is never submitted with the dictionary
 * search form it sits inside.
 */
const PAGE_WIDTH_OPTIONS: ReadonlyArray<[value: string, label: string]> = [
  ["narrow", "Narrow"],
  ["default", "Default"],
  ["wide", "Wide"],
  ["full", "Full"],
];

/**
 * @param labelClass matches the host popover's other labels: the reader's rows
 *   use `settings-label`; the dictionary's sections use `settings-section-title`.
 */
export function renderPageWidthSelect(
  id: string,
  ariaLabel: string,
  labelClass: "settings-label" | "settings-section-title" = "settings-label"
): string {
  const options = PAGE_WIDTH_OPTIONS.map(
    ([value, label]) =>
      `<option value="${value}"${
        value === "default" ? " selected" : ""
      }>${label}</option>`
  ).join("");
  return `<div class="settings-row">
            <label for="${id}" class="${labelClass}">Page Width</label>
            <select id="${id}" class="settings-select" aria-label="${ariaLabel}">${options}</select>
          </div>`;
}
