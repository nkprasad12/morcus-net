import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";

interface Choice {
  value: string;
  label: string;
  /** Extra class for the option's label (e.g. to show it in its own font). */
  labelClass?: string;
}

/** `name` is a radio group name; `labelAttr` its `aria-label(ledby)` attribute. */
function renderSegmented(
  name: string,
  labelAttr: string,
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
            }">${c.label}</span>
          </label>`
    )
    .join("\n          ");
  return `<div class="segmented" role="radiogroup" ${labelAttr}>
          ${options}
        </div>`;
}

/** One compact settings row: the label beside its control. */
function row(key: string, label: string, controlHtml: string): string {
  return `<div class="appearance-row">
            <span class="appearance-row-label" id="appearance-${key}-label">${label}</span>
            ${controlHtml}
          </div>`;
}

/**
 * The app-bar Appearance menu: the theme and the reading text's font, size
 * and line spacing, all app-wide (see
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
          >${renderIconSvg("close", {
            className: "dialog-close-icon",
            width: 18,
            height: 18,
          })}</button>
        </div>
        <div class="settings-body">
          ${row(
            "theme",
            "Theme",
            renderSegmented(
              "appearance-theme",
              'aria-labelledby="appearance-theme-label"',
              [
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ],
              "system"
            )
          )}
          <div class="settings-group">
            <h3 class="settings-group-title">Reading text</h3>
            ${row(
              "font",
              "Font",
              renderSegmented(
                "appearance-font",
                'aria-labelledby="appearance-font-label"',
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
              )
            )}
            ${row(
              // Not "size": `#appearance-size-label` is the stepper's value.
              "size-row",
              "Size",
              `<div class="stepper appearance-stepper" role="group" aria-labelledby="appearance-size-row-label">
                <button type="button" class="stepper-btn" id="appearance-size-dec" aria-label="Decrease text size">A&minus;</button>
                <span class="stepper-val" id="appearance-size-label" aria-live="polite">100%</span>
                <button type="button" class="stepper-btn" id="appearance-size-inc" aria-label="Increase text size">A+</button>
              </div>`
            )}
            ${row(
              "spacing",
              "Spacing",
              renderSegmented(
                "appearance-spacing",
                // The row says "Spacing" to fit; the group gets the full name.
                'aria-label="Line spacing"',
                [
                  { value: "compact", label: "Compact" },
                  { value: "normal", label: "Normal" },
                  { value: "relaxed", label: "Relaxed" },
                ],
                "normal"
              )
            )}
            <!-- Styled by the same custom properties as reading text, so it
                 previews every change live with no script. Last, so the
                 controls above it don't move as it grows. -->
            <p class="appearance-sample" lang="la">Gallia est omnis dīvīsa in partēs trēs, quārum ūnam incolunt Belgae.</p>
          </div>
        </div>
        <div class="settings-popover-footer">
          <button type="button" class="btn btn-secondary settings-reset-btn" id="appearance-reset-btn">Reset to defaults</button>
        </div>
      </dialog>
    </morcus-appearance-menu>`;
}
