import { V2PreprocessedWork } from "@/common/library/v2/v2_types";
import * as he from "he";

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
 * Rendered as a collapsed <details> in document flow for No-JS, and adopted into
 * the companion panel by JS.
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
      ? `<div class="meta-row">
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

  return `      <!-- Scholarly Attribution & Work Metadata -->
      <details class="reader-work-about" id="reader-work-about">
        <summary class="reader-about-summary">About this text</summary>
        <div class="reader-about-card">
          <dl class="reader-meta-list">
            <div class="meta-row">
              <dt>Author</dt>
              <dd>${he.escape(work.author)}</dd>
            </div>
            ${
              work.editor
                ? `<div class="meta-row">
                    <dt>Editor</dt>
                    <dd>${he.escape(work.editor)}</dd>
                   </div>`
                : ""
            }
            ${
              work.translator
                ? `<div class="meta-row">
                    <dt>Translator</dt>
                    <dd>${he.escape(work.translator)}</dd>
                   </div>`
                : ""
            }
            ${
              work.funder
                ? `<div class="meta-row">
                    <dt>Funder</dt>
                    <dd>${he.escape(work.funder)}</dd>
                   </div>`
                : ""
            }
            ${
              work.sponsor
                ? `<div class="meta-row">
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

/**
 * @deprecated Use renderReaderAboutSection instead. Retained for backward compatibility.
 */
export function renderBiblioDialog(work: V2PreprocessedWork): string {
  return renderReaderAboutSection(work);
}

export interface ReaderSettingsDialogOptions {
  hasMacra?: boolean;
}

/**
 * Renders the reader typography and display settings dialog, hydrated by <morcus-reader-settings>.
 * When hasMacra is false (e.g. for unmacronized editions), the macra toggle is omitted from the DOM.
 */
export function renderReaderSettingsDialog(
  options: ReaderSettingsDialogOptions = {}
): string {
  const hasMacra = options.hasMacra ?? true;
  return `      <!-- Reader Appearance & Settings Dialog -->
      <morcus-reader-settings>
        <dialog class="dialog reader-settings-dialog" id="reader-settings-dialog">
          <div class="dialog-card settings-card">
            <div class="dialog-header">
              <div>
                <h2 class="dialog-title">Reader Settings</h2>
                <p class="dialog-subtitle">Typography &amp; display preferences</p>
              </div>
              <button type="button" class="dialog-close-btn" id="reader-settings-close-btn" aria-label="Close settings" data-dialog-close>&times;</button>
            </div>

            <div class="settings-body">
              
              <!-- Font Size Scaling Group -->
              <div class="settings-group">
                <h3 class="settings-group-title">Text Size</h3>
                <div class="settings-row">
                  <span class="settings-label">Reading Canvas</span>
                  <div class="stepper">
                    <button type="button" class="stepper-btn" id="reader-size-dec" aria-label="Decrease reading text size">A&minus;</button>
                    <span class="stepper-val" id="reader-size-label">100%</span>
                    <button type="button" class="stepper-btn" id="reader-size-inc" aria-label="Increase reading text size">A+</button>
                  </div>
                </div>

                <div class="settings-row">
                  <span class="settings-label">Dictionary Sidebar</span>
                  <div class="stepper">
                    <button type="button" class="stepper-btn" id="dict-size-dec" aria-label="Decrease dictionary text size">A&minus;</button>
                    <span class="stepper-val" id="dict-size-label">100%</span>
                    <button type="button" class="stepper-btn" id="dict-size-inc" aria-label="Increase dictionary text size">A+</button>
                  </div>
                </div>
              </div>

              <!-- Scholarly & Textual Aids -->
              <div class="settings-group">
                <h3 class="settings-group-title">Scholarly &amp; Textual Aids</h3>
                ${
                  hasMacra
                    ? `<label class="settings-toggle-row">
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

              <!-- Typography Style -->
              <div class="settings-group">
                <h3 class="settings-group-title">Typography</h3>
                <div class="settings-row">
                  <span class="settings-label">Font Family</span>
                  <select id="font-select" class="settings-select" aria-label="Select font style">
                    <option value="serif" selected>Classical Serif</option>
                    <option value="sans">Modern Sans-Serif</option>
                  </select>
                </div>

                <div class="settings-row">
                  <span class="settings-label">Line Spacing</span>
                  <select id="line-height-select" class="settings-select" aria-label="Select line spacing">
                    <option value="compact">Compact</option>
                    <option value="normal" selected>Normal</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </div>
              </div>

            </div>

            <div class="dialog-actions settings-actions">
              <button type="button" class="btn btn-secondary" id="reader-settings-reset-btn">Reset Defaults</button>
              <button type="button" class="btn btn-primary" id="reader-settings-done-btn" data-dialog-close>Done</button>
            </div>
          </div>
        </dialog>
      </morcus-reader-settings>`;
}
