import { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import * as he from "he";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import { DEFAULT_PANEL_SCALE } from "@/web/ui/reader/reader_scale.common";
import { ssr } from "@/web/ui/core/server/ssr_template.server";

/**
 * Returns the scholarly license and provenance notice for the classical work.
 */
function getAttributionNoticeHtml(attribution?: string): string {
  switch (attribution) {
    case "hypotactic":
      return `<p class="reader-about-attribution">The raw text was provided by David Chamberlain of <a href="https://hypotactic.com" target="_blank" rel="noopener noreferrer">https://hypotactic.com</a> under the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA-4.0</a> license.</p>`;
    case "publicDomain":
      return `<p class="reader-about-attribution">The raw text is in the public domain.</p>`;
    case "perseus":
    default:
      return `<p class="reader-about-attribution">The raw text was provided by the Perseus Digital Library and was accessed originally from <a href="https://github.com/PerseusDL/canonical-latinLit" target="_blank" rel="noopener noreferrer">https://github.com/PerseusDL/canonical-latinLit</a>. It is provided under Perseus&#39; conditions of the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA-4.0</a> license, and you must offer Perseus any modifications you make.</p>`;
  }
}

/**
 * Renders the scholarly attribution and work metadata colophon detailing authors,
 * critical editors, funding, sponsors, CTS URN / work ID, source links, and license.
 * Rendered into the companion panel's About view, which hides the summary, so
 * the <details> is always open.
 */
export function renderReaderAboutSection(work: V2PreprocessedWork): string {
  const sources =
    work.sourceRef && work.sourceRef.length > 0
      ? work.sourceRef
      : work.sourceRepo
      ? [work.sourceRepo]
      : [];

  const sourcesHtml =
    sources.length > 0
      ? ssr`<div class="meta-row">
              <dt>Source(s)</dt>
              <dd>${sources
                .map((url) => {
                  const isHttp =
                    url.startsWith("http://") ||
                    url.startsWith("https://") ||
                    url.startsWith("/");
                  return isHttp
                    ? `<a href="${he.escape(
                        url
                      )}" target="_blank" rel="noopener noreferrer">Link</a>`
                    : he.escape(url);
                })
                .join(", ")}</dd>
             </div>`
      : "";

  const attributionHtml = getAttributionNoticeHtml(work.attribution);

  return ssr`<details class="reader-work-about" id="reader-work-about" open>
        <summary class="reader-about-summary">About this text</summary>
        <div class="reader-about-card">
          <dl class="reader-meta-list">
            <div class="meta-row">
              <dt>Author</dt>
              <dd>${he.escape(work.author)}</dd>
            </div>
            ${
              work.editor
                ? ssr`<div class="meta-row">
                    <dt>Editor</dt>
                    <dd>${he.escape(work.editor)}</dd>
                   </div>`
                : ""
            }
            ${
              work.translator
                ? ssr`<div class="meta-row">
                    <dt>Translator</dt>
                    <dd>${he.escape(work.translator)}</dd>
                   </div>`
                : ""
            }
            ${
              work.funder
                ? ssr`<div class="meta-row">
                    <dt>Funder</dt>
                    <dd>${he.escape(work.funder)}</dd>
                   </div>`
                : ""
            }
            ${
              work.sponsor
                ? ssr`<div class="meta-row">
                    <dt>Sponsor</dt>
                    <dd>${he.escape(work.sponsor)}</dd>
                   </div>`
                : ""
            }
            <div class="meta-row">
              <dt>ID</dt>
              <dd><code>${he.escape(work.ctsUrn || work.id)}</code></dd>
            </div>
            ${sourcesHtml}
          </dl>
          ${attributionHtml}
        </div>
      </details>`;
}

interface ReaderSettingsPopoverOptions {
  hasMacra?: boolean;
}

/**
 * Renders the reader display settings: a modal `<dialog>` (JS-only, like its
 * trigger) anchored under the trigger by <morcus-reader-settings>.
 * When hasMacra is false (e.g. for unmacronized editions), the macra toggle is omitted from the DOM.
 */
export function renderReaderSettingsPopover(
  options: ReaderSettingsPopoverOptions = {}
): string {
  const hasMacra = options.hasMacra ?? true;
  // App-wide text appearance lives in the app-bar Appearance menu, so this
  // only links to it. The Side Panel size is reader-only: it applies to every
  // tab, relative to the global text size. Touch Navigation (swipe page turns)
  // is hidden without a touchscreen by reader_page_nav.css.
  return ssr`<morcus-reader-settings>
        <dialog class="anchored-popover reader-settings-popover"
                id="reader-settings-popover"
                aria-label="Reader settings">
          <div class="settings-popover-header">
            <h2 class="settings-popover-title">Reader settings</h2>
            <button type="button"
                    class="settings-popover-close"
                    id="reader-settings-close-btn"
                    data-dialog-close
                    aria-label="Close reader settings">${renderIconSvg(
                      "close",
                      { className: "dialog-close-icon", width: 18, height: 18 }
                    )}</button>
          </div>

          <div class="settings-body">
            
            <button type="button" class="appearance-link" id="reader-appearance-link">
              <span>Text appearance<span class="appearance-link-hint">Font, size, spacing, theme</span></span>
              ${renderIconSvg("palette")}
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
              ${
                hasMacra
                  ? ssr`<label class="settings-toggle-row">
                <span class="settings-label">Show Macra (vowel length markings: &amacr;, &emacr;, &imacr;, &omacr;, &umacr;)</span>
                <input type="checkbox" id="toggle-macra" class="toggle-checkbox" checked>
              </label>`
                  : ""
              }

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
