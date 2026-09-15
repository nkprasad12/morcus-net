import {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/v2/v2_types";
import { citationToString } from "@/web/v2/reader/reader_types.server";
import * as he from "he";

export interface ReaderPageUrlOptions {
  viewMode?: "single" | "parallel";
  query?: string;
}

/**
 * Builds the canonical URL for a reader page within a work, preserving optional
 * view mode ("single" | "parallel") and search query.
 */
export function buildReaderPageUrl(
  work: Pick<V2PreprocessedWork, "urlAuthor" | "urlName">,
  page: V2PreprocessedPage | null,
  options: ReaderPageUrlOptions = {}
): string {
  if (!page) return "#";
  const params = new URLSearchParams();
  if (options.viewMode === "parallel") params.set("view", "parallel");
  if (options.query) params.set("q", options.query);
  const qStr = params.toString() ? `?${params.toString()}` : "";
  const pageId = Array.isArray(page.id) ? citationToString(page.id) : page.id;
  return `/v2/reader/${work.urlAuthor}/${work.urlName}/${pageId}${qStr}`;
}

export interface RenderTocItemsOptions {
  pages: V2PreprocessedPage[];
  activePageIndex: number;
  work: Pick<V2PreprocessedWork, "urlAuthor" | "urlName">;
  viewMode?: "single" | "parallel";
  query?: string;
}

/**
 * Renders the list of chapter links inside the Table of Contents drawer.
 */
export function renderTocItemsHtml(options: RenderTocItemsOptions): string {
  const { pages, activePageIndex, work, viewMode, query } = options;
  return pages
    .map((p, idx) => {
      const isCurrent = idx === activePageIndex;
      const pageUrl = buildReaderPageUrl(work, p, { viewMode, query });
      return `
        <a href="${pageUrl}"
           class="reader-toc-item ${isCurrent ? "active" : ""}"
           ${isCurrent ? 'aria-current="page"' : ""}>
          <div class="reader-toc-item-text">
            <span class="reader-toc-item-title">${he.escape(p.title)}</span>
          </div>
          <span class="reader-toc-item-id">§ ${he.escape(String(p.id))}</span>
        </a>
      `;
    })
    .join("\n");
}

export interface ReaderTocDrawerOptions {
  work: V2PreprocessedWork;
  activePageIndex: number;
  viewMode?: "single" | "parallel";
  query?: string;
}

/**
 * Renders the contained Table of Contents (TOC) drawer dialog.
 */
export function renderTocDrawer(options: ReaderTocDrawerOptions): string {
  const { work, activePageIndex, viewMode, query } = options;
  const tocItemsHtml = renderTocItemsHtml({
    pages: work.pages,
    activePageIndex,
    work,
    viewMode,
    query,
  });

  return `      <!-- Contained Table of Contents (TOC) Drawer -->
      <div id="reader-toc-drawer"
           class="reader-toc-drawer"
           role="dialog"
           aria-modal="true"
           aria-label="Table of Contents"
           hidden>
        <div class="reader-toc-header">
          <div class="reader-toc-header-left">
            <button type="button"
                    class="reader-toc-back-btn"
                    id="reader-toc-back-btn"
                    aria-label="Back to reader">
              &larr; Back
            </button>
            <span class="reader-toc-title">Table of Contents</span>
          </div>
          <button type="button"
                  class="reader-toc-close-btn"
                  id="reader-toc-close-btn"
                  aria-label="Close table of contents">&times;</button>
        </div>

        <div class="reader-toc-banner">
          <span class="reader-toc-work-title">${he.escape(
            work.author
          )} &middot; ${he.escape(work.title)}</span>
          <span class="reader-toc-scheme-label">${he.escape(
            work.textParts.join(" · ")
          )}</span>
        </div>

        <div class="reader-toc-search-box">
          <input type="text"
                 id="reader-toc-filter"
                 class="reader-toc-input"
                 placeholder="Search chapters, summaries..."
                 aria-label="Search Table of Contents">
        </div>

        <div class="reader-toc-list" id="reader-toc-list">
          ${tocItemsHtml}
        </div>
      </div>`;
}
