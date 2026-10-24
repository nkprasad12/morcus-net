import { renderPageShell } from "@/web/ui/shell/page_shell.server";
import { buildDictUrl } from "@/web/ui/dict/search/dict_params.common";
import {
  DEFAULT_PANEL_SCALE,
  dictScaleFor,
} from "@/web/ui/reader/reader_scale.common";
import {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/preprocess/preprocessed_types";
import {
  getV2Work,
  resolvePageInWork,
} from "@/web/ui/reader/reader_loader.server";
import {
  CitationId,
  citationToString,
  getDifferentialCitationLabel,
} from "@/web/ui/reader/reader_types.server";
import {
  buildReaderPageUrl,
  renderTocDrawer,
} from "@/web/ui/reader/reader_toc.server";
import {
  renderReaderAboutSection,
  renderReaderSettingsPopover,
} from "@/web/ui/reader/reader_dialogs.server";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import { getFirstHighlightSectionId } from "@/web/ui/reader/reader_highlight.common";
import { renderSlotTemplates, slotAttr } from "@/web/ui/core/nav/slots.common";
import {
  READER_PAGE_SLOTS,
  formatReaderPageTitle,
  type ReaderPageSlot,
} from "@/web/ui/reader/reader_slots.common";
import * as he from "he";

export interface ReaderPageOptions {
  workId?: string;
  pageId?: string | CitationId;
  query?: string;
  matchText?: string;
  jumpMiss?: string;
  work?: V2PreprocessedWork;
}

interface ReaderRenderContext {
  work: V2PreprocessedWork;
  activePage: V2PreprocessedPage;
  activePageIndex: number;
  pageDotId: string;
  prevPage: V2PreprocessedPage | null;
  nextPage: V2PreprocessedPage | null;
  query: string;
  matchText: string;
  jumpMiss: string;
  passageHtml: string;
  singleViewUrl: string;
  dictIframeSrc: string;
  layoutStateClass: string;
}

/**
 * The embedded dictionary's src for a reader lookup. Lookups from Latin text
 * force inflected search (`o=1`) and start in the Latin lexica (`lang=La`).
 * It carries the default side-panel size at the desktop breakpoint; the
 * client corrects `scale=` for a saved size or a phone (`reader_view.client.ts`).
 */
export function buildReaderDictIframeSrc(query: string): string {
  if (!query) return "/dicts?embedded=1";
  const url = buildDictUrl({
    q: query,
    inflected: true,
    lang: "La",
    embedded: "1",
  });
  return `${url}&scale=${dictScaleFor(DEFAULT_PANEL_SCALE, false)}`;
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
  options: ReaderPageOptions
): Promise<ReaderRenderContext> {
  const query = options.query?.trim() ?? "";
  const matchText = options.matchText?.trim() ?? "";
  const jumpMiss = options.jumpMiss?.trim() ?? "";

  const work: V2PreprocessedWork | null =
    options.work ?? (options.workId ? await getV2Work(options.workId) : null);

  if (!work) {
    throw new Error(
      `Classical work not found: ${options.workId ?? "(unspecified)"}`
    );
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
    jumpMiss,
    passageHtml,
    singleViewUrl,
    dictIframeSrc,
    layoutStateClass,
  };
}

/**
 * The sticky bar's link to the previous or next page (`#pager-prev` /
 * `#pager-next`), disabled at either end of the work. A page-turn slot.
 */
function renderReaderPagerLink(
  ctx: ReaderRenderContext,
  dir: "prev" | "next"
): string {
  const { work, activePage, query } = ctx;
  const page = dir === "prev" ? ctx.prevPage : ctx.nextPage;
  const pageUrl = buildReaderPageUrl(work, page, { query });
  const label = page
    ? getDifferentialCitationLabel(activePage.id, page.id, work.textParts)
    : dir === "prev"
    ? "Previous"
    : "Next";
  const disabledAttrs = !page ? 'aria-disabled="true" tabindex="-1"' : "";

  if (dir === "prev") {
    return `          <a href="${pageUrl}"
             class="reader-btn reader-nav-arrow ${!page ? "disabled" : ""}"
             id="pager-prev"
             ${disabledAttrs}
             aria-label="Previous chapter"
             title="Previous ([)"
             ${slotAttr("pager-prev")}>
            <span class="pager-arrow" aria-hidden="true">&larr;</span>
            <svg class="pager-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
            <span class="pager-label">${he.escape(label)}</span>
          </a>`;
  }
  return `            <a href="${pageUrl}"
               class="reader-btn reader-nav-arrow ${!page ? "disabled" : ""}"
               id="pager-next"
               ${disabledAttrs}
               aria-label="Next chapter"
               title="Next (])"
               ${slotAttr("pager-next")}>
              <span class="pager-label">${he.escape(label)}</span>
              <span class="pager-arrow" aria-hidden="true">&rarr;</span>
              <svg class="pager-chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </a>`;
}

/** The current page id inside the TOC trigger. A page-turn slot. */
function renderReaderPageLabel(ctx: ReaderRenderContext): string {
  return `<span class="jump-val" ${slotAttr("page-label")}>${he.escape(
    ctx.pageDotId
  )}</span>`;
}

/**
 * Renders the reader sticky quick-navigation bar containing essential chapter jump
 * controls and the expandable secondary toolbar.
 */
export function renderReaderStickyBar(ctx: ReaderRenderContext): string {
  const { work } = ctx;

  return `      <!-- Sticky Quick Navigation Bar / Desktop Paper Sheet Running Header -->
      <header class="reader-sticky-bar" role="toolbar" aria-label="Reader Quick Navigation">
        
        <!-- Primary Row: Running Margin Pager Links, Work & Section Picker, and Settings Trigger -->
        <div class="sticky-primary-row">
${renderReaderPagerLink(ctx, "prev")}

          <!-- Center: Running Author + Work Title + Section Jump Dropdown Trigger -->
          <div class="reader-sticky-form" id="reader-jump-form">
            <div class="sticky-center-group">
              <div class="sticky-jump-box">
                <a href="#reader-toc-drawer"
                   class="reader-btn sticky-section-btn"
                   id="reader-toc-btn"
                   role="button"
                   aria-haspopup="dialog"
                   aria-expanded="false"
                   aria-controls="reader-toc-drawer"
                   title="Contents & Sections (T)">
                  <span class="sticky-work-title" title="${he.escape(
                    work.title
                  )}">${he.escape(work.shortTitle || work.title)}</span>
                  <span class="sticky-section-sep" aria-hidden="true">&middot;</span>
                  <span class="jump-glyph" aria-hidden="true">&sect;</span>
                  ${renderReaderPageLabel(ctx)}
                  <svg class="jump-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <!-- Right Controls: Next Arrow + Appearance & Typography Settings Popover Trigger -->
          <div class="sticky-primary-right">
${renderReaderPagerLink(ctx, "next")}

            <span class="running-right-sep" aria-hidden="true">&middot;</span>

            <!-- Appearance & Typography Settings Popover Trigger -->
${renderReaderSettingsButtonHtml()}
          </div>
        </div>

      </header>`;
}

/**
 * The `Aa` trigger for the reader settings dialog. `MorcusReaderSettings` finds it
 * by id, so every reader bar must render this exact button.
 */
export function renderReaderSettingsButtonHtml(): string {
  return `            <button type="button"
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
 * Renders the main reading text card containing passage header metadata,
 * the Latin text article body, continuation buttons, and library catalog link.
 */
function renderReaderTextCard(ctx: ReaderRenderContext): string {
  const { work, activePage, passageHtml, prevPage, nextPage, query } = ctx;
  const prevPageUrl = buildReaderPageUrl(work, prevPage, { query });
  const nextPageUrl = buildReaderPageUrl(work, nextPage, { query });
  const prevLabel = prevPage
    ? getDifferentialCitationLabel(activePage.id, prevPage.id, work.textParts)
    : "";
  const nextLabel = nextPage
    ? getDifferentialCitationLabel(activePage.id, nextPage.id, work.textParts)
    : "";

  return `          <div class="reader-text-card" ${slotAttr("text")}>
            
            <header class="reader-text-card-header">
              <div class="reader-text-meta">
                <span class="reader-author-tag">${he.escape(work.author)}</span>
                <span class="reader-meta-sep">&middot;</span>
                <span class="reader-work-tag">${he.escape(work.title)}</span>
              </div>
              <h1 class="reader-passage-heading" aria-live="polite">${he.escape(
                activePage.title
              )}</h1>
            </header>

            <!-- Reader Passage Container -->
            <article class="reader-passage" id="reader-passage">
              ${passageHtml}
            </article>

            <!-- Bottom Paging Continuation Actions -->
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
                <a href="/library" class="reader-library-link">&larr; Return to Library Catalog</a>
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
    companion: {
      notesHtml: activePage.notesHtml ?? "",
      aboutHtml: renderReaderAboutSection(work),
      hasTranslation: work.hasTranslation,
    },
  });
}

