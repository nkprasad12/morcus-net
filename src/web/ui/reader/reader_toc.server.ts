import {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/preprocess/preprocessed_types";
import { NavTreeNode } from "@/common/library/library_types";
import { citationToString } from "@/web/ui/reader/reader_types.server";
import * as he from "he";

interface ReaderPageUrlOptions {
  query?: string;
  matchText?: string;
}

/**
 * Builds the canonical URL for a reader page within a work, preserving optional
 * search query and matchText highlight ranges.
 */
export function buildReaderPageUrl(
  work: Pick<V2PreprocessedWork, "urlAuthor" | "urlName">,
  page: V2PreprocessedPage | null,
  options: ReaderPageUrlOptions = {}
): string {
  if (!page) return "#";
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.matchText) params.set("matchText", options.matchText);
  const qStr = params.toString() ? `?${params.toString()}` : "";
  const pageId = Array.isArray(page.id) ? citationToString(page.id) : page.id;
  return `/work/${work.urlAuthor}/${work.urlName}/${pageId}${qStr}`;
}

interface PreRenderTocItemsOptions {
  pages?: V2PreprocessedPage[];
  work: Pick<V2PreprocessedWork, "urlAuthor" | "urlName"> & {
    pages?: V2PreprocessedPage[];
    textParts?: string[];
    navTree?: NavTreeNode;
  };
}

interface RenderTocItemsOptions extends PreRenderTocItemsOptions {
  work: PreRenderTocItemsOptions["work"] & {
    tocHtml?: string;
  };
  activePageIndex: number;
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
 * Pre-renders the hierarchical tree of chapters and sections inside the TOC
 * drawer without active/open state or query parameters, so `renderTocItemsHtml`
 * can splice per-request state in O(1) string replacements.
 */
export function preRenderTocItemsHtml(
  options: PreRenderTocItemsOptions
): string {
  const { work } = options;
  const pages = options.pages ?? work.pages ?? [];
  const textParts = work.textParts ?? [];

  const pageMap = new Map<string, V2PreprocessedPage>();
  for (const p of pages) {
    pageMap.set(normalizeId(p.id), p);
  }

  const tree =
    work.navTree && work.navTree.children && work.navTree.children.length > 0
      ? work.navTree
      : buildNavTreeFromPages(pages);

  function renderNode(node: NavTreeNode): string {
    const key = node.id.join(".");
    const escapedKey = he.escape(key);
    const partName = textParts[node.id.length - 1] || "section";
    const coord = node.id[node.id.length - 1] || "";
    const formattedPart = partName.charAt(0).toUpperCase() + partName.slice(1);
    const label = coord ? `${formattedPart} ${coord}` : "Contents";

    if (node.children.length === 0) {
      const page = pageMap.get(key);
      const pageUrl = buildReaderPageUrl(work, page ?? null);
      return `<a href="${pageUrl}" class="reader-toc-item" data-page-id="${escapedKey}"><span class="reader-toc-item-title">${he.escape(
        label
      )}</span><span class="reader-toc-item-id">&sect; ${escapedKey}</span></a>`;
    }

    const childrenHtml = node.children
      .map((child) => renderNode(child))
      .join("\n");

    return `<details class="reader-toc-group" data-group-id="${escapedKey}"><summary class="reader-toc-summary"><span class="reader-toc-chevron" aria-hidden="true">▸</span><span class="reader-toc-group-label">${he.escape(
      label
    )}</span></summary><div class="reader-toc-group-children">\n${childrenHtml}\n</div></details>`;
  }

  return tree.children.map((child) => renderNode(child)).join("\n");
}

/**
 * Renders the hierarchical tree of chapters and sections inside the TOC drawer,
 * splicing the active page and open ancestor `<details>` groups into the
 * pre-rendered TOC markup.
 */
export function renderTocItemsHtml(options: RenderTocItemsOptions): string {
  const { activePageIndex, work, query } = options;
  const pages = options.pages ?? work.pages ?? [];
  const canUsePreRendered =
    options.pages === undefined || options.pages === work.pages;
  let html =
    canUsePreRendered && work.tocHtml !== undefined
      ? work.tocHtml
      : preRenderTocItemsHtml(options);

  const activePage = pages[activePageIndex];
  const activeId = activePage ? normalizeId(activePage.id) : "";

  if (activeId) {
    const escapedActiveId = he.escape(activeId);
    html = html.replace(
      `class="reader-toc-item" data-page-id="${escapedActiveId}">`,
      `class="reader-toc-item active" data-page-id="${escapedActiveId}" aria-current="page">`
    );

    const segments = activeId.split(".");
    for (let i = 1; i <= segments.length; i++) {
      const prefix = he.escape(segments.slice(0, i).join("."));
      html = html.replace(
        `<details class="reader-toc-group" data-group-id="${prefix}">`,
        `<details class="reader-toc-group" data-group-id="${prefix}" open>`
      );
    }
  }

  if (query) {
    const params = new URLSearchParams();
    params.set("q", query);
    const qSuffix = `?${params.toString()}`;
    html = html.replace(/href="(\/work\/[^"]+)"/g, `href="$1${qSuffix}"`);
  }

