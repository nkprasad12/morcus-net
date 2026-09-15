import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/v2/v2_types";
import {
  getV2Work,
  resolvePageInWork,
} from "@/web/v2/reader/reader_loader.server";
import {
  CitationId,
  citationToString,
} from "@/web/v2/reader/reader_types.server";
import {
  buildReaderPageUrl,
  renderTocDrawer,
} from "@/web/v2/reader/reader_toc.server";
import {
  renderBiblioDialog,
  renderReaderSettingsDialog,
} from "@/web/v2/reader/reader_dialogs.server";
import * as he from "he";

export {
  renderBiblioDialog,
  renderReaderSettingsDialog,
} from "@/web/v2/reader/reader_dialogs.server";

export {
  buildReaderPageUrl,
  renderTocItemsHtml,
  renderTocDrawer,
  type ReaderPageUrlOptions,
  type RenderTocItemsOptions,
  type ReaderTocDrawerOptions,
} from "@/web/v2/reader/reader_toc.server";

export interface ReaderPageOptions {
  workId?: string;
  pageId?: string | CitationId;
  query?: string;
  results?: DictsFusedResponse;
  view?: "single" | "parallel";
  work?: V2PreprocessedWork;
}

export interface ReaderRenderContext {
  work: V2PreprocessedWork;
  activePage: V2PreprocessedPage;
  activePageIndex: number;
  pageDotId: string;
  hasParallel: boolean;
  viewMode: "single" | "parallel";
  prevPage: V2PreprocessedPage | null;
  nextPage: V2PreprocessedPage | null;
  query: string;
  passageHtml: string;
  singleViewUrl: string;
  parallelViewUrl: string;
  dictIframeSrc: string;
  layoutStateClass: string;
}

/**
 * Resolves the active work, chapter, navigation links, and layout state
 * into a typed render context for reader view components.
 */
export async function resolveReaderContext(
  options: ReaderPageOptions = {}
): Promise<ReaderRenderContext> {
  const query = options.query?.trim() ?? "";
  const requestedId = options.workId || "caesar_de_bello_gallico";

  const work: V2PreprocessedWork | null =
    options.work ||
    (await getV2Work(requestedId)) ||
    (await getV2Work("caesar_de_bello_gallico")) ||
    (await getV2Work("phi0448.phi001.perseus-lat2"));

  if (!work) {
    throw new Error(`Classical work not found: ${requestedId}`);
  }

  // Resolve active page
  const pageIdStr = options.pageId
    ? Array.isArray(options.pageId)
      ? citationToString(options.pageId)
      : String(options.pageId)
    : undefined;

  const { page: activePage, index: activePageIndex } = resolvePageInWork(
    work,
    pageIdStr
  );
  const hasParallel = Boolean(work.hasTranslation && activePage.parallelHtml);
  const viewMode =
    hasParallel && options.view === "parallel" ? "parallel" : "single";
  const pageDotId = Array.isArray(activePage.id)
    ? citationToString(activePage.id)
    : activePage.id;
  const prevPage = activePageIndex > 0 ? work.pages[activePageIndex - 1] : null;
  const nextPage =
    activePageIndex < work.pages.length - 1
      ? work.pages[activePageIndex + 1]
      : null;

  const singleViewUrl = buildReaderPageUrl(work, activePage, {
    query: query || undefined,
  });

  const parallelViewUrl = buildReaderPageUrl(work, activePage, {
    viewMode: "parallel",
    query: query || undefined,
  });

  // Select passage HTML (single or parallel)
  const passageHtml =
    viewMode === "parallel" && activePage.parallelHtml
      ? activePage.parallelHtml
      : activePage.singleHtml;

  // Dictionary iframe src
  // When a word is looked up from the Latin reader, force inflected search (o=1) and restrict initial query to Latin lexica (lang=La)
  const dictIframeSrc = query
    ? `/v2/dicts?q=${encodeURIComponent(query)}&lang=La&o=1&embedded=1`
    : `/v2/dicts?embedded=1`;

  const layoutStateClass = query
    ? "reader-layout-active"
    : "reader-layout-empty";

  return {
    work,
    activePage,
    activePageIndex,
    pageDotId,
    hasParallel,
    viewMode,
    prevPage,
    nextPage,
    query,
    passageHtml,
    singleViewUrl,
    parallelViewUrl,
    dictIframeSrc,
    layoutStateClass,
  };
}

