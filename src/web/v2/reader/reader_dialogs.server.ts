import { V2PreprocessedWork } from "@/common/library/v2/v2_types";
import * as he from "he";

/**
 * Renders the bibliographical metadata modal dialog detailing scholarly editions,
 * CTS URNs, structural hierarchy, and source provenance for a classical work.
 */
export function renderBiblioDialog(work: V2PreprocessedWork): string {
  return `      <!-- Bibliographical Metadata Dialog -->
      <dialog class="dialog reader-biblio-dialog" id="reader-biblio-dialog">
        <div class="dialog-card">
          <div class="dialog-header">
            <div>
              <h2 class="dialog-title">${he.escape(work.title)}</h2>
              <p class="dialog-subtitle">Scholarly editions &amp; CTS citation</p>
            </div>
            <button type="button" class="dialog-close-btn" id="reader-biblio-close-btn" data-dialog-close>&times;</button>
          </div>

          <dl class="reader-meta-list">
            <div class="meta-row">
              <dt>Author</dt>
              <dd>${he.escape(work.author)}</dd>
            </div>
            <div class="meta-row">
              <dt>Structural Hierarchy</dt>
              <dd><code>[${work.textParts
                .map((p) => `"${p}"`)
                .join(", ")}]</code></dd>
            </div>
            ${
              work.editor
                ? `<div class="meta-row">
                    <dt>Critical Edition</dt>
                    <dd>${he.escape(work.editor)}</dd>
                   </div>`
                : ""
            }
            ${
              work.translator
                ? `<div class="meta-row">
                    <dt>English Translation</dt>
                    <dd>${he.escape(work.translator)}</dd>
                   </div>`
                : ""
            }
            ${
              work.ctsUrn
                ? `<div class="meta-row">
                    <dt>CTS URN</dt>
                    <dd><code>${he.escape(work.ctsUrn)}</code></dd>
                   </div>`
                : ""
            }
            ${
              work.license
                ? `<div class="meta-row">
                    <dt>License</dt>
                    <dd>${he.escape(work.license)}</dd>
                   </div>`
                : ""
            }
            ${
              work.sourceRepo
                ? `<div class="meta-row">
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

          <div class="dialog-actions">
            <button type="button" class="btn btn-primary" id="reader-biblio-ok-btn" data-dialog-close>Close</button>
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
                <label class="settings-toggle-row">
                  <span class="settings-label">Show Macra (vowel length markings: &amacr;, &emacr;, &imacr;, &omacr;, &umacr;)</span>
                  <input type="checkbox" id="toggle-macra" class="toggle-checkbox" checked>
                </label>

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
