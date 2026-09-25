import {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/v2/v2_types";
import { NavTreeNode } from "@/common/library/library_types";
import { citationToString } from "@/web/v2/reader/reader_types.server";
import * as he from "he";

export interface ReaderPageUrlOptions {
  viewMode?: "single" | "parallel";
  query?: string;
  matchText?: string;
}

/**
 * Builds the canonical URL for a reader page within a work, preserving optional
 * view mode ("single" | "parallel"), search query, and matchText highlight ranges.
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
  if (options.matchText) params.set("matchText", options.matchText);
  const qStr = params.toString() ? `?${params.toString()}` : "";
  const pageId = Array.isArray(page.id) ? citationToString(page.id) : page.id;
  return `/v2/reader/${work.urlAuthor}/${work.urlName}/${pageId}${qStr}`;
}

export interface RenderTocItemsOptions {
  pages?: V2PreprocessedPage[];
  work: Pick<V2PreprocessedWork, "urlAuthor" | "urlName"> & {
    pages?: V2PreprocessedPage[];
    textParts?: string[];
    navTree?: NavTreeNode;
  };
  activePageIndex: number;
  viewMode?: "single" | "parallel";
  query?: string;
}

function normalizeId(id: string | string[]): string {
  return Array.isArray(id) ? id.join(".") : String(id);
}

function buildNavTreeFromPages(pages: V2PreprocessedPage[]): NavTreeNode {
  const root: NavTreeNode = { id: [], children: [] };
  for (const p of pages) {
    const segments = Array.isArray(p.id) ? p.id : String(p.id).split(".");
    let current = root;
    for (let i = 0; i < segments.length; i++) {
      const subId = segments.slice(0, i + 1);
      let child = current.children.find(
        (c) =>
          c.id.length === subId.length &&
          c.id.every((seg, idx) => seg === subId[idx])
      );
      if (!child) {
        child = { id: subId, children: [] };
        current.children.push(child);
      }
      current = child;
    }
  }
  return root;
}

/**
 * Renders the hierarchical tree of chapters and sections inside the TOC drawer.
 */
export function renderTocItemsHtml(options: RenderTocItemsOptions): string {
  const { activePageIndex, work, viewMode, query } = options;
  const pages = options.pages ?? work.pages ?? [];
  const textParts = work.textParts ?? [];

  const pageMap = new Map<string, V2PreprocessedPage>();
  for (const p of pages) {
    pageMap.set(normalizeId(p.id), p);
  }

  const activePage = pages[activePageIndex];
  const activeId = activePage ? normalizeId(activePage.id) : "";

  const tree =
    work.navTree && work.navTree.children && work.navTree.children.length > 0
      ? work.navTree
      : buildNavTreeFromPages(pages);

  function renderNode(node: NavTreeNode): string {
    const key = node.id.join(".");
    const partName = textParts[node.id.length - 1] || "section";
    const coord = node.id[node.id.length - 1] || "";
    const formattedPart = partName.charAt(0).toUpperCase() + partName.slice(1);
    const label = coord ? `${formattedPart} ${coord}` : "Contents";

    if (node.children.length === 0) {
      const page = pageMap.get(key);
      const pageUrl = buildReaderPageUrl(work, page ?? null, {
        viewMode,
        query,
      });
      const isCurrent = key === activeId;
      return `
        <a href="${pageUrl}"
           class="reader-toc-item ${isCurrent ? "active" : ""}"
           data-page-id="${he.escape(key)}"
           ${isCurrent ? 'aria-current="page"' : ""}>
          <span class="reader-toc-item-title">${he.escape(label)}</span>
          <span class="reader-toc-item-id">&sect; ${he.escape(key)}</span>
        </a>
      `;
    }

    const isOpen = activeId === key || activeId.startsWith(key + ".");
    const childrenHtml = node.children
      .map((child) => renderNode(child))
      .join("\n");

    return `
      <details class="reader-toc-group" ${isOpen ? "open" : ""}>
        <summary class="reader-toc-summary">
          <span class="reader-toc-chevron" aria-hidden="true">▸</span>
          <span class="reader-toc-group-label">${he.escape(label)}</span>
        </summary>
        <div class="reader-toc-group-children">
          ${childrenHtml}
        </div>
      </details>
    `;
  }

  return tree.children.map((child) => renderNode(child)).join("\n");
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
    work,
    activePageIndex,
    viewMode,
    query,
  });

  const pages = work.pages ?? [];
  const activePage = pages[activePageIndex] ?? pages[0];
  const exampleId = activePage ? normalizeId(activePage.id) : "1.1";
  const formAction = `/v2/reader/${he.escape(work.urlAuthor)}/${he.escape(
    work.urlName
  )}`;
  const hiddenQueryInput = query
    ? `<input type="hidden" name="q" value="${he.escape(query)}" />`
    : "";

  return `      <!-- Contained Table of Contents (TOC) Drawer -->
      <div id="reader-toc-drawer"
           class="reader-toc-drawer"
           role="dialog"
           aria-label="Table of Contents"
           hidden>
        <div class="reader-toc-header">
          <form class="reader-toc-search-form"
                action="${formAction}"
                method="GET">
            ${hiddenQueryInput}
            <span class="reader-toc-search-icon" aria-hidden="true">&sect;</span>
            <input type="text"
                   name="jump"
                   id="reader-toc-search-input"
                   class="reader-toc-search-input"
                   placeholder="Go to section (e.g. ${he.escape(
                     exampleId
                   )}) or filter…"
                   aria-label="Go to section or filter contents"
                   autocomplete="off"
                   spellcheck="false" />
            <kbd class="reader-toc-search-kbd" aria-hidden="true" title="Press Enter to go">&crarr;</kbd>
          </form>
          <a href="#"
             class="reader-toc-close-btn"
             id="reader-toc-close-btn"
             role="button"
             aria-label="Close table of contents">&times;</a>
        </div>

        <div class="reader-toc-list" id="reader-toc-list">
          ${tocItemsHtml}
          <div id="reader-toc-empty" class="reader-toc-empty" hidden>
            No matching sections &mdash; press Enter to jump
          </div>
        </div>
      </div>`;
}