/**
 * Renders the reader sticky quick-navigation bar containing essential chapter jump
 * controls and the expandable secondary toolbar.
 */
export function renderReaderStickyBar(ctx: ReaderRenderContext): string {
  const {
    work,
    activePage,
    pageDotId,
    prevPage,
    nextPage,
    viewMode,
    hasParallel,
    query,
    singleViewUrl,
    parallelViewUrl,
  } = ctx;
  const prevPageUrl = buildReaderPageUrl(work, prevPage, { viewMode, query });
  const nextPageUrl = buildReaderPageUrl(work, nextPage, { viewMode, query });

  return `      <!-- Sticky Quick Navigation Bar (Essentials Default with Expandable Tools) -->
      <header class="reader-sticky-bar" role="toolbar" aria-label="Reader Quick Navigation">
        
        <!-- Primary Row: Essentials Only (Left arrow, Name of work, Section Jump, Right arrow, Expand toggle) -->
        <div class="sticky-primary-row">
          <a href="${prevPageUrl}"
             class="reader-btn reader-nav-arrow ${!prevPage ? "disabled" : ""}"
             id="pager-prev"
             ${!prevPage ? 'aria-disabled="true" tabindex="-1"' : ""}
             aria-label="Previous chapter"
             title="Previous ([)">
            <span class="pager-arrow" aria-hidden="true">&larr;</span>
          </a>

          <!-- Center: Work/Chapter Title + Section Symbol (§) + Pre-populated Jump Input -->
          <form action="/v2/reader/${work.urlAuthor}/${
    work.urlName
  }" method="GET" class="reader-sticky-form" id="reader-jump-form">
            <input type="hidden" name="curr_page" value="${pageDotId}">
            ${
              viewMode === "parallel"
                ? '<input type="hidden" name="view" value="parallel">'
                : ""
            }
            
            <div class="sticky-title-wrapper" title="${he.escape(
              work.author
            )}, ${he.escape(work.title)}, ${he.escape(activePage.title)}">
              <span class="sticky-author">${he.escape(work.author)}</span>
              <span class="sticky-title-sep">,</span>
              <span class="sticky-work-title">${he.escape(work.title)}</span>
              <span class="sticky-title-sep sticky-work-sep">,</span>
              <span class="sticky-page-title">${he.escape(
                activePage.title
              )}</span>
            </div>

            <div class="sticky-jump-box">
              <label for="jump-input" class="jump-glyph" title="Citation section (type and press Enter to jump)">§</label>
              <input type="text"
                     id="jump-input"
                     name="jump"
                     value="${pageDotId}"
                     class="jump-input sticky-jump-input"
                     title="Current citation: § ${pageDotId}. Type new coordinate and press Enter to jump."
                     autocomplete="off"
                     onfocus="this.select()">
              <button type="submit" class="jump-submit sr-only-focusable" aria-label="Go to section">Go</button>
            </div>
          </form>

          <!-- Right Controls: Next Arrow + Expand Button -->
          <div class="sticky-primary-right">
            <a href="${nextPageUrl}"
               class="reader-btn reader-nav-arrow ${
                 !nextPage ? "disabled" : ""
               }"
               id="pager-next"
               ${!nextPage ? 'aria-disabled="true" tabindex="-1"' : ""}
               aria-label="Next chapter"
               title="Next (])">
              <span class="pager-arrow" aria-hidden="true">&rarr;</span>
            </a>

            <!-- Expand / More Button -->
            <button type="button"
                    class="reader-btn sticky-expand-btn"
                    id="sticky-expand-btn"
                    aria-expanded="false"
                    aria-controls="sticky-expanded-row"
                    title="Show additional tools (Contents, view mode, settings, info)">
              <svg class="icon-more" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
                <circle cx="12" cy="12" r="2"></circle>
                <circle cx="19" cy="12" r="2"></circle>
                <circle cx="5" cy="12" r="2"></circle>
              </svg>
              <span class="expand-label">More</span>
              <span class="expand-chevron" aria-hidden="true">&dtrif;</span>
            </button>
          </div>
        </div>

        <!-- Secondary Expanded Row (Hidden by default, smooth animated reveal) -->
        <div class="sticky-expanded-row" id="sticky-expanded-row" hidden>
          <!-- Left: TOC Drawer Button -->
          <div class="expanded-left">
            <button type="button"
                    class="reader-btn reader-toc-trigger"
                    id="reader-toc-btn"
                    aria-expanded="false"
                    aria-controls="reader-toc-drawer"
                    title="Table of Contents (T)">
              <svg class="icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span>Contents</span>
            </button>
          </div>

          <!-- Right: View Mode Toggle + Settings + Scholarly Info -->
          <div class="expanded-right">
            ${
              hasParallel
                ? `<div class="reader-view-toggle" role="group" aria-label="Reading View Mode">
              <a href="${singleViewUrl}"
                 class="toggle-option ${viewMode === "single" ? "active" : ""}"
                 id="mode-single"
                 title="Single Column">Single</a>
              <a href="${parallelViewUrl}"
                 class="toggle-option ${
                   viewMode === "parallel" ? "active" : ""
                 }"
                 id="mode-parallel"
                 title="Dual Column Parallel Translation">Parallel</a>
            </div>`
                : ""
            }

            <button type="button"
                    class="reader-btn reader-settings-btn"
                    id="reader-settings-btn"
                    aria-expanded="false"
                    aria-controls="reader-settings-dialog"
                    title="Appearance & Settings (Aa)">
              <span class="settings-glyph">Aa</span>
              <span class="btn-text">Settings</span>
            </button>

            <button type="button"
                    class="reader-btn reader-info-btn"
                    id="reader-info-btn"
                    title="Scholarly Edition & Metadata (ℹ)">
              <span>ℹ</span>
              <span class="btn-text">Info</span>
            </button>
          </div>
        </div>

      </header>`;
}

