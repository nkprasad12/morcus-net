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
import type { DocumentAttribution } from "@/common/library/library_types";
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
import { renderTocTriggerHtml } from "@/web/ui/reader/reader_toc.common";
import {
  renderReaderAboutSection,
  renderReaderSettingsPopover,
} from "@/web/ui/reader/reader_dialogs.server";
import { getFirstHighlightSectionId } from "@/web/ui/reader/reader_highlight.common";
import {
  renderReaderCompanionPanelHtml,
  renderReaderHeadingHtml as renderReaderHeadingCommonHtml,
  renderReaderNotesSlotHtml,
  renderReaderPagerArrowHtml,
  renderReaderSettingsButtonHtml as renderReaderSettingsButtonCommonHtml,
  renderReaderStickyBarHtml,
} from "@/web/ui/reader/reader_frame.common";
import { html, raw, type SafeHtml } from "@/web/ui/core/dom/html.common";
import { renderSlotTemplates, slotAttr } from "@/web/ui/core/nav/slots.common";
import {
  READER_PAGE_SLOTS,
  formatReaderPageTitle,
  type ReaderPageSlot,
} from "@/web/ui/reader/reader_slots.common";
import * as he from "he";
import { ssr } from "@/web/ui/core/server/ssr_template.server";

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
): SafeHtml {
  const { work, activePage, query } = ctx;
  const page = dir === "prev" ? ctx.prevPage : ctx.nextPage;
  const pageUrl = buildReaderPageUrl(work, page, { query });
  const label = page
    ? getDifferentialCitationLabel(activePage.id, page.id, work.textParts)
    : dir === "prev"
    ? "Previous"
    : "Next";
  return renderReaderPagerArrowHtml({
    dir,
    href: pageUrl,
    disabled: !page,
    ariaLabel: dir === "prev" ? "Previous chapter" : "Next chapter",
    title: dir === "prev" ? "Previous ([)" : "Next (])",
    label,
    id: `pager-${dir}`,
    attrs: slotAttr(`pager-${dir}`),
  });
}

/** The current page id inside the TOC trigger. A page-turn slot. */
function renderReaderPageLabel(ctx: ReaderRenderContext): SafeHtml {
  // `he.escape`, not `html`'s escaping, so the markup stays as it was; and
  // kept on one line, out of prettier's reflow.
  // prettier-ignore
  return html`<span class="jump-val" ${raw(slotAttr("page-label"))}>${raw(he.escape(ctx.pageDotId))}</span>`;
}

/**
 * Renders the reader sticky quick-navigation bar containing essential chapter jump
 * controls and the expandable secondary toolbar.
 */
export function renderReaderStickyBar(ctx: ReaderRenderContext): string {
  const { work } = ctx;
  return renderReaderStickyBarHtml({
    prevHtml: renderReaderPagerLink(ctx, "prev"),
    centerHtml: renderTocTriggerHtml({
      title: work.title,
      shortTitle: work.shortTitle || work.title,
      pageLabelHtml: renderReaderPageLabel(ctx),
    }),
    nextHtml: renderReaderPagerLink(ctx, "next"),
    centerId: "reader-jump-form",
  });
}

/**
 * The `Aa` trigger and the passage heading live in the browser-safe
 * `reader_frame.common.ts`; these wrappers keep the server's string API.
 */
export function renderReaderSettingsButtonHtml(): string {
  return String(renderReaderSettingsButtonCommonHtml());
}

/** See `renderReaderHeadingHtml` in `reader_frame.common.ts`. */
export function renderReaderHeadingHtml(title: string, href?: string): string {
  return String(renderReaderHeadingCommonHtml(title, href));
}

/** Compact source credit beneath the passage heading, linking to the About tab. */
const HEADER_ATTRIBUTION_LABELS: Record<DocumentAttribution, string> = {
  perseus: "Text kindly provided by Perseus",
  hypotactic: "Text kindly provided by Hypotactic",
  publicDomain: "Text from the public domain",
  theLatinLibrary: "Text kindly provided by The Latin Library",
};

/**
 * Renders the main reading text card containing passage header metadata,
 * the Latin text article body, continuation buttons, and library catalog link.
 */
