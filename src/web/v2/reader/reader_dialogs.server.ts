import { V2PreprocessedWork } from "@/common/library/v2/v2_types";
import * as he from "he";

/**
 * Renders the bibliographical metadata modal dialog detailing scholarly editions,
 * CTS URNs, structural hierarchy, and source provenance for a classical work.
 */
export function renderBiblioDialog(work: V2PreprocessedWork): string {
  return `      <!-- Bibliographical Metadata Dialog -->
      <dialog class="v2-dialog v2-reader-biblio-dialog" id="v2-reader-biblio-dialog">
        <div class="v2-dialog-card">
          <div class="v2-dialog-header">
            <div>
              <h2 class="v2-dialog-title">${he.escape(work.title)}</h2>
              <p class="v2-dialog-subtitle">Scholarly editions &amp; CTS citation</p>
            </div>
            <button type="button" class="v2-dialog-close-btn" id="v2-reader-biblio-close-btn" data-dialog-close>&times;</button>
          </div>

          <dl class="v2-reader-meta-list">
            <div class="v2-meta-row">
              <dt>Author</dt>
              <dd>${he.escape(work.author)}</dd>
            </div>
            <div class="v2-meta-row">
              <dt>Structural Hierarchy</dt>
              <dd><code>[${work.textParts
                .map((p) => `"${p}"`)
                .join(", ")}]</code></dd>
            </div>
            ${
              work.editor
                ? `<div class="v2-meta-row">
                    <dt>Critical Edition</dt>
                    <dd>${he.escape(work.editor)}</dd>
                   </div>`
                : ""
            }
            ${
              work.translator
                ? `<div class="v2-meta-row">
                    <dt>English Translation</dt>
                    <dd>${he.escape(work.translator)}</dd>
                   </div>`
                : ""
            }
            ${
              work.ctsUrn
                ? `<div class="v2-meta-row">
                    <dt>CTS URN</dt>
                    <dd><code>${he.escape(work.ctsUrn)}</code></dd>
                   </div>`
                : ""
            }
            ${
              work.license
                ? `<div class="v2-meta-row">
                    <dt>License</dt>
                    <dd>${he.escape(work.license)}</dd>
                   </div>`
                : ""
            }
            ${
              work.sourceRepo
                ? `<div class="v2-meta-row">
                    <dt>Source Repository</dt>
                    <dd><a href="${he.escape(
                      work.sourceRepo
                    )}" target="_blank" rel="noopener noreferrer">${he.escape(
                    work.sourceRepo
                  )}</a></dd>
                   </div>`
                : ""
            }
          </dl>

          <div class="v2-dialog-actions">
            <button type="button" class="v2-btn v2-btn-primary" id="v2-reader-biblio-ok-btn" data-dialog-close>Close</button>
          </div>
        </div>
      </dialog>`;
}

/**
 * Renders the reader typography and display settings dialog, hydrated by <morcus-reader-settings>.
 */
export function renderReaderSettingsDialog(): string {
  return `      <!-- Reader Appearance & Settings Dialog -->
      <morcus-reader-settings>
        <dialog class="v2-dialog v2-reader-settings-dialog" id="v2-reader-settings-dialog">
          <div class="v2-dialog-card v2-settings-card">
            <div class="v2-dialog-header">
              <div>
                <h2 class="v2-dialog-title">Reader Settings</h2>
                <p class="v2-dialog-subtitle">Typography &amp; display preferences</p>
              </div>
              <button type="button" class="v2-dialog-close-btn" id="v2-reader-settings-close-btn" aria-label="Close settings" data-dialog-close>&times;</button>
            </div>

            <div class="v2-settings-body">
              
              <!-- Font Size Scaling Group -->
              <div class="v2-settings-group">
                <h3 class="v2-settings-group-title">Text Size</h3>
                <div class="v2-settings-row">
                  <span class="v2-settings-label">Reading Canvas</span>
                  <div class="v2-stepper">
                    <button type="button" class="v2-stepper-btn" id="v2-reader-size-dec" aria-label="Decrease reading text size">A&minus;</button>
                    <span class="v2-stepper-val" id="v2-reader-size-label">100%</span>
                    <button type="button" class="v2-stepper-btn" id="v2-reader-size-inc" aria-label="Increase reading text size">A+</button>
                  </div>
                </div>

                <div class="v2-settings-row">
                  <span class="v2-settings-label">Dictionary Sidebar</span>
                  <div class="v2-stepper">
                    <button type="button" class="v2-stepper-btn" id="v2-dict-size-dec" aria-label="Decrease dictionary text size">A&minus;</button>
                    <span class="v2-stepper-val" id="v2-dict-size-label">100%</span>
                    <button type="button" class="v2-stepper-btn" id="v2-dict-size-inc" aria-label="Increase dictionary text size">A+</button>
                  </div>
                </div>
              </div>

              <!-- Scholarly & Textual Aids -->
              <div class="v2-settings-group">
                <h3 class="v2-settings-group-title">Scholarly &amp; Textual Aids</h3>
                <label class="v2-settings-toggle-row">
                  <span class="v2-settings-label">Show Macra (vowel length markings: &amacr;, &emacr;, &imacr;, &omacr;, &umacr;)</span>
                  <input type="checkbox" id="v2-toggle-macra" class="v2-toggle-checkbox" checked>
                </label>

                <label class="v2-settings-toggle-row">
                  <span class="v2-settings-label">Show Section Numbers (&sect;)</span>
                  <input type="checkbox" id="v2-toggle-gutter" class="v2-toggle-checkbox" checked>
                </label>
              </div>

              <!-- Typography Style -->
              <div class="v2-settings-group">
                <h3 class="v2-settings-group-title">Typography</h3>
                <div class="v2-settings-row">
                  <span class="v2-settings-label">Font Family</span>
                  <select id="v2-font-select" class="v2-settings-select" aria-label="Select font style">
                    <option value="serif" selected>Classical Serif</option>
                    <option value="sans">Modern Sans-Serif</option>
                  </select>
                </div>

                <div class="v2-settings-row">
                  <span class="v2-settings-label">Line Spacing</span>
                  <select id="v2-line-height-select" class="v2-settings-select" aria-label="Select line spacing">
                    <option value="compact">Compact</option>
                    <option value="normal" selected>Normal</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </div>
              </div>

            </div>

            <div class="v2-dialog-actions v2-settings-actions">
              <button type="button" class="v2-btn v2-btn-secondary" id="v2-reader-settings-reset-btn">Reset Defaults</button>
              <button type="button" class="v2-btn v2-btn-primary" id="v2-reader-settings-done-btn" data-dialog-close>Done</button>
            </div>
          </div>
        </dialog>
      </morcus-reader-settings>`;
}