/**
 * Renders the main reading text card containing passage header metadata,
 * the Latin text article body, continuation buttons, and library catalog link.
 */
export function renderReaderTextPanel(ctx: ReaderRenderContext): string {
  const { work, activePage, passageHtml, prevPage, nextPage, viewMode, query } =
    ctx;
  const prevPageUrl = buildReaderPageUrl(work, prevPage, { viewMode, query });
  const nextPageUrl = buildReaderPageUrl(work, nextPage, { viewMode, query });

  return `        <!-- Left Column: Reading Text Canvas -->
        <section class="reader-text-panel" aria-label="Reading Text">
          <div class="reader-text-card">
            
            <header class="reader-text-card-header">
              <div class="reader-text-meta">
                <span class="reader-author-tag">${he.escape(work.author)}</span>
                <span class="reader-meta-sep">&middot;</span>
                <span class="reader-work-tag">${he.escape(work.title)}</span>
              </div>
              <h1 class="reader-passage-heading">${he.escape(
                activePage.title
              )}</h1>
            </header>

            <!-- Reader Passage Container -->
            <article class="reader-passage" id="reader-passage">
              ${passageHtml}
            </article>

            <!-- Bottom Paging Continuation Actions & Prototype Switcher -->
            <footer class="reader-passage-footer">
              <div class="reader-continuation-actions">
                ${
                  nextPage
                    ? `<a href="${nextPageUrl}" class="reader-btn reader-continue-btn">
                        <span>Continue to ${he.escape(
                          nextPage.title
                        )}</span> &rarr;
                       </a>`
                    : ""
                }
                ${
                  prevPage
                    ? `<a href="${prevPageUrl}" class="reader-btn reader-return-btn">
                        &larr; <span>Return to ${he.escape(
                          prevPage.title
                        )}</span>
                       </a>`
                    : ""
                }
              </div>

              <div class="reader-footer-info">
                <span class="reader-footer-note">
                  Text: ${he.escape(work.author)}, <em>${he.escape(
    work.title
  )}</em>.
                  ${
                    work.editor
                      ? `Critical edition: ${he.escape(work.editor)}.`
                      : ""
                  }
                </span>

                <!-- Return to Library Link -->
                <div class="reader-library-nav">
                  <a href="/v2/library" class="reader-library-link">&larr; Return to Library Catalog</a>
                </div>
              </div>
            </footer>

          </div>
        </section>`;
}

