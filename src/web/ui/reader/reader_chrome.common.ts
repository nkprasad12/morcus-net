/**
 * Browser-safe markup for the reader chrome that every reader shares: the
 * sticky bar's `Aa` button (`#reader-settings-btn`), the reader settings
 * dialog it opens (`#reader-settings-popover`), and the passage heading with
 * its copy-permalink link (`a.reader-heading-link`).
 *
 * Shared by the server-rendered readers (`reader.server.ts`,
 * `reader_dialogs.server.ts` and `external/external.server.ts`) and the
 * client-rendered Open Texts reader
 * (`open_texts/open_text_view_adapter.client.ts`), so `<morcus-reader-settings>`
 * and `<morcus-reader-view>` enhance all of them the same way.
 *
 * Like `reader_toc.common.ts`, this reaches the client bundle, so it must not
 * import `he`, `renderIconSvg` / `ICON_PATHS`, or any `.server.ts` module.
 * Escaping uses `escapeTocText` (byte-identical to `he.escape`) and the icons
 * are drawn exactly as `renderIconSvg` draws them, so the server's output is
 * unchanged (`reader_chrome.test.ts` pins both).
 *
 * The palette and check paths are copied from `ICON_PATHS` rather than
 * exported from `icons.common.ts` as standalone consts: that module is in
 * `common.js`, so every page would ship them, while only the readers'
 * chunks need them here.
 */

import { html, raw, type SafeHtml } from "@/web/ui/core/dom/html.common";
import { ICON_CLOSE, ICON_LINK } from "@/web/ui/core/widgets/icons.common";
import { DEFAULT_PANEL_SCALE } from "@/web/ui/reader/reader_scale.common";
import { escapeTocText } from "@/web/ui/reader/reader_toc.common";

/** `ICON_PATHS.palette` (Material "palette"). */
const PALETTE_PATH =
  "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z";
/** `ICON_PATHS.check`. */
const CHECK_PATH = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";

// Drawn exactly as `renderIconSvg("close", ...)` / `renderIconSvg("palette")`
// and `renderCopyPillIconsHtml()`.
// prettier-ignore
const SETTINGS_CLOSE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" class="dialog-close-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_CLOSE}"></path></svg>`;
const PALETTE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PALETTE_PATH}"></path></svg>`;
// prettier-ignore
const COPY_PILL_ICONS = `<span class="copy-pill-icon" aria-hidden="true"><svg viewBox="0 0 24 24" class="copy-pill-glyph copy-pill-link" aria-hidden="true"><path d="${ICON_LINK}"></path></svg><svg viewBox="0 0 24 24" class="copy-pill-glyph copy-pill-check" aria-hidden="true"><path d="${CHECK_PATH}"></path></svg></span>`;

/**
 * The `Aa` trigger for the reader settings dialog. `MorcusReaderSettings` finds it
 * by id, so every reader bar must render this exact button.
 */
export function renderReaderSettingsButtonHtml(): SafeHtml {
  // Not prettier-formatted: the server's markup has to stay as it was. Only
  // the indentation is free, as `html` turns each line break and the
  // whitespace around it into one `\n`.
  // prettier-ignore
  return html`<button type="button"
      class="reader-btn reader-settings-btn"
      id="reader-settings-btn"
      data-js-only
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-controls="reader-settings-popover"
      aria-label="Appearance &amp; Typography"
      title="Appearance &amp; Typography">
    <span class="settings-glyph" aria-hidden="true">Aa</span>
  </button>`;
}

/**
 * Renders the passage `<h1>` heading. When `href` is supplied (library works,
 * URL-backed external texts and Open Texts), the heading text is wrapped in a
 * permalink anchor (`a.reader-heading-link`) that copies the page link on
 * click (`<morcus-reader-view>`).
 */
