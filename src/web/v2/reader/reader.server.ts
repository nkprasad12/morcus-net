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
import { renderIconSvg } from "@/web/v2/core/icons.common";
import { getFirstHighlightSectionId } from "@/web/v2/reader/reader_highlight.common";
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
  matchText?: string;
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
  matchText: string;
  passageHtml: string;
  singleViewUrl: string;
  dictIframeSrc: string;
  layoutStateClass: string;
}

/**
 * The embedded dictionary's src for a reader lookup. Lookups from Latin text
 * force inflected search (`o=1`) and start in the Latin lexica (`lang=La`).
 */
export function buildReaderDictIframeSrc(query: string): string {
  return query
    ? `/v2/dicts?q=${encodeURIComponent(query)}&lang=La&o=1&embedded=1`
    : `/v2/dicts?embedded=1`;
}

/** The split layout opens the dictionary only when a lookup is active. */
export function readerLayoutStateClass(query: string): string {
  return query ? "reader-layout-active" : "reader-layout-empty";
}

/**
 * Resolves the active work, chapter, navigation links, and layout state
 * into a typed render context for reader view components.
 */
export async function resolveReaderContext(
  options: ReaderPageOptions = {}
): Promise<ReaderRenderContext> {
  const query = options.query?.trim() ?? "";
  const matchText = options.matchText?.trim() ?? "";
  const requestedId = options.workId || "caesar_de_bello_gallico";

  const work: V2PreprocessedWork | null =
    options.work ||
    (await getV2Work(requestedId)) ||
    (await getV2Work("caesar_de_bello_gallico")) ||
    (await getV2Work("phi0448.phi001.perseus-lat2"));

  if (!work) {
    throw new Error(`Classical work not found: ${requestedId}`);
  }

  // Resolve active page (falling back to the first section ID in matchText when pageId is omitted)
  const pageIdStr = options.pageId
    ? Array.isArray(options.pageId)
      ? citationToString(options.pageId)
      : String(options.pageId)
    : getFirstHighlightSectionId(matchText);

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
    matchText: matchText || undefined,
  });

  const passageHtml = activePage.singleHtml;

  const dictIframeSrc = buildReaderDictIframeSrc(query);

  const layoutStateClass = readerLayoutStateClass(query);

  return {
    work,
    activePage,
    activePageIndex,
    pageDotId,
    prevPage,
    nextPage,
    query,
    matchText,
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
  const { work, activePage, pageDotId, prevPage, nextPage, query } = ctx;
  const prevPageUrl = buildReaderPageUrl(work, prevPage, { query });
  const nextPageUrl = buildReaderPageUrl(work, nextPage, { query });
  const prevLabel = prevPage
    ? getDifferentialCitationLabel(activePage.id, prevPage.id, work.textParts)
    : "Previous";
  const nextLabel = nextPage
    ? getDifferentialCitationLabel(activePage.id, nextPage.id, work.textParts)
    : "Next";

  return `      <!-- Sticky Quick Navigation Bar / Desktop Paper Sheet Running Header -->
      <header class="reader-sticky-bar" role="toolbar" aria-label="Reader Quick Navigation">
        
        <!-- Primary Row: Running Margin Pager Links, Work & Section Picker, and Settings Trigger -->
        <div class="sticky-primary-row">
          <a href="${prevPageUrl}"
             class="reader-btn reader-nav-arrow ${!prevPage ? "disabled" : ""}"
             id="pager-prev"
             ${!prevPage ? 'aria-disabled="true" tabindex="-1"' : ""}
             aria-label="Previous chapter"
             title="Previous ([)">
            <span class="pager-arrow" aria-hidden="true">&larr;</span>
            <span class="pager-label">${he.escape(prevLabel)}</span>
          </a>

          <!-- Center: Running Author + Work Title + Section Jump Dropdown Trigger -->
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
              <span class="pager-label">${he.escape(nextLabel)}</span>
              <span class="pager-arrow" aria-hidden="true">&rarr;</span>
            </a>

            <span class="running-right-sep" aria-hidden="true">&middot;</span>

            <!-- Appearance & Typography Settings Popover Trigger -->
${renderReaderSettingsButtonHtml()}
          </div>
        </div>

      </header>`;
}

/**
 * The `Aa` trigger for the typography popover. `MorcusReaderSettings` finds it
 * by id, so every reader bar must render this exact button.
 */
export function renderReaderSettingsButtonHtml(): string {
  return `            <button type="button"
                    class="reader-btn reader-settings-btn"
                    id="reader-settings-btn"
                    aria-expanded="false"
                    aria-controls="reader-settings-popover"
                    aria-label="Appearance &amp; Typography"
                    title="Appearance &amp; Typography">
              <span class="settings-glyph" aria-hidden="true">Aa</span>
            </button>`;
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
  return renderReaderTextPanelHtml(renderReaderTextCard(ctx));
}

/** Wraps an already-rendered text card in the reader's left column. */
export function renderReaderTextPanelHtml(textCardHtml: string): string {
  return `        <!-- Left Column: Reading Text Canvas -->
        <section class="reader-text-panel" aria-label="Reading Text">
${textCardHtml}
        </section>`;
}

/**
 * Renders the desktop splitter and dictionary panel (mobile bottom sheet)
 * containing word definition teasers and the embedded dictionary iframe.
 */
export function renderReaderDictPanel(ctx: ReaderRenderContext): string {
  const { work, activePage, query, matchText, dictIframeSrc } = ctx;
  const activePageUrl = buildReaderPageUrl(work, activePage, {
    query: query || undefined,
    matchText: matchText || undefined,
  });
  return renderReaderDictPanelHtml({
    query,
    dictIframeSrc,
    closeHref: activePageUrl,
  });
}

