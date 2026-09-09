import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import {
  linkifyText,
  renderDictResultsHtml,
  renderDictSearchBar,
} from "@/web/v2/dict/dict.server";
import * as he from "he";
import {
  CitationId,
  ReaderPage,
  ReaderWork,
  citationToString,
  getSectionLocalId,
  getSectionPrefix,
  parseCitationString,
} from "@/web/v2/reader/reader_types";
import {
  READER_WORKS,
  getAllReaderWorks,
  getReaderWork,
} from "@/web/v2/reader/reader_data";

export interface ReaderPageOptions {
  workId?: string;
  pageId?: string | CitationId;
  query?: string;
  results?: DictsFusedResponse;
  view?: "single" | "parallel";
}

export function renderReaderContentHtml(
  options: ReaderPageOptions = {}
): string {
  const query = options.query?.trim() ?? "";
  const results = options.results;
  const viewMode = options.view === "parallel" ? "parallel" : "single";
  const work = getReaderWork(options.workId || "dbg");

  // Determine active page
  let activePageIndex = 0;
  if (options.pageId) {
    const pageTokens = Array.isArray(options.pageId)
      ? options.pageId
      : parseCitationString(options.pageId);
    const foundIdx = work.pages.findIndex(
      (p) =>
        p.id.length === pageTokens.length &&
        p.id.every((tok, i) => tok === pageTokens[i])
    );
    if (foundIdx !== -1) {
      activePageIndex = foundIdx;
    }
  }

  const activePage = work.pages[activePageIndex] || work.pages[0];
  const pageDotId = citationToString(activePage.id);
  const prevPage = activePageIndex > 0 ? work.pages[activePageIndex - 1] : null;
  const nextPage =
    activePageIndex < work.pages.length - 1
      ? work.pages[activePageIndex + 1]
      : null;

  const urlBuilder = (cleanWord: string) => {
    const params = new URLSearchParams();
    if (work.id !== "dbg") params.set("work", work.id);
    if (pageDotId !== "1.1") params.set("id", pageDotId);
    if (viewMode === "parallel") params.set("view", "parallel");
    params.set("q", cleanWord);
    return `/v2/reader?${params.toString()}`;
  };

  // Build Reading Sections HTML
  const sectionsHtml = activePage.sections
    .map((sec) => {
      const dotId = citationToString(sec.id);
      const localId = getSectionLocalId(sec.id, activePage.id);
      const prefix = getSectionPrefix(sec.id, activePage.id);
      const linkifiedLatin = linkifyText(sec.latin, urlBuilder, query);

      const gutterHtml = `
        <div class="v2-reader-gutter">
          <a href="#sec-${dotId}"
             class="v2-section-anchor"
             title="Citation § ${dotId} (Click to copy permalink)"
             aria-label="Section ${dotId}">
            <span class="v2-cite-prefix">${he.encode(
              prefix
            )}</span><span class="v2-cite-local">${he.encode(localId)}</span>
          </a>
        </div>
      `;

      if (viewMode === "parallel" && sec.english) {
        return `
          <div class="v2-reader-section v2-section-parallel" id="sec-${dotId}">
            ${gutterHtml}
            <div class="v2-reader-parallel-content">
              <div class="v2-reader-passage-col v2-passage-latin">
                <p class="v2-reader-paragraph">${linkifiedLatin}</p>
              </div>
              <div class="v2-reader-passage-col v2-passage-english">
                <span class="v2-reader-trans-author">${he.encode(
                  (work.translator || "Translation").split("(")[0].trim()
                )}:</span>
                <p class="v2-reader-trans-text">${he.encode(sec.english)}</p>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="v2-reader-section" id="sec-${dotId}">
          ${gutterHtml}
          <div class="v2-reader-passage">
            <p class="v2-reader-paragraph">${linkifiedLatin}</p>
          </div>
        </div>
      `;
    })
    .join("\n");

  // Dictionary Output
  const dictResultsHtml = query
    ? renderDictResultsHtml(query, results)
    : `
      <div class="v2-reader-empty-state">
        <p class="v2-reader-empty-title">Select a word to view definitions</p>
        <p class="v2-reader-empty-desc">
          Click or tap any word in the text on the left to inspect its lexical entries,
          inflections, and translations.
        </p>
      </div>
    `;

  const layoutStateClass = query
    ? "v2-reader-layout-active"
    : "v2-reader-layout-empty";

  // Navigation Links URLs
  const makePageUrl = (page: ReaderPage | null) => {
    if (!page) return "#";
    const params = new URLSearchParams();
    if (work.id !== "dbg") params.set("work", work.id);
    params.set("id", citationToString(page.id));
    if (viewMode === "parallel") params.set("view", "parallel");
    if (query) params.set("q", query);
    return `/v2/reader?${params.toString()}`;
  };

  const singleViewUrl = (() => {
    const params = new URLSearchParams();
    if (work.id !== "dbg") params.set("work", work.id);
    if (pageDotId !== "1.1") params.set("id", pageDotId);
    if (query) params.set("q", query);
    return `/v2/reader?${params.toString()}`;
  })();

  const parallelViewUrl = (() => {
    const params = new URLSearchParams();
    if (work.id !== "dbg") params.set("work", work.id);
    if (pageDotId !== "1.1") params.set("id", pageDotId);
    params.set("view", "parallel");
    if (query) params.set("q", query);
    return `/v2/reader?${params.toString()}`;
  })();

  // TOC Entries
  const tocItemsHtml = work.pages
    .map((p, idx) => {
      const isCurrent = idx === activePageIndex;
      const dot = citationToString(p.id);
      const pageUrl = makePageUrl(p);
      return `
        <a href="${pageUrl}"
           class="v2-reader-toc-item ${isCurrent ? "active" : ""}"
           ${isCurrent ? 'aria-current="page"' : ""}>
          <div class="v2-reader-toc-item-text">
            <span class="v2-reader-toc-item-title">${he.encode(p.title)}</span>
          </div>
          <span class="v2-reader-toc-item-id">§ ${he.encode(dot)}</span>
        </a>
      `;
    })
    .join("\n");

  const works = getAllReaderWorks();
  const workOptionsHtml = works
    .map(
      (w) =>
        `<option value="${w.id}" ${
          w.id === work.id ? "selected" : ""
        }>${he.encode(w.author.split(" ").slice(-1)[0])}: ${he.encode(
          w.title
        )} (${w.textParts.length} levels)</option>`
    )
    .join("\n");

  return `
    <morcus-reader-view class="v2-reader-view ${
      viewMode === "parallel" ? "v2-reader-view-parallel" : ""
    }"
      data-work="${work.id}"
      data-page="${pageDotId}"
      data-view="${viewMode}">

      <!-- Sticky Quick Navigation Bar (Essentials Default with Expandable Tools) -->
      <header class="v2-reader-sticky-bar" role="toolbar" aria-label="Reader Quick Navigation">
        
        <!-- Primary Row: Essentials Only (Left arrow, Name of work, Section Jump, Right arrow, Expand toggle) -->
        <div class="v2-sticky-primary-row">
          <a href="${makePageUrl(prevPage)}"
             class="v2-reader-btn v2-reader-nav-arrow ${
               !prevPage ? "disabled" : ""
             }"
             id="v2-pager-prev"
             ${!prevPage ? 'aria-disabled="true" tabindex="-1"' : ""}
             aria-label="Previous chapter"
             title="Previous ([)">
            <span class="v2-pager-arrow" aria-hidden="true">&larr;</span>
          </a>

          <!-- Center: Work/Chapter Title + Section Symbol (§) + Pre-populated Jump Input -->
          <form action="/v2/reader" method="GET" class="v2-reader-sticky-form" id="v2-reader-jump-form">
            <input type="hidden" name="work" value="${work.id}">
            <input type="hidden" name="curr_page" value="${pageDotId}">
            ${
              viewMode === "parallel"
                ? '<input type="hidden" name="view" value="parallel">'
                : ""
            }
            
            <div class="v2-sticky-title-wrapper" title="${he.encode(
              work.author
            )}, ${he.encode(work.title)}, ${he.encode(activePage.title)}">
              <span class="v2-sticky-author">${he.encode(work.author)}</span>
              <span class="v2-sticky-title-sep">,</span>
              <span class="v2-sticky-work-title">${he.encode(work.title)}</span>
              <span class="v2-sticky-title-sep v2-sticky-work-sep">,</span>
              <span class="v2-sticky-page-title">${he.encode(
                activePage.title
              )}</span>
            </div>

            <div class="v2-sticky-jump-box">
              <label for="v2-jump-input" class="v2-jump-glyph" title="Citation section (type and press Enter to jump)">§</label>
              <input type="text"
                     id="v2-jump-input"
                     name="jump"
                     value="${pageDotId}"
                     class="v2-jump-input v2-sticky-jump-input"
                     title="Current citation: § ${pageDotId}. Type new coordinate and press Enter to jump."
                     autocomplete="off"
                     onfocus="this.select()">
              <button type="submit" class="v2-jump-submit v2-sr-only-focusable" aria-label="Go to section">Go</button>
            </div>
          </form>

          <!-- Right Controls: Next Arrow + Expand Button -->
          <div class="v2-sticky-primary-right">
            <a href="${makePageUrl(nextPage)}"
               class="v2-reader-btn v2-reader-nav-arrow ${
                 !nextPage ? "disabled" : ""
               }"
               id="v2-pager-next"
               ${!nextPage ? 'aria-disabled="true" tabindex="-1"' : ""}
               aria-label="Next chapter"
               title="Next (])">
              <span class="v2-pager-arrow" aria-hidden="true">&rarr;</span>
            </a>

            <!-- Expand / More Button -->
            <button type="button"
                    class="v2-reader-btn v2-sticky-expand-btn"
                    id="v2-sticky-expand-btn"
                    aria-expanded="false"
                    aria-controls="v2-sticky-expanded-row"
                    title="Show additional tools (Contents, view mode, settings, info)">
              <svg class="v2-icon-more" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                <circle cx="12" cy="12" r="2"></circle>
                <circle cx="19" cy="12" r="2"></circle>
                <circle cx="5" cy="12" r="2"></circle>
              </svg>
              <span class="v2-expand-label">More</span>
              <span class="v2-expand-chevron" aria-hidden="true">&dtrif;</span>
            </button>
          </div>
        </div>

        <!-- Secondary Expanded Row (Hidden by default, smooth animated reveal) -->
        <div class="v2-sticky-expanded-row" id="v2-sticky-expanded-row" hidden>
          <!-- Left: TOC Drawer Button -->
          <div class="v2-expanded-left">
            <button type="button"
                    class="v2-reader-btn v2-reader-toc-trigger"
                    id="v2-reader-toc-btn"
                    aria-expanded="false"
                    aria-controls="v2-reader-toc-drawer"
                    title="Table of Contents (T)">
              <svg class="v2-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span>Contents</span>
            </button>
          </div>

          <!-- Right: View Mode Toggle + Settings + Scholarly Info -->
          <div class="v2-expanded-right">
            <div class="v2-reader-view-toggle" role="group" aria-label="Reading View Mode">
              <a href="${singleViewUrl}"
                 class="v2-toggle-option ${
                   viewMode === "single" ? "active" : ""
                 }"
                 id="v2-mode-single"
                 title="Single Column">Single</a>
              <a href="${parallelViewUrl}"
                 class="v2-toggle-option ${
                   viewMode === "parallel" ? "active" : ""
                 }"
                 id="v2-mode-parallel"
                 title="Dual Column Parallel Translation">Parallel</a>
            </div>

            <button type="button"
                    class="v2-reader-btn v2-reader-settings-btn"
                    id="v2-reader-settings-btn"
                    aria-expanded="false"
                    aria-controls="v2-reader-settings-dialog"
                    title="Appearance & Settings (Aa)">
              <span class="v2-settings-glyph">Aa</span>
              <span class="v2-btn-text">Settings</span>
            </button>

            <button type="button"
                    class="v2-reader-btn v2-reader-info-btn"
                    id="v2-reader-info-btn"
                    title="Scholarly Edition & Metadata (ℹ)">
              <span>ℹ</span>
              <span class="v2-btn-text">Info</span>
            </button>
          </div>
        </div>

      </header>

      <!-- Floating Confirmation Toast -->
      <div id="v2-reader-toast" class="v2-reader-toast" aria-live="polite"></div>

      <!-- Main Split Layout -->
      <div class="v2-reader-split-layout ${layoutStateClass}">
        
        <!-- Left Column: Reading Text Canvas -->
        <section class="v2-reader-text-panel" aria-label="Reading Text">
          <div class="v2-reader-text-card">
            
            <header class="v2-reader-text-card-header">
              <div class="v2-reader-text-meta">
                <span class="v2-reader-author-tag">${he.encode(
                  work.author
                )}</span>
                <span class="v2-reader-meta-sep">&middot;</span>
                <span class="v2-reader-work-tag">${he.encode(work.title)}</span>
              </div>
              <h1 class="v2-reader-passage-heading">${he.encode(
                activePage.title
              )}</h1>
            </header>

            <!-- Reader Passage Rows Container -->
            <article class="v2-reader-passage" id="v2-reader-passage">
              ${sectionsHtml}
            </article>

            <!-- Bottom Paging Continuation Actions & Prototype Switcher -->
            <footer class="v2-reader-passage-footer">
              <div class="v2-reader-continuation-actions">
                ${
                  nextPage
                    ? `<a href="${makePageUrl(
                        nextPage
                      )}" class="v2-reader-btn v2-reader-continue-btn">
                        <span>Continue to ${he.encode(
                          nextPage.title
                        )}</span> &rarr;
                       </a>`
                    : ""
                }
                ${
                  prevPage
                    ? `<a href="${makePageUrl(
                        prevPage
                      )}" class="v2-reader-btn v2-reader-return-btn">
                        &larr; <span>Return to ${he.encode(
                          prevPage.title
                        )}</span>
                       </a>`
                    : ""
                }
              </div>

              <div class="v2-reader-footer-info">
                <span class="v2-reader-footer-note">
                  Text: ${he.encode(work.author)}, <em>${he.encode(
    work.title
  )}</em>.
                  ${
                    work.editor
                      ? `Critical edition: ${he.encode(work.editor)}.`
                      : ""
                  }
                </span>

                <!-- Prototype Text Switcher (Moved to bottom of page for evaluation) -->
                <div class="v2-reader-prototype-switcher">
                  <div class="v2-prototype-switcher-desc">
                    <span class="v2-prototype-switcher-label">Prototype Text Switcher:</span>
                    <span class="v2-prototype-switcher-sub">(Testing aid &mdash; long term accessed via Library)</span>
                  </div>
                  <form action="/v2/reader" method="GET" class="v2-reader-work-form">
                    ${
                      viewMode === "parallel"
                        ? '<input type="hidden" name="view" value="parallel">'
                        : ""
                    }
                    <select name="work"
                            class="v2-reader-work-select"
                            id="v2-reader-work-select"
                            aria-label="Select prototype classical text"
                            onchange="this.form.submit()">
                      ${workOptionsHtml}
                    </select>
                  </form>
                </div>
              </div>
            </footer>

          </div>
        </section>

        <!-- Desktop Resizable Splitter Bar -->
        <div class="v2-reader-splitter"
             role="separator"
             tabindex="0"
             aria-orientation="vertical"
             aria-label="Resize dictionary sidebar"
             aria-valuemin="300"
             aria-valuemax="750"
             aria-valuenow="420">
          <div class="v2-reader-splitter-handle" aria-hidden="true"></div>
        </div>

        <!-- Right / Bottom Column: Dictionary Panel (Adaptive Sheet on Mobile) -->
        <aside class="v2-reader-dict-panel" id="v2-reader-dict" aria-label="Dictionary">
          <!-- Mobile sheet handle & teaser bar (visible on mobile) -->
          <div class="v2-reader-sheet-bar"
               role="separator"
               tabindex="0"
               aria-orientation="horizontal"
               aria-label="Resize dictionary drawer"
               aria-valuemin="54"
               aria-valuemax="90"
               aria-valuenow="48">
            <div class="v2-reader-sheet-handle" aria-hidden="true"></div>
            <div class="v2-reader-sheet-teaser">
              <span class="v2-reader-sheet-label">
                ${
                  query
                    ? `Definitions for <strong>${he.encode(query)}</strong>`
                    : "Tap any word to view definitions"
                }
              </span>
              ${
                query
                  ? `<a href="${makePageUrl(
                      activePage
                    )}" class="v2-reader-sheet-close" aria-label="Close dictionary panel" title="Close">✕</a>`
                  : ""
              }
            </div>
          </div>

          <div class="v2-reader-dict-sticky">
            <header class="v2-reader-dict-header">
              ${renderDictSearchBar({
                query,
                action: "/v2/reader",
                formClass: "v2-reader-search-form",
                inputClass: "v2-reader-input",
                placeholder: "Lookup word...",
              })}
            </header>

            <!-- Stable content wrapper for robust, delta-free scroll alignment -->
            <div class="v2-reader-dict-content">
              <output id="v2-reader-dict-results" class="v2-reader-dict-output" aria-live="polite">
                ${dictResultsHtml}
              </output>
            </div>
          </div>
        </aside>

      </div>

      <!-- Contained Table of Contents (TOC) Drawer -->
      <div id="v2-reader-toc-drawer"
           class="v2-reader-toc-drawer"
           role="dialog"
           aria-modal="true"
           aria-label="Table of Contents"
           hidden>
        <div class="v2-reader-toc-header">
          <div class="v2-reader-toc-header-left">
            <button type="button"
                    class="v2-reader-toc-back-btn"
                    id="v2-reader-toc-back-btn"
                    aria-label="Back to reader">
              &larr; Back
            </button>
            <span class="v2-reader-toc-title">Table of Contents</span>
          </div>
          <button type="button"
                  class="v2-reader-toc-close-btn"
                  id="v2-reader-toc-close-btn"
                  aria-label="Close table of contents">&times;</button>
        </div>

        <div class="v2-reader-toc-banner">
          <span class="v2-reader-toc-work-title">${he.encode(
            work.author
          )} &middot; ${he.encode(work.title)}</span>
          <span class="v2-reader-toc-scheme-label">${he.encode(
            work.textParts.join(" · ")
          )}</span>
        </div>

        <div class="v2-reader-toc-search-box">
          <input type="text"
                 id="v2-reader-toc-filter"
                 class="v2-reader-toc-input"
                 placeholder="Search chapters, summaries..."
                 aria-label="Search Table of Contents">
        </div>

        <div class="v2-reader-toc-list" id="v2-reader-toc-list">
          ${tocItemsHtml}
        </div>
      </div>

      <!-- Bibliographical Metadata Dialog -->
      <dialog class="v2-dialog v2-reader-biblio-dialog" id="v2-reader-biblio-dialog">
        <div class="v2-dialog-card">
          <div class="v2-dialog-header">
            <div>
              <h2 class="v2-dialog-title">${he.encode(work.title)}</h2>
              <p class="v2-dialog-subtitle">Scholarly editions &amp; CTS citation</p>
            </div>
            <button type="button" class="v2-dialog-close-btn" id="v2-reader-biblio-close-btn">&times;</button>
          </div>

          <dl class="v2-reader-meta-list">
            <div class="v2-meta-row">
              <dt>Author</dt>
              <dd>${he.encode(work.author)}</dd>
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
                    <dd>${he.encode(work.editor)}</dd>
                   </div>`
                : ""
            }
            ${
              work.translator
                ? `<div class="v2-meta-row">
                    <dt>English Translation</dt>
                    <dd>${he.encode(work.translator)}</dd>
                   </div>`
                : ""
            }
            ${
              work.ctsUrn
                ? `<div class="v2-meta-row">
                    <dt>CTS URN</dt>
                    <dd><code>${he.encode(work.ctsUrn)}</code></dd>
                   </div>`
                : ""
            }
            ${
              work.license
                ? `<div class="v2-meta-row">
                    <dt>License</dt>
                    <dd>${he.encode(work.license)}</dd>
                   </div>`
                : ""
            }
            ${
              work.sourceRepo
                ? `<div class="v2-meta-row">
                    <dt>Source Repository</dt>
                    <dd><a href="${he.encode(
                      work.sourceRepo
                    )}" target="_blank" rel="noopener noreferrer">${he.encode(
                    work.sourceRepo
                  )}</a></dd>
                   </div>`
                : ""
            }
          </dl>

          <div class="v2-dialog-actions">
            <button type="button" class="v2-btn v2-btn-primary" id="v2-reader-biblio-ok-btn">Close</button>
          </div>
        </div>
      </dialog>

      <!-- Reader Appearance & Settings Dialog -->
      <dialog class="v2-dialog v2-reader-settings-dialog" id="v2-reader-settings-dialog">
        <div class="v2-dialog-card v2-settings-card">
          <div class="v2-dialog-header">
            <div>
              <h2 class="v2-dialog-title">Reader Settings</h2>
              <p class="v2-dialog-subtitle">Typography &amp; display preferences</p>
            </div>
            <button type="button" class="v2-dialog-close-btn" id="v2-reader-settings-close-btn" aria-label="Close settings">&times;</button>
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
            <button type="button" class="v2-btn v2-btn-primary" id="v2-reader-settings-done-btn">Done</button>
          </div>
        </div>
      </dialog>

    </morcus-reader-view>
  `;
}

export function renderReaderPageHtml(options: ReaderPageOptions = {}): string {
  const query = options.query?.trim() ?? "";
  const work = getReaderWork(options.workId || "dbg");
  const title = query
    ? `${query} - Latin Reader - Morcus Latin Tools`
    : `${work.title} - Latin Reader - Morcus Latin Tools`;

  return renderPageShell({
    title,
    activePage: "reader",
    contentHtml: renderReaderContentHtml(options),
  });
}