export function renderReaderHeadingHtml(
  title: string,
  href?: string
): SafeHtml {
  const escapedTitle = escapeTocText(title);
  if (!href) {
    // prettier-ignore
    return html`<h1 class="reader-passage-heading" aria-live="polite">${raw(escapedTitle)}</h1>`;
  }
  // One line, as the server has always rendered it.
  // prettier-ignore
  return html`<h1 class="reader-passage-heading" aria-live="polite"><a href="${raw(escapeTocText(href))}" class="reader-heading-link" title="Copy link to this page" aria-label="${raw(escapedTitle)} (copy link to this page)">${raw(escapedTitle)}${raw(COPY_PILL_ICONS)}</a></h1>`;
}

export interface ReaderSettingsPopoverOptions {
  /** Shows the macra toggle; false for editions without macra. */
  hasMacra?: boolean;
}

/**
 * Renders the reader display settings: a modal `<dialog>` (JS-only, like its
 * trigger) anchored under the trigger by <morcus-reader-settings>.
 * When hasMacra is false (e.g. for unmacronized editions), the macra toggle is omitted from the DOM.
 *
 * It must sit inside `<morcus-reader-view>`, which listens for the dialog's
 * `reader-settings-change` events and finds it for the `A` shortcut.
 */
export function renderReaderSettingsPopoverHtml(
  options: ReaderSettingsPopoverOptions = {}
): SafeHtml {
  const hasMacra = options.hasMacra ?? true;
  // prettier-ignore
  const macraToggle = hasMacra
    ? html`<label class="settings-toggle-row">
        <span class="settings-label">Show Macra (vowel length markings: &amacr;, &emacr;, &imacr;, &omacr;, &umacr;)</span>
        <input type="checkbox" id="toggle-macra" class="toggle-checkbox" checked>
      </label>`
    : "";
  // App-wide text appearance lives in the app-bar Appearance menu, so this
  // only links to it. The Side Panel size is reader-only: it applies to every
  // tab, relative to the global text size. Touch Navigation (swipe page turns)
  // is hidden without a touchscreen by reader_page_nav.css.
  // prettier-ignore
  return html`<morcus-reader-settings>
  <dialog class="anchored-popover reader-settings-popover"
      id="reader-settings-popover"
      aria-label="Reader settings">
    <div class="settings-popover-header">
      <h2 class="settings-popover-title">Reader settings</h2>
      <button type="button"
          class="settings-popover-close"
          id="reader-settings-close-btn"
          data-dialog-close
          aria-label="Close reader settings">${raw(SETTINGS_CLOSE_ICON)}</button>
    </div>

    <div class="settings-body">

      <button type="button" class="appearance-link" id="reader-appearance-link">
        <span>Text appearance<span class="appearance-link-hint">Font, size, spacing, contrast, theme</span></span>
        ${raw(PALETTE_ICON)}
      </button>

      <div class="settings-group">
        <h3 class="settings-group-title">Side Panel</h3>
        <div class="settings-row">
          <span class="settings-label">Text Size<span class="settings-hint">Relative to your text size</span></span>
          <div class="stepper">
            <button type="button" class="stepper-btn" id="dict-size-dec" aria-label="Decrease side panel text size">A&minus;</button>
            <span class="stepper-val" id="dict-size-label">${DEFAULT_PANEL_SCALE}%</span>
            <button type="button" class="stepper-btn" id="dict-size-inc" aria-label="Increase side panel text size">A+</button>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h3 class="settings-group-title">Textual Aids</h3>
        ${raw(macraToggle)}

        <label class="settings-toggle-row">
          <span class="settings-label">Show Section Numbers (&sect;)</span>
          <input type="checkbox" id="toggle-gutter" class="toggle-checkbox" checked>
        </label>
      </div>

      <div class="settings-group settings-touch-nav">
        <h3 class="settings-group-title">Touch Navigation</h3>
        <label class="settings-toggle-row">
          <span class="settings-label">Swipe to turn pages</span>
          <input type="checkbox" id="toggle-swipe-nav" class="toggle-checkbox" checked>
        </label>
      </div>

    </div>

    <div class="settings-popover-footer">
      <button type="button" class="btn btn-secondary settings-reset-btn" id="reader-settings-reset-btn">Reset Defaults</button>
    </div>
  </dialog>
</morcus-reader-settings>`;
}
