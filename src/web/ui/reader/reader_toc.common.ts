/**
 * Browser-safe markup for the reader's table of contents: the sticky bar's
 * section button (`#reader-toc-btn`) and the contents dialog
 * (`#reader-toc-drawer`) it opens.
 *
 * Rendered by the server readers (`reader_toc.server.ts` and
 * `reader.server.ts`, for library and external texts) and by the
 * client-rendered Experimental Texts reader
 * (`experimental_texts/experimental_text_view_adapter.client.ts`), so every reader has the same
 * contents dialog, which `ReaderTocController` (`reader_toc.client.ts`)
 * enhances the same way.
 *
 * This is a `.common.ts` that reaches the client bundle, so it must not import
 * `he`, `renderIconSvg` / `ICON_PATHS`, or any `.server.ts` module. Escaping
 * uses {@link escapeTocText}, which matches `he.escape` byte for byte. The
 * server's markup is unchanged except that contents hrefs, which used to be
 * inserted unescaped, are now escaped too (a no-op for ordinary slugs).
 */

import {
  html,
  joinHtml,
  raw,
  type SafeHtml,
} from "@/web/ui/core/dom/html.common";
import {
  ICON_CLOSE,
  ICON_STROKE_CHEVRON_DOWN,
} from "@/web/ui/core/widgets/icons.common";

const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&#x27;",
  "<": "&lt;",
  ">": "&gt;",
  "`": "&#x60;",
};

/**
 * Escapes text for HTML text and attribute values, exactly as `he.escape`
 * does, so markup built here matches the server's `he`-escaped markup.
 */
export function escapeTocText(value: string): string {
  return value.replace(/["&'<>`]/g, (c) => TEXT_ESCAPES[c]);
}

/** Escaped text, for interpolation into an `html` template. */
function text(value: string) {
  return raw(escapeTocText(value));
}

/** An outline icon, drawn exactly as `renderIconSvg` draws stroke icons. */
function strokeIconSvg(
  path: string,
  className: string,
  size: number,
  strokeWidth: number
): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" class="${className}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"></path></svg>`;
}

/** One page in the contents. */
export interface TocItem {
  /** The page's URL. */
  readonly href: string;
  /** The page id (`data-page-id`), which the contents filter matches. */
  readonly pageId: string;
  /** The page's title, e.g. `Chapter 2` or `col. 529`. */
  readonly label: string;
  /** The citation shown after `§`, e.g. `1.2`; omitted when absent. */
  readonly citation?: string;
  /** Whether this is the page being read (`.active`, `aria-current`). */
  readonly active?: boolean;
}

/**
 * A `.reader-toc-item` link. The server pre-renders these without `active`
 * and splices the active state in per request (`renderTocItemsHtml`); the
 * markup here is what that splice produces.
 */
export function renderTocItemHtml(item: TocItem): SafeHtml {
  const cls = item.active ? "reader-toc-item active" : "reader-toc-item";
  const current = item.active ? ' aria-current="page"' : "";
  const citation =
    item.citation === undefined
      ? ""
      : `<span class="reader-toc-item-id">&sect; ${escapeTocText(
          item.citation
        )}</span>`;
  // One line, as the server pre-renders it (`preRenderTocItemsHtml`).
  // prettier-ignore
  return html`<a href="${text(item.href)}" class="${raw(cls)}" data-page-id="${text(item.pageId)}"${raw(current)}><span class="reader-toc-item-title">${text(item.label)}</span>${raw(citation)}</a>`;
}

/** The link at the foot of the contents, back to where the work came from. */
export interface TocFooterLink {
  readonly href: string;
  /** Shown after a `←`, e.g. `Return to Library Catalog`. */
  readonly label: string;
}

export interface TocDrawerOptions {
  /** The section search form's action (the No-JS jump). */
  readonly formAction: string;
  /** Hidden inputs the jump form submits, as `[name, value]` pairs. */
  readonly hiddenFields?: ReadonlyArray<readonly [string, string]>;
  /** The page id shown in the search placeholder (`e.g. 1.1`). */
  readonly exampleId: string;
  /** The rendered `.reader-toc-item` / `.reader-toc-group` tree. */
  readonly itemsHtml: SafeHtml;
  /** A jump that matched no section, shown in the search box and a banner. */
  readonly jumpMiss?: string;
  readonly footer: TocFooterLink;
}

/**
 * The Table of Contents (TOC) dialog. Without JS, the trigger links to
 * `#reader-toc-drawer` and `:target` CSS shows it; the close link goes to
 * `#`. With JS, `ReaderTocController` opens it with `showModal()`.
 */
export function renderTocDrawerHtml(options: TocDrawerOptions): SafeHtml {
  const { jumpMiss } = options;
  const hiddenInputs = (options.hiddenFields ?? [])
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeTocText(
          name
        )}" value="${escapeTocText(value)}" />`
    )
    .join("");
  const searchValueAttr = jumpMiss
    ? `\nvalue="${escapeTocText(jumpMiss)}"`
    : "";
  const missBannerHtml = jumpMiss
    ? `\n<p class="reader-toc-miss" role="status">No section &ldquo;${escapeTocText(
        jumpMiss
      )}&rdquo; in this work.</p>`
    : "";
  const closeIcon = strokeIconSvg(ICON_CLOSE, "dialog-close-icon", 18, 2);

  // The template's line breaks and attribute order are the markup's (see
  // `dedentTemplateStrings`), so it is kept out of prettier's reflow.
  // prettier-ignore
  return html`<dialog id="reader-toc-drawer"
              class="anchored-popover reader-toc-drawer"
              aria-label="Table of Contents">
        <div class="reader-toc-header">
          <form class="reader-toc-search-form"
                action="${text(options.formAction)}"
                method="GET">
            ${raw(hiddenInputs)}
            <span class="reader-toc-search-icon" aria-hidden="true">&sect;</span>
            <input type="text"
                   name="jump"
                   id="reader-toc-search-input"
                   class="reader-toc-search-input"${raw(searchValueAttr)}
                   placeholder="Go to section (e.g. ${text(options.exampleId)}) or filter…"
                   aria-label="Go to section or filter contents"
                   autocomplete="off"
                   spellcheck="false" />
            <kbd class="reader-toc-search-kbd" aria-hidden="true" title="Press Enter to go">&crarr;</kbd>
          </form>
          <a href="#"
             class="reader-toc-close-btn"
             id="reader-toc-close-btn"
             role="button"
             data-dialog-close
             aria-label="Close table of contents">${raw(closeIcon)}</a>
        </div>${raw(missBannerHtml)}

        <div class="reader-toc-list" id="reader-toc-list">
          ${raw(options.itemsHtml)}
          <div id="reader-toc-empty" class="reader-toc-empty" hidden>
            No matching sections &mdash; press Enter to jump
          </div>
        </div>
        <div class="reader-toc-footer">
          <a href="${text(options.footer.href)}" class="reader-library-link">&larr; ${text(options.footer.label)}</a>
        </div>
      </dialog>`;
}

