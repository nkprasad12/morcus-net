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
  getDifferentialCitationLabel,
} from "@/web/v2/reader/reader_types.server";
import {
  buildReaderPageUrl,
  renderTocDrawer,
} from "@/web/v2/reader/reader_toc.server";
import {
  renderReaderAboutSection,
  renderReaderSettingsPopover,
} from "@/web/v2/reader/reader_dialogs.server";
import * as he from "he";

export {
  renderBiblioDialog,
  renderReaderAboutSection,
  renderReaderSettingsDialog,
  renderReaderSettingsPopover,
  type ReaderSettingsDialogOptions,
  type ReaderSettingsPopoverOptions,
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

// TODO(reader-canvas): 3-panel split-pane view (Latin | English || Dictionary).
export interface ReaderRenderContext {
  work: V2PreprocessedWork;
  activePage: V2PreprocessedPage;
  activePageIndex: number;
  pageDotId: string;
  prevPage: V2PreprocessedPage | null;
  nextPage: V2PreprocessedPage | null;
  query: string;
  passageHtml: string;
  singleViewUrl: string;
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

  const passageHtml = activePage.singleHtml;

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
    prevPage,
    nextPage,
    query,
    passageHtml,
    singleViewUrl,
    dictIframeSrc,
    layoutStateClass,
  };
}

/**
 * Renders the reader sticky quick-navigation bar containing essential chapter jump
 * controls and the expandable secondary toolbar.
 */
export function renderReaderStickyBar(ctx: ReaderRenderContext): string {
  const { work, pageDotId, prevPage, nextPage, query } = ctx;
  const prevPageUrl = buildReaderPageUrl(work, prevPage, { query });
  const nextPageUrl = buildReaderPageUrl(work, nextPage, { query });

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

          <!-- Center: Work/Chapter Title + Section Jump Dropdown Trigger -->
          <div class="reader-sticky-form" id="reader-jump-form">
            <div class="sticky-center-group">
              <div class="sticky-title-wrapper" title="${he.escape(
                work.title
              )}">
                <span class="sticky-work-title">${he.escape(
                  work.shortTitle || work.title
                )}</span>
              </div>

              <div class="sticky-jump-box">
                <a href="#reader-toc-drawer"
                   class="reader-btn sticky-section-btn"
                   id="reader-toc-btn"
                   role="button"
                   aria-expanded="false"
                   aria-controls="reader-toc-drawer"
                   title="Contents & Sections (T)">
                  <span class="jump-glyph" aria-hidden="true">&sect;</span>
                  <span class="jump-val">${pageDotId}</span>
                  <svg class="jump-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <!-- Right Controls: Next Arrow + Appearance & Typography Settings Popover Trigger -->
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

            <!-- Appearance & Typography Settings Popover Trigger -->
            <button type="button"
                    class="reader-btn reader-settings-btn"
                    id="reader-settings-btn"
                    aria-expanded="false"
                    aria-controls="reader-settings-popover"
                    aria-label="Appearance &amp; Typography"
                    title="Appearance &amp; Typography">
              <span class="settings-glyph" aria-hidden="true">Aa</span>
            </button>
          </div>
        </div>

      </header>`;
}

/**
 * Renders the main reading text card containing passage header metadata,
 * the Latin text article body, continuation buttons, and library catalog link.
 */
export function renderReaderTextCard(ctx: ReaderRenderContext): string {
  const { work, activePage, passageHtml, prevPage, nextPage, query } = ctx;
  const prevPageUrl = buildReaderPageUrl(work, prevPage, { query });
  const nextPageUrl = buildReaderPageUrl(work, nextPage, { query });
  const prevLabel = prevPage
    ? getDifferentialCitationLabel(activePage.id, prevPage.id, work.textParts)
    : "";
  const nextLabel = nextPage
    ? getDifferentialCitationLabel(activePage.id, nextPage.id, work.textParts)
    : "";
  const notesHtml = activePage.notesHtml ?? "";

  return `          <div class="reader-text-card">
            
            <header class="reader-text-card-header">
              <div class="reader-text-meta">
                <span class="reader-author-tag">${he.escape(work.author)}</span>
                <span class="reader-meta-sep">&middot;</span>
                <span class="reader-work-tag">${he.escape(work.title)}</span>
                <a href="#reader-work-about" class="reader-about-link" title="About this text" aria-label="About this text"><span aria-hidden="true">ⓘ</span></a>
              </div>
              <h1 class="reader-passage-heading" aria-live="polite">${he.escape(
                activePage.title
              )}</h1>
            </header>

            <!-- Reader Passage Container -->
            <article class="reader-passage" id="reader-passage">
              ${passageHtml}
            </article>

            <!-- Critical Apparatus Footnotes (empty for works without notes) -->
            ${notesHtml}

            <!-- Scholarly Attribution & Work Metadata (Adopted into companion panel by JS) -->
            ${renderReaderAboutSection(work)}

            <!-- Bottom Paging Continuation Actions & Prototype Switcher -->
            <footer class="reader-passage-footer">
              <nav class="reader-continuation-actions" aria-label="Chapter Pagination">
                ${
                  prevPage
                    ? `<a href="${prevPageUrl}" class="reader-continuation-card reader-return-btn prev-card" rel="prev">
                        <span class="continuation-kicker">&larr; Previous</span>
                        <span class="continuation-title">${he.escape(
                          prevLabel
                        )}</span>
                       </a>`
                    : ""
                }
                ${
                  nextPage
                    ? `<a href="${nextPageUrl}" class="reader-continuation-card reader-continue-btn next-card" rel="next">
                        <span class="continuation-kicker">Next &rarr;</span>
                        <span class="continuation-title">${he.escape(
                          nextLabel
                        )}</span>
                       </a>`
                    : ""
                }
              </nav>

              <!-- Return to Library Link -->
              <div class="reader-library-nav">
                <a href="/v2/library" class="reader-library-link">&larr; Return to Library Catalog</a>
              </div>
            </footer>

          </div>`;
}

/**
 * Renders the main reading text card containing passage header metadata,
 * the Latin text article body, continuation buttons, and library catalog link.
 */
export function renderReaderTextPanel(ctx: ReaderRenderContext): string {
  return `        <!-- Left Column: Reading Text Canvas -->
        <section class="reader-text-panel" aria-label="Reading Text">