function renderReaderTextCard(ctx: ReaderRenderContext): string {
  const { work, activePage, passageHtml, prevPage, nextPage, query } = ctx;
  const pageUrl = buildReaderPageUrl(work, activePage);
  const prevPageUrl = buildReaderPageUrl(work, prevPage, { query });
  const nextPageUrl = buildReaderPageUrl(work, nextPage, { query });
  const prevLabel = prevPage
    ? getDifferentialCitationLabel(activePage.id, prevPage.id, work.textParts)
    : "";
  const nextLabel = nextPage
    ? getDifferentialCitationLabel(activePage.id, nextPage.id, work.textParts)
    : "";

  return ssr`<div class="reader-text-card" ${slotAttr("text")}>
            
            <header class="reader-text-card-header">
              <div class="reader-text-meta">
                <span class="reader-author-tag">${he.escape(work.author)}</span>
                <span class="reader-meta-sep">&middot;</span>
                <span class="reader-work-tag" title="${he.escape(
                  work.title
                )}">${he.escape(work.shortTitle || work.title)}</span>
              </div>
              ${renderReaderHeadingHtml(activePage.title, pageUrl)}
              <p class="reader-header-attribution"><a href="#panel-view-about" class="reader-attribution-link">${
                HEADER_ATTRIBUTION_LABELS[work.attribution]
              }<span aria-hidden="true"> &#x24D8;</span></a></p>
            </header>

            <article class="reader-passage" id="reader-passage">
              ${passageHtml}
            </article>

            <footer class="reader-passage-footer">
              <nav class="reader-continuation-actions" aria-label="Chapter Pagination">
                ${
                  prevPage
                    ? ssr`<a href="${prevPageUrl}" class="reader-continuation-card reader-return-btn prev-card" rel="prev">
                        <span class="continuation-kicker">&larr; Previous</span>
                        <span class="continuation-title">${he.escape(
                          prevLabel
                        )}</span>
                       </a>`
                    : ""
                }
                ${
                  nextPage
                    ? ssr`<a href="${nextPageUrl}" class="reader-continuation-card reader-continue-btn next-card" rel="next">
                        <span class="continuation-kicker">Next &rarr;</span>
                        <span class="continuation-title">${he.escape(
                          nextLabel
                        )}</span>
                       </a>`
                    : ""
                }
              </nav>

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
  return ssr`<section class="reader-text-panel" aria-label="Reading Text">
${textCardHtml}
        </section>`;
}

/**
 * Renders the desktop splitter and dictionary panel (mobile bottom sheet)
 * containing word definition teasers and the embedded dictionary iframe.
 */
export function renderReaderDictPanel(ctx: ReaderRenderContext): string {
  const { work, activePage, query, singleViewUrl, dictIframeSrc } = ctx;
  return renderReaderDictPanelHtml({
    query,
    dictIframeSrc,
    closeHref: singleViewUrl,
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

/** Server-rendered markup (already escaped), for the shared renderers. */
function trustedHtml(markup: string): SafeHtml {
  return html`${raw(markup)}`;
}

/**
 * The page's notes, as the `notes` page-turn slot
 * (`renderReaderNotesSlotHtml` in `reader_frame.common.ts`).
 */
export function renderReaderNotesSlot(notesHtml: string): string {
  return renderReaderNotesSlotHtml(trustedHtml(notesHtml));
}

/**
 * The desktop splitter plus the dictionary panel (the bottom sheet on mobile),
 * for any page that hosts the reader frame. The markup is shared with
 * client-rendered readers (`renderReaderCompanionPanelHtml` in
 * `reader_frame.common.ts`).
 */
export function renderReaderDictPanelHtml(
  options: ReaderDictPanelOptions
): string {
  const { companion } = options;
  return renderReaderCompanionPanelHtml({
    query: options.query,
    dictIframeSrc: options.dictIframeSrc,
    closeHref: options.closeHref,
    companion: companion && {
      notesHtml: trustedHtml(companion.notesHtml),
      aboutHtml: trustedHtml(companion.aboutHtml),
      hasTranslation: companion.hasTranslation,
    },
  });
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
    .map(([key, value]) => `\ndata-${key}="${he.escape(value)}"`)
    .join("");
  return ssr`
    <morcus-reader-view class="reader-view"${dataAttrs}>

      ${options.tocHtml}

      <span id="reader-dict-dismissed" class="reader-drawer-dismiss-target" aria-hidden="true"></span>

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
    return ssr`
<div class="reader-translation-empty">
  <p>No translation available for this page.</p>
</div>
        `.trim();
  }
  return ssr`
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
    workTag: ctx.work.shortTitle || ctx.work.title,
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