/** The tabs that sit beside the dictionary in the companion panel. */
export interface ReaderCompanionOptions {
  /** The page's notes (`V2PreprocessedPage.notesHtml`), or "" for none. */
  notesHtml: string;
  /** The work's About section, or "" for none. */
  aboutHtml: string;
  /** Adds the Translation tab. It is JS-only: the view is fetched on demand. */
  hasTranslation: boolean;
}

/** Inputs for {@link renderReaderDictPanelHtml}; nothing here is work-specific. */
interface ReaderDictPanelOptions {
  /** The active lookup, or "" when the drawer starts minimized. */
  query: string;
  dictIframeSrc: string;
  /**
   * The No-JS close link target: the current page. `#reader-dict-dismissed`
   * is appended here.
   */
  closeHref: string;
  /** Omitted for surfaces with only the dictionary (the tab bar is hidden). */
  companion?: ReaderCompanionOptions;
}

type CompanionTab = "dict" | "notes" | "translation" | "about";

const COMPANION_TABS: readonly {
  id: CompanionTab;
  label: string;
  icon: "book" | "notes" | "translation" | "info";
}[] = [
  { id: "dict", label: "Dictionary", icon: "book" },
  { id: "notes", label: "Notes", icon: "notes" },
  { id: "translation", label: "Translation", icon: "translation" },
  { id: "about", label: "About", icon: "info" },
];

