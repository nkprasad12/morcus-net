import {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/preprocess/preprocessed_types";
import {
  type CitationStyle,
  NavTreeNode,
} from "@/common/library/library_types";
import {
  formatCitationId,
  formatSectionLabel,
  formatSectionPath,
} from "@/common/library/section_labels";
import { citationToString } from "@/web/ui/reader/reader_types.server";
import * as he from "he";
import {
  renderTocDrawerHtml,
  renderTocItemHtml,
} from "@/web/ui/reader/reader_toc.common";

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
    citationStyle?: CitationStyle;
  };
  /**
   * Labels that replace the default `formatSectionLabel` label, keyed by the
   * dotted node id. A line-only work's single page `1` uses this to read
   * `Lines 1–414` rather than `Line 1`.
   */
  nodeLabels?: ReadonlyMap<string, string>;
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
  const citationStyle = work.citationStyle;

  const pageMap = new Map<string, V2PreprocessedPage>();
  for (const p of pages) {
    pageMap.set(normalizeId(p.id), p);
  }

  const tree =
    work.navTree && work.navTree.children && work.navTree.children.length > 0
      ? work.navTree
      : buildNavTreeFromPages(pages);

  function renderNode(node: NavTreeNode): string {
    // In Roman law works (Digest Books 30–32), a book with a single synthetic
    // `Title 0` leaf child collapses directly to the leaf page item (`Book 30`)
    // instead of rendering a redundant `Title 0` child.
    if (
      citationStyle === "roman_law" &&
      node.children.length === 1 &&
      node.children[0].children.length === 0
    ) {
      const onlyChild = node.children[0];
      const childPart = textParts[onlyChild.id.length - 1] ?? "";
      const childCoord = onlyChild.id[onlyChild.id.length - 1] ?? "";
      if (childPart.toLowerCase() === "title" && childCoord === "0") {
        return renderNode(onlyChild);
      }
    }

    const key = node.id.join(".");
    const escapedKey = he.escape(key);
    const partName = textParts[node.id.length - 1] || "section";
    const coord = node.id[node.id.length - 1] || "";
    const singleLabel = coord
      ? formatSectionLabel(
          partName,
          coord,
          node.id[node.id.length - 2],
          citationStyle
        )
      : "Contents";
    const label =
      options.nodeLabels?.get(key) ??
      (singleLabel || formatSectionPath(textParts, node.id, citationStyle));

    if (node.children.length === 0) {
      const page = pageMap.get(key);
      return renderTocItemHtml({
        href: buildReaderPageUrl(work, page ?? null),
        pageId: key,
        label,
        citation: formatCitationId(node.id, citationStyle, textParts),
      });
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
 * Renders the Table of Contents (TOC) dialog (`renderTocDrawerHtml` in
 * `reader_toc.common.ts`) for a library work.
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
  const formAction = `/work/${work.urlAuthor}/${work.urlName}${
    activePage ? `/${exampleId}` : ""
  }`;

  return renderTocDrawerHtml({
    formAction,
    hiddenFields: query ? [["q", query]] : [],
    exampleId,
    itemsHtml: tocItemsHtml,
    jumpMiss,
    romanLaw: work.citationStyle === "roman_law",
    footer: { href: "/library", label: "Return to Library Catalog" },
  });
}