${renderReaderTextCard(ctx)}
        </section>`;
}

/**
 * Renders the desktop splitter and dictionary panel (mobile bottom sheet)
 * containing word definition teasers and the embedded dictionary iframe.
 */
export function renderReaderDictPanel(ctx: ReaderRenderContext): string {
  const { work, activePage, query, dictIframeSrc } = ctx;
  const activePageUrl = buildReaderPageUrl(work, activePage, {
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
              ${
                query
                  ? `<span class="reader-sheet-label">Definitions for <strong>${he.escape(
                      query
                    )}</strong></span>
                     <a href="${activePageUrl}" class="reader-sheet-close" aria-label="Close dictionary panel" title="Close">✕</a>`
                  : `<a href="#reader-dict" class="reader-sheet-label reader-sheet-open-link" title="Open Dictionary Search">
                       <span class="reader-teaser-nojs">Open Dictionary Search &uarr;</span>
                       <span class="reader-teaser-js">Tap any word to view definitions</span>
                     </a>
                     <a href="#" class="reader-sheet-close reader-sheet-close-target" aria-label="Close dictionary panel" title="Close">✕</a>`
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
    <morcus-reader-view class="reader-view"
      data-work="${ctx.work.id}"
      data-page="${ctx.pageDotId}"
      data-author="${ctx.work.urlAuthor}"
      data-name="${ctx.work.urlName}"
      data-has-macra="${ctx.work.hasMacra}"
      data-has-translation="${ctx.work.hasTranslation}">

${renderReaderStickyBar(ctx)}

      <!-- Backdrop overlay for Table of Contents (TOC) dropdown dismissal -->
      <div id="reader-toc-backdrop" class="reader-toc-backdrop" hidden></div>

      <!-- Backdrop overlay for Reader Settings popover dismissal -->
      <div id="reader-settings-backdrop" class="reader-settings-backdrop" hidden></div>

      <!-- Contained Table of Contents (TOC) Dropdown -->
      ${renderTocDrawer({
        work: ctx.work,
        activePageIndex: ctx.activePageIndex,
        query: ctx.query,
      })}

      <!-- Floating Confirmation Toast -->
      <div id="reader-toast" class="reader-toast" aria-live="polite"></div>

      <!-- Main Split Layout -->
      <div class="reader-split-layout ${ctx.layoutStateClass}">
${renderReaderTextPanel(ctx)}
${renderReaderDictPanel(ctx)}
      </div>

${renderReaderSettingsPopover({ hasMacra: ctx.work.hasMacra })}

    </morcus-reader-view>
  `;
}

export async function renderReaderPartialHtml(
  options: ReaderPageOptions = {}
): Promise<string> {
  const ctx = await resolveReaderContext(options);
  return renderReaderTextCard(ctx);
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