/**
 * One companion tab. It is a plain link to its view, so without JS the view
 * opens via `:target` (reader_panel.css). `ReaderPanelController` adds the
 * tab roles and takes over on upgrade.
 */
function renderCompanionTab(
  tab: (typeof COMPANION_TABS)[number],
  shown: boolean
): string {
  const translation = tab.id === "translation";
  return `<a href="#panel-view-${tab.id}"
                 class="reader-panel-tab${
                   translation ? " tab-translation" : ""
                 }"
                 id="panel-tab-${tab.id}"
                 aria-label="${tab.label}"${shown ? "" : " hidden"}${
    translation ? " data-js-only" : ""
  }>
                <span class="reader-tab-icon" aria-hidden="true">${renderIconSvg(
                  tab.icon,
                  {
                    width: 14,
                    height: 14,
                    extraAttrs:
                      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
                  }
                )}</span>
                <span class="reader-tab-label">${tab.label}</span>
              </a>`;
}

/**
 * The page's notes, as the `notes` page-turn slot. The slot is a wrapper
 * inside `#panel-view-notes` so the view itself (active state, scroll
 * position) survives page turns.
 */
export function renderReaderNotesSlot(notesHtml: string): string {
  return `<div class="reader-notes-slot" ${slotAttr(
    "notes"
  )}>${notesHtml}</div>`;
}

/**
 * The desktop splitter plus the dictionary panel (the bottom sheet on mobile),
 * for any page that hosts the reader frame.
 */
