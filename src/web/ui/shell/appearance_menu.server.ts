import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";

interface Choice {
  value: string;
  label: string;
  /** Extra class for the option's label (e.g. to show it in its own font). */
  labelClass?: string;
  iconHtml?: string;
}

function renderSegmented(
  name: string,
  label: string,
  choices: Choice[],
  checked: string
): string {
  const options = choices
    .map(
      (c) => `<label class="segmented-option">
            <input type="radio" name="${name}" value="${c.value}"${
        c.value === checked ? " checked" : ""
      } />
            <span class="segmented-label${
              c.labelClass ? ` ${c.labelClass}` : ""
            }">${c.iconHtml ?? ""}${c.label}</span>
          </label>`
    )
    .join("\n          ");
  return `<div class="segmented" role="radiogroup" aria-label="${label}">
          ${options}
        </div>`;
}

const icon = (name: "monitor" | "sun" | "moon") =>
  renderIconSvg(name, { className: "segmented-icon" });

/**
 * The app-bar Appearance menu: theme, reading-text font, size and line
 * spacing, and dictionary highlight strength, all app-wide (see
 * `appearance.client.ts`). JS-only like every setting in it: they live in
 * localStorage, so without JS the icon is hidden and the defaults apply.
 *
 * Rendered with the defaults checked; the element adopts the saved values on
 * upgrade, before the panel can be opened.
 */
export function renderAppearanceMenu(): string {
  // A modal <dialog> (setupModalDialog, like the dictionary settings): its
  // backdrop takes outside clicks, so they neither go through to the page nor
  // get lost in an iframe, and Escape closes it natively.
  return `<morcus-appearance-menu data-js-only>
      <button
        type="button"
        class="theme-toggle-btn appearance-btn"
        id="appearance-btn"
        aria-label="Appearance"
        title="Appearance"
        aria-haspopup="dialog"
        aria-controls="appearance-popover"
        aria-expanded="false"
      >
        ${renderIconSvg("palette")}
      </button>
      <dialog
        class="anchored-popover appearance-popover"
        id="appearance-popover"
        aria-label="Appearance"
      >
        <div class="settings-popover-header">
          <h2 class="settings-popover-title">Appearance</h2>
          <button
            type="button"
            class="settings-popover-close"
            id="appearance-close-btn"
            aria-label="Close appearance settings"
            data-dialog-close
          >&times;</button>
        </div>
        <div class="settings-body">
          <div class="settings-group">
            <h3 class="settings-group-title">Theme</h3>
            ${renderSegmented(
              "appearance-theme",
              "Theme",
              [
                { value: "system", label: "System", iconHtml: icon("monitor") },
                { value: "light", label: "Light", iconHtml: icon("sun") },
                { value: "dark", label: "Dark", iconHtml: icon("moon") },
              ],
              "system"
            )}
          </div>
          <div class="settings-group">
            <h3 class="settings-group-title">Text font</h3>
            ${renderSegmented(
              "appearance-font",
              "Text font",
              [
                {
                  value: "sans",
                  label: "Sans",
                  labelClass: "font-sans-preview",
                },
                {
                  value: "serif",
                  label: "Serif",
                  labelClass: "font-serif-preview",
                },
              ],
              "sans"
            )}
          </div>
          <div class="settings-group">
            <h3 class="settings-group-title">Text size</h3>
            <div class="stepper appearance-stepper">
              <button type="button" class="stepper-btn" id="appearance-size-dec" aria-label="Decrease text size">A&minus;</button>
              <span class="stepper-val" id="appearance-size-label" aria-live="polite">100%</span>
              <button type="button" class="stepper-btn" id="appearance-size-inc" aria-label="Increase text size">A+</button>
            </div>
          </div>
          <div class="settings-group">
            <h3 class="settings-group-title">Line spacing</h3>
            ${renderSegmented(
              "appearance-spacing",
              "Line spacing",
              [
                { value: "compact", label: "Compact" },
                { value: "normal", label: "Normal" },
                { value: "relaxed", label: "Relaxed" },
              ],
              "normal"
            )}
          </div>
          <div class="settings-group">
            <div class="settings-header">
              <h3 class="settings-group-title">Highlight strength</h3>
              <span class="settings-value" id="appearance-highlight-value">50%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value="50"
              class="settings-slider"
              id="appearance-highlight"
              aria-label="Highlight strength"
            />
            <div class="settings-preview" aria-hidden="true">
              <span class="lsOrth">Caesar</span>
              <span class="lsGrammar">noun</span>
              <span class="lsBibl">Gall. 1.1</span>
              <span class="lsQuote">omnia</span>
            </div>
            <p class="settings-caption">Dictionary entry coloring. Turn it down if highlighted text is hard to read.</p>
          </div>
        </div>
        <div class="settings-popover-footer">
          <button type="button" class="btn btn-secondary settings-reset-btn" id="appearance-reset-btn">Reset to defaults</button>
        </div>
      </dialog>
    </morcus-appearance-menu>`;
}