/**
 * Renders the desktop splitter and dictionary panel (mobile bottom sheet)
 * containing word definition teasers and the embedded dictionary iframe.
 */
export function renderReaderDictPanel(ctx: ReaderRenderContext): string {
  const { work, activePage, query, dictIframeSrc, viewMode } = ctx;
  const activePageUrl = buildReaderPageUrl(work, activePage, {
    viewMode,
    query: query || undefined,
  });

  return `        <!-- Desktop Resizable Splitter Bar -->
        <div class="reader-splitter"
             role="separator"
             tabindex="0"
             aria-orientation="vertical"
             aria-label="Resize dictionary sidebar"
             aria-valuemin="300"
             aria-valuemax="750"
             aria-valuenow="420">
          <div class="reader-splitter-handle" aria-hidden="true"></div>
        </div>

        <!-- Right / Bottom Column: Dictionary Panel (Adaptive Sheet on Mobile) -->
        <aside class="reader-dict-panel" id="reader-dict" aria-label="Dictionary">
          <!-- Mobile sheet handle & teaser bar (visible on mobile) -->
          <div class="reader-sheet-bar"
               role="separator"
               tabindex="0"
               aria-orientation="horizontal"
               aria-label="Resize dictionary drawer"
               aria-valuemin="54"
               aria-valuemax="90"
               aria-valuenow="48">
            <div class="reader-sheet-handle" aria-hidden="true"></div>
            <div class="reader-sheet-teaser">
              <span class="reader-sheet-label">
                ${
                  query
                    ? `Definitions for <strong>${he.escape(query)}</strong>`
                    : "Tap any word to view definitions"
                }
              </span>
              ${
                query
                  ? `<a href="${activePageUrl}" class="reader-sheet-close" aria-label="Close dictionary panel" title="Close">✕</a>`
                  : ""
              }
            </div>
          </div>

          <!-- Dictionary Iframe Container -->
          <div class="dict-iframe-container">
            <iframe id="dict-frame"
                    name="dict-frame"
                    src="${he.escape(dictIframeSrc)}"
                    class="dict-iframe"
                    title="Dictionary Search and Definitions"
                    loading="lazy"></iframe>
          </div>
        </aside>`;
}

/**
 * Synchronous renderer converting an established ReaderRenderContext into the
 * complete reader view custom element markup (<morcus-reader-view>).
 */
export function renderReaderContentHtmlFromContext(
  ctx: ReaderRenderContext
): string {
  return `
    <morcus-reader-view class="reader-view ${
      ctx.viewMode === "parallel" ? "reader-view-parallel" : ""
    }"
      data-work="${ctx.work.id}"
      data-page="${ctx.pageDotId}"
      data-view="${ctx.viewMode}"
      data-author="${ctx.work.urlAuthor}"
      data-name="${ctx.work.urlName}">

${renderReaderStickyBar(ctx)}

      <!-- Floating Confirmation Toast -->
      <div id="reader-toast" class="reader-toast" aria-live="polite"></div>

      <!-- Main Split Layout -->
      <div class="reader-split-layout ${ctx.layoutStateClass}">
${renderReaderTextPanel(ctx)}
${renderReaderDictPanel(ctx)}
      </div>

${renderTocDrawer({
  work: ctx.work,
  activePageIndex: ctx.activePageIndex,
  viewMode: ctx.viewMode,
  query: ctx.query,
})}

${renderBiblioDialog(ctx.work)}

${renderReaderSettingsDialog()}

    </morcus-reader-view>
  `;
}

export async function renderReaderContentHtml(
  options: ReaderPageOptions = {}
): Promise<string> {
  const ctx = await resolveReaderContext(options);
  return renderReaderContentHtmlFromContext(ctx);
}

export async function renderReaderPageHtml(
  options: ReaderPageOptions = {}
): Promise<string> {
  const ctx = await resolveReaderContext(options);

  const title = ctx.query
    ? `${ctx.query} - Latin Reader - Morcus Latin Tools`
    : `${ctx.work.title} - Latin Reader - Morcus Latin Tools`;

  const contentHtml = renderReaderContentHtmlFromContext(ctx);

  return renderPageShell({
    title,
    activePage: "library",
    isReader: true,
    contentHtml,
  });
}

export { createReaderRoutes } from "@/web/v2/reader/reader_routes.server";