/** Inputs for {@link renderReaderDictPanelHtml}; nothing here is work-specific. */
export interface ReaderDictPanelOptions {
  /** The active lookup, or "" when the drawer starts minimized. */
  query: string;
  dictIframeSrc: string;
  /**
   * The No-JS close link target: the current page. `#reader-dict-dismissed`
   * is appended here.
   */
  closeHref: string;
}

/**
 * The desktop splitter plus the dictionary panel (the bottom sheet on mobile),
 * for any page that hosts the reader frame.
 */
export function renderReaderDictPanelHtml(
  options: ReaderDictPanelOptions
): string {
  const { query, dictIframeSrc, closeHref } = options;
  const activePageUrl = he.escape(closeHref);

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
        <aside class="reader-dict-panel drawer${
          query ? "" : " drawer-minimized"
        }" id="reader-dict" aria-label="Dictionary">
          <!-- Mobile sheet handle & teaser bar (visible on mobile) -->
          <div class="reader-sheet-bar"
               role="separator"
               tabindex="0"
               aria-orientation="horizontal"
               aria-label="Resize dictionary drawer"
               aria-valuemin="18"
               aria-valuemax="88"
               aria-valuenow="${query ? "48" : "0"}">
            <div class="reader-sheet-handle" aria-hidden="true"></div>
            <div class="reader-sheet-teaser">
              ${
                query
                  ? `<span class="reader-sheet-label">Definitions for <strong>${he.escape(
                      query
                    )}</strong></span>
                     <a href="${activePageUrl}#reader-dict-dismissed" class="reader-sheet-close" aria-label="Close dictionary panel" title="Close">✕</a>`
                  : `<a href="#reader-dict" class="reader-sheet-label reader-sheet-open-link" title="Open Dictionary Search">
                       <span class="reader-teaser-nojs">Open Dictionary Search &uarr;</span>
                       <span class="reader-teaser-js">Tap any word to view definitions</span>
                     </a>
                     <a href="#reader-dict-dismissed" class="reader-sheet-close reader-sheet-close-target" aria-label="Close dictionary panel" title="Close">✕</a>`
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
        </aside>
        <a href="#reader-dict"
           class="reader-drawer-fab"
           aria-label="Open dictionary drawer"
           title="Open dictionary drawer">
          ${renderIconSvg("drawer", {
            width: 18,
            height: 18,
            extraAttrs:
              'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
          })}
        </a>`;
}

/**
 * Synchronous renderer converting an established ReaderRenderContext into the
 * complete reader view custom element markup (<morcus-reader-view>).
 */
export function renderReaderContentHtmlFromContext(
  ctx: ReaderRenderContext
): string {
  return renderReaderFrameHtml({
    dataAttrs: {
      work: ctx.work.id,
      page: ctx.pageDotId,
      author: ctx.work.urlAuthor,
      name: ctx.work.urlName,
      "has-macra": String(ctx.work.hasMacra),
      "has-translation": String(ctx.work.hasTranslation),
    },
    tocHtml: renderTocDrawer({
      work: ctx.work,
      activePageIndex: ctx.activePageIndex,
      query: ctx.query,
    }),
    layoutStateClass: ctx.layoutStateClass,
    stickyBarHtml: renderReaderStickyBar(ctx),
    textPanelHtml: renderReaderTextPanel(ctx),
    dictPanelHtml: renderReaderDictPanel(ctx),
    hasMacra: ctx.work.hasMacra,
  });
}

/** The pieces a page supplies to {@link renderReaderFrameHtml}. */
export interface ReaderFrameOptions {
  /**
   * `data-*` attributes for `<morcus-reader-view>`, keyed without the prefix.
   * Library pages set `work` / `author` / `name`, which turn on saved spots and
   * in-work page swaps. Pages without a work omit them, and those features
   * stay off.
   */
  dataAttrs: Record<string, string>;
  /** The contents drawer, or "" for pages with no table of contents. */
  tocHtml: string;
  layoutStateClass: string;
  stickyBarHtml: string;
  textPanelHtml: string;
  dictPanelHtml: string;
  hasMacra: boolean;
}

/**
 * The `<morcus-reader-view>` frame shared by every reading surface: the
 * popover backdrops, the No-JS drawer dismiss target, the split layout, and
 * the typography popover. Callers supply the work-specific parts.
 */
export function renderReaderFrameHtml(options: ReaderFrameOptions): string {
  const dataAttrs = Object.entries(options.dataAttrs)
    .map(([key, value]) => `\n      data-${key}="${he.escape(value)}"`)
    .join("");
  return `
    <morcus-reader-view class="reader-view"${dataAttrs}>

      <!-- Backdrop overlay for Table of Contents (TOC) dropdown dismissal -->
      <div id="reader-toc-backdrop" class="reader-toc-backdrop" hidden></div>

      <!-- Backdrop overlay for Reader Settings popover dismissal -->
      <div id="reader-settings-backdrop" class="reader-settings-backdrop" hidden></div>

      <!-- Contained Table of Contents (TOC) Dropdown -->
      ${options.tocHtml}

      <span id="reader-dict-dismissed" class="reader-drawer-dismiss-target" aria-hidden="true"></span>

      <!-- Main Split Layout -->
      <div class="reader-split-layout ${options.layoutStateClass}">
        <div class="reader-main-column">
${options.stickyBarHtml}
${options.textPanelHtml}
        </div>
${options.dictPanelHtml}
      </div>

${renderReaderSettingsPopover({ hasMacra: options.hasMacra })}

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