export function renderReaderDictPanelHtml(
  options: ReaderDictPanelOptions
): string {
  const { query, dictIframeSrc, closeHref } = options;
  const notesHtml = options.companion?.notesHtml ?? "";
  const aboutHtml = options.companion?.aboutHtml ?? "";
  const shown: Record<CompanionTab, boolean> = {
    dict: true,
    notes: notesHtml !== "",
    translation: options.companion?.hasTranslation ?? false,
    about: aboutHtml !== "",
  };
  const hasCompanionTabs = shown.notes || shown.translation || shown.about;
  const activePageUrl = he.escape(closeHref);
  const unarmedAttr = query ? "" : "\n                      data-dict-unarmed";

  return `        <!-- Desktop Resizable Splitter Bar -->
        <div class="reader-splitter resize-handle"
             role="separator"
             tabindex="0"
             aria-orientation="vertical"
             aria-label="Resize dictionary sidebar"
             aria-valuemin="300"
             aria-valuemax="750"
             aria-valuenow="420">
          <div class="resize-grip" aria-hidden="true" data-js-only></div>
        </div>

        <!-- Right / Bottom Column: Dictionary Panel (Adaptive Sheet on Mobile) -->
        <aside class="reader-dict-panel drawer${
          query ? "" : " drawer-minimized"
        }${
    hasCompanionTabs ? " has-companion-tabs" : ""
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
              <a href="#reader-dict" class="reader-sheet-label reader-sheet-open-link" title="Open Dictionary Search">
                <span class="reader-teaser-nojs" data-nojs-only>Open Dictionary Search &uarr;</span>
                <span class="reader-teaser-js" data-js-only>Tap any word to view definitions</span>
              </a>
              <nav class="reader-panel-tabs" aria-label="Companion panel"${
                hasCompanionTabs ? "" : " hidden"
              }>
              ${COMPANION_TABS.map((tab) =>
                renderCompanionTab(tab, shown[tab.id])
              ).join("\n              ")}
              </nav>
              ${
                query
                  ? `<a href="${activePageUrl}#reader-dict-dismissed" class="reader-sheet-close" aria-label="Close dictionary panel" title="Close">✕</a>`
                  : `<a href="#reader-dict-dismissed" class="reader-sheet-close reader-sheet-close-target" aria-label="Close dictionary panel" title="Close">✕</a>`
              }
            </div>
          </div>

          <!-- Companion views. Without JS the targeted view shows (else the
               dictionary); ReaderPanelController takes over on upgrade. -->
          <div class="reader-panel-views">
            <div class="dict-iframe-container reader-panel-view" id="panel-view-dict">
              <div class="reader-dict-landing" data-js-only>
                <p class="reader-dict-landing-copy"><strong><span class="reader-dict-verb-desktop">Click</span><span class="reader-dict-verb-mobile">Tap</span> any word</strong> in the passage to look it up<span class="reader-dict-landing-shortcut">, or press <kbd class="reader-dict-kbd">/</kbd> to search</span>.</p>
              </div>
              <iframe id="dict-frame"
                      name="dict-frame"
                      src="${he.escape(dictIframeSrc)}"${unarmedAttr}
                      class="dict-iframe"
                      title="Dictionary Search and Definitions"
                      loading="lazy"></iframe>
            </div>
            <div class="reader-panel-notes reader-panel-view reader-panel-card" id="panel-view-notes" aria-live="polite">
              ${renderReaderNotesSlot(notesHtml)}
            </div>
            <div class="reader-panel-translation reader-panel-view reader-panel-card" id="panel-view-translation" aria-live="polite"></div>
            <div class="reader-panel-about reader-panel-view reader-panel-card" id="panel-view-about">
              ${aboutHtml}
            </div>
          </div>
          <button type="button"
                  class="reader-dict-back-to-top"
                  aria-label="Scroll dictionary to top"
                  title="Jump to top"
                  data-js-only>
            ${renderIconSvg("chevronUp")}
          </button>
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
function renderReaderContentHtmlFromContext(ctx: ReaderRenderContext): string {
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
      jumpMiss: ctx.jumpMiss,
    }),
    layoutStateClass: ctx.layoutStateClass,
    stickyBarHtml: renderReaderStickyBar(ctx),
    textPanelHtml: renderReaderTextPanel(ctx),
    dictPanelHtml: renderReaderDictPanel(ctx),
    hasMacra: ctx.work.hasMacra,
  });
}

/** The pieces a page supplies to {@link renderReaderFrameHtml}. */
interface ReaderFrameOptions {
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
 * contents dialog, the No-JS drawer dismiss target, the split layout, and
 * the reader settings dialog. Callers supply the work-specific parts.
 */
export function renderReaderFrameHtml(options: ReaderFrameOptions): string {
  const dataAttrs = Object.entries(options.dataAttrs)
    .map(([key, value]) => `\n      data-${key}="${he.escape(value)}"`)
    .join("");
  return `
    <morcus-reader-view class="reader-view"${dataAttrs}>

      <!-- Table of Contents (TOC) Dialog -->
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

/** Renders one page-turn slot exactly as the full page renders it. */
function renderReaderPageSlot(
  ctx: ReaderRenderContext,
  slot: ReaderPageSlot
): string {
  switch (slot) {
    case "text":
      return renderReaderTextCard(ctx);
    case "pager-prev":
      return renderReaderPagerLink(ctx, "prev");
    case "pager-next":
      return renderReaderPagerLink(ctx, "next");
    case "page-label":
      return renderReaderPageLabel(ctx);
    case "notes":
      return renderReaderNotesSlot(ctx.activePage.notesHtml ?? "");
  }
}

/**
 * The page-turn partial: every region in {@link READER_PAGE_SLOTS}, for
 * `swapSlots` in `MorcusReaderView.swapPage`.
 */
export async function renderReaderPartialHtml(
  options: ReaderPageOptions
): Promise<string> {
  const ctx = await resolveReaderContext(options);
  return renderSlotTemplates(
    READER_PAGE_SLOTS.map((slot) => [slot, renderReaderPageSlot(ctx, slot)])
  );
}

/** The work at `/work/:author/:name`, or null if there is none. */
export async function findReaderWork(
  author: string,
  name: string
): Promise<V2PreprocessedWork | null> {
  return getV2Work(`${author}/${name}`);
}

/**
 * The translation partial for `pageParam` of `work`, fetched by the
 * companion panel's Translation view, or null if the work has no translation.
 *
 * A translated work can still leave single pages untranslated (Livy's
 * translation covers only books 1-10), so such a page gets an empty-state
 * message rather than null: a 404 would read as a failed load and offer a
 * pointless retry.
 */
export function renderReaderTranslationHtml(
  work: V2PreprocessedWork,
  pageParam: string
): string | null {
  if (!work.hasTranslation) return null;
  const resolved = resolvePageInWork(work, pageParam);
  if (!resolved.matched || !resolved.page) return null;
  const page = resolved.page;
  if (!page.translationHtml) {
    return `
<div class="reader-translation-empty">
  <p>No translation available for this page.</p>
</div>
        `.trim();
  }
  return `
<div class="reader-translation-content">
  <header class="reader-translation-header">
    <span class="reader-translation-credit">Translated by ${he.escape(
      work.translator ?? "Unknown"
    )}</span>
  </header>
  <div class="reader-translation-body">
    ${page.translationHtml}
  </div>
</div>
        `.trim();
}

export async function renderReaderContentHtml(
  options: ReaderPageOptions
): Promise<string> {
  const ctx = await resolveReaderContext(options);
  return renderReaderContentHtmlFromContext(ctx);
}

export async function renderReaderPageHtml(
  options: ReaderPageOptions
): Promise<string> {
  const ctx = await resolveReaderContext(options);

  const title = formatReaderPageTitle({
    workTag: ctx.work.title,
    heading: ctx.activePage.title,
  });
  const description =
    "Read with instant click-to-lookup across multiple lexica.";
  const canonicalPath = buildReaderPageUrl(ctx.work, ctx.activePage);

  const contentHtml = renderReaderContentHtmlFromContext(ctx);

  return renderPageShell({
    title,
    description,
    canonicalPath,
    activePage: "library",
    isReader: true,
    widthSurface: "reader",
    contentHtml,
  });
}
