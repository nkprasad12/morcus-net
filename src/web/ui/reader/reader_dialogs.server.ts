import { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import * as he from "he";
import {
  renderReaderSettingsPopoverHtml,
  type ReaderSettingsPopoverOptions,
} from "@/web/ui/reader/reader_frame.common";
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
    case "theLatinLibrary":
      return `<p class="reader-about-attribution">The raw text was provided by <a href="https://www.thelatinlibrary.com" target="_blank" rel="noopener noreferrer">The Latin Library</a>, which presents it as being in the public domain.</p>`;
    case "perseus":
    default:
      return `<p class="reader-about-attribution">The raw text was provided by the Perseus Digital Library and was accessed originally from <a href="https://github.com/PerseusDL/canonical-latinLit" target="_blank" rel="noopener noreferrer">https://github.com/PerseusDL/canonical-latinLit</a>. It is provided under Perseus&#39; conditions of the <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA-4.0</a> license, and you must offer Perseus any modifications you make.</p>`;
  }
}

/**
 * Renders the scholarly attribution and work metadata colophon detailing authors,
 * critical editors, funding, sponsors, CTS URN / work ID, source links, and license.
 * Rendered into the companion panel's About view.
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

  return ssr`<div class="reader-work-about" id="reader-work-about">
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
      </div>`;
}

/**
 * Renders the reader display settings dialog (`#reader-settings-popover`).
 * The markup lives in the browser-safe `renderReaderSettingsPopoverHtml`
 * (`reader_frame.common.ts`).
 */
export function renderReaderSettingsPopover(
  options: ReaderSettingsPopoverOptions = {}
): string {
  return String(renderReaderSettingsPopoverHtml(options));
}