export interface TocTriggerOptions {
  /** The work's full title (the tooltip). */
  readonly title: string;
  /** The work's title as shown in the bar. */
  readonly shortTitle: string;
  /** The current page's `span.jump-val`. */
  readonly pageLabelHtml: SafeHtml;
  /**
   * Whether a `§` precedes the page label: on for citations (`§ 1.2`), off
   * for labels that name their own unit (`col. 529`). Defaults to on.
   */
  readonly sectionGlyph?: boolean;
}

/**
 * The sticky bar's `.sticky-jump-box`: the work title and current page,
 * linking to `#reader-toc-drawer` (which `ReaderTocController` opens as a
 * dialog). Goes inside `.reader-sticky-bar .sticky-center-group`.
 */
export function renderTocTriggerHtml(options: TocTriggerOptions): SafeHtml {
  const glyph =
    options.sectionGlyph === false
      ? ""
      : '<span class="jump-glyph" aria-hidden="true">&sect;</span>';
  const chevron = strokeIconSvg(
    ICON_STROKE_CHEVRON_DOWN,
    "jump-chevron",
    14,
    2.5
  );
  // prettier-ignore
  return html`<div class="sticky-jump-box">
                <a href="#reader-toc-drawer"
                   class="reader-btn sticky-section-btn"
                   id="reader-toc-btn"
                   role="button"
                   aria-haspopup="dialog"
                   aria-expanded="false"
                   aria-controls="reader-toc-drawer"
                   title="Contents & Sections (T)">
                  <span class="sticky-work-title" title="${text(options.title)}">${text(options.shortTitle)}</span>
                  <span class="sticky-section-sep" aria-hidden="true">&middot;</span>
                  ${raw(glyph)}
                  ${raw(options.pageLabelHtml)}
                  ${raw(chevron)}
                </a>
              </div>`;
}

/** One page of a work whose contents are a flat list of pages. */
export interface TocPageLink {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface PageListTocDrawerOptions {
  readonly pages: readonly TocPageLink[];
  /** The index of the page being read. */
  readonly activeIndex: number;
  readonly formAction: string;
  readonly hiddenFields?: ReadonlyArray<readonly [string, string]>;
  readonly footer: TocFooterLink;
}

/**
 * The contents dialog for a work read as a flat list of pages (the
 * Experimental Texts reader: Migne columns, Latin Library pages), one
 * `.reader-toc-item` per page with the page being read marked active.
 */
export function renderPageListTocDrawerHtml(
  options: PageListTocDrawerOptions
): SafeHtml {
  const { pages, activeIndex } = options;
  const items = pages.map((page, i) =>
    renderTocItemHtml({
      href: page.href,
      pageId: page.id,
      label: page.label,
      active: i === activeIndex,
    })
  );
  const itemsHtml = html`${joinHtml(items, "\n")}`;
  return renderTocDrawerHtml({
    formAction: options.formAction,
    hiddenFields: options.hiddenFields,
    exampleId: (pages[activeIndex] ?? pages[0])?.id ?? "1",
    itemsHtml,
    footer: options.footer,
  });
}