  return html;
}

interface ReaderTocDrawerOptions {
  work: V2PreprocessedWork;
  activePageIndex: number;
  query?: string;
  jumpMiss?: string;
}

/**
 * Renders the Table of Contents (TOC) dialog. Without JS, the trigger links
 * to `#reader-toc-drawer` and `:target` CSS shows it; the close link goes to
 * `#`. With JS, `ReaderTocController` opens it with `showModal()`.
 */
export function renderTocDrawer(options: ReaderTocDrawerOptions): string {
  const { work, activePageIndex, query, jumpMiss } = options;
  const tocItemsHtml = renderTocItemsHtml({
    work,
    activePageIndex,
    query,
  });

  const pages = work.pages ?? [];
  const activePage = pages[activePageIndex] ?? pages[0];
  const exampleId = activePage ? normalizeId(activePage.id) : "1.1";
  const formAction = `/work/${he.escape(work.urlAuthor)}/${he.escape(
    work.urlName
  )}${activePage ? `/${he.escape(exampleId)}` : ""}`;
  const hiddenQueryInput = query
    ? `<input type="hidden" name="q" value="${he.escape(query)}" />`
    : "";
  const searchValueAttr = jumpMiss
    ? `\n                   value="${he.escape(jumpMiss)}"`
    : "";
  const missBannerHtml = jumpMiss
    ? `\n        <p class="reader-toc-miss" role="status">No section &ldquo;${he.escape(
        jumpMiss
      )}&rdquo; in this work.</p>`
    : "";

  return `      <!-- Table of Contents (TOC) Dialog -->
      <dialog id="reader-toc-drawer"
              class="anchored-popover reader-toc-drawer"
              aria-label="Table of Contents">
        <div class="reader-toc-header">
          <form class="reader-toc-search-form"
                action="${formAction}"
                method="GET">
            ${hiddenQueryInput}
            <span class="reader-toc-search-icon" aria-hidden="true">&sect;</span>
            <input type="text"
                   name="jump"
                   id="reader-toc-search-input"
                   class="reader-toc-search-input"${searchValueAttr}
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
             data-dialog-close
             aria-label="Close table of contents">&times;</a>
        </div>${missBannerHtml}

        <div class="reader-toc-list" id="reader-toc-list">
          ${tocItemsHtml}
          <div id="reader-toc-empty" class="reader-toc-empty" hidden>
            No matching sections &mdash; press Enter to jump
          </div>
        </div>
        <div class="reader-toc-footer">
          <a href="/library" class="reader-library-link">&larr; Return to Library Catalog</a>
        </div>
      </dialog>`;
}
