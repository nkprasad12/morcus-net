/**
 * Lenient page reader for Latin Library HTML pages (M2a).
 *
 * `extractLenientPage` sorts a page's `<body>` into title, internal navigation,
 * headings, content blocks and footer. Unlike the pilot's strict
 * `readPageContent` (`src/scripts/thelatinlibrary/page.ts`) it never throws on
 * layout quirks: anything unusual is kept as content and noted in `warnings`.
 * On every page the pilot accepts it returns the same `pageTitle`, `nav`,
 * `headings`, `paragraphs` (the same element objects) and `bodyText`, with no
 * warnings, so strict converters can be layered on top of it.
 *
 * Browser-safe: must not import `fs`, `path`, `crypto`, `node:*` or `parse5`.
 */

import {
  containsElement,
  extractText,
  findElements,
  getAttr,
  hasClass,
  hasClassIgnoreCase,
  isElement,
  isText,
  normalizeSpace,
  parseHtmlToMinimalBody,
} from "@/common/thelatinlibrary/dom_adapter";
import { detectBlockMarkers } from "@/common/thelatinlibrary/markers";
import type {
  LenientPageContent,
  LenientPageParseOptions,
  MinimalChildNode,
  MinimalElementNode,
  PageBlock,
  PageBlockKind,
} from "@/common/thelatinlibrary/page_layer_types";

/**
 * Attribute set on the `<p>` elements synthesized around loose inline content
 * that sits directly in `<body>` (or another container) outside any block.
 */
export const SYNTHETIC_PARAGRAPH_ATTR = "data-lenient-synthetic";

/** Inline elements: grouped into a synthetic paragraph when loose in a container. */
const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "acronym",
  "b",
  "bdi",
  "bdo",
  "big",
  "br",
  "cite",
  "code",
  "dfn",
  "em",
  "font",
  "i",
  "img",
  "kbd",
  "label",
  "mark",
  "nobr",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "tt",
  "u",
  "var",
  "wbr",
]);

/** Elements that carry no visible content and are skipped. */
const SKIPPED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "link",
  "meta",
  "base",
  "iframe",
  "object",
  "embed",
  "map",
  "area",
  "audio",
  "video",
  "canvas",
  "svg",
  "input",
  "button",
  "select",
  "textarea",
]);

/** Block-level tags; an element containing one of them is a container. */
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "center",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);

const SUBHEADING_TAGS = new Set(["h2", "h3", "h4", "h5", "h6"]);

/** Deepest container nesting walked before content is kept as one block. */
const MAX_CONTAINER_DEPTH = 32;

/** A centred `<div>` longer than this is content, not a heading. */
const MAX_HEADING_CHARS = 300;

const LATIN_LIBRARY_RE = /The Latin Library/;

function navTargets(nav: MinimalElementNode): string[] {
  const targets: string[] = [];
  const stack: MinimalChildNode[] = [...nav.childNodes].reverse();
  while (stack.length > 0) {
    const child = stack.pop()!;
    if (!isElement(child)) continue;
    const href = child.tagName === "a" ? getAttr(child, "href") : undefined;
    if (href?.startsWith("#")) targets.push(href.slice(1));
    for (let i = child.childNodes.length - 1; i >= 0; i--) {
      stack.push(child.childNodes[i]);
    }
  }
  return targets;
}

/**
 * A list of in-page links (`<a href="#12">12</a> ...`) with no other text,
 * whatever its class (`internal_navigation` on newer pages, `margin` on older
 * ones). Same rule as the pilot, except that a paragraph whose links only go
 * back to the top (`#top`) or that are themselves anchors (`<a href="#top"
 * name="ep_6">ad Antoninum 6</a>`, a letter heading) is content, not a jump
 * bar.
 */
export function isNavigationBlock(el: MinimalElementNode): boolean {
  if (el.tagName !== "p") return false;
  if (hasClass(el, "internal_navigation")) return true;
  const targets = navTargets(el);
  if (targets.length === 0) return false;
  if (targets.every((t) => t.length === 0 || t.toLowerCase() === "top")) {
    return false;
  }
  const links = findElements(el, (c) => c.tagName === "a");
  if (links.some((a) => getAttr(a, "name") !== undefined)) return false;
  const linkText = el.childNodes
    .filter(isElement)
    .filter((c) => c.tagName === "a")
    .map((c) => extractText(c))
    .join(" ");
  return normalizeSpace(linkText) === extractText(el);
}

const hasTag = (tag: string) => (el: MinimalElementNode) => el.tagName === tag;
const isBlockTag = (el: MinimalElementNode) => BLOCK_TAGS.has(el.tagName);

/**
 * A short run of site links such as `Caesar  The Latin Library  The Classics
 * Page`: every visible character is inside an `<a>`, and one link names the
 * site or its index.
 */
function isLinkOnlyFooter(el: MinimalElementNode, text: string): boolean {
  if (text.length === 0 || text.length > 200) return false;
  const links: MinimalElementNode[] = [];
  const stack: MinimalChildNode[] = [...el.childNodes];
  let strayText = false;
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (isText(n)) {
      if (n.value.replace(/[\s\u00a0|·•-]+/g, "").length > 0) strayText = true;
      continue;
    }
    if (!isElement(n)) continue;
    if (n.tagName === "a") {
      links.push(n);
      continue;
    }
    for (const c of n.childNodes) stack.push(c);
  }
  if (strayText || links.length === 0 || links.length > 8) return false;
  return links.some((a) => {
    const href = (getAttr(a, "href") ?? "").toLowerCase();
    return (
      LATIN_LIBRARY_RE.test(extractText(a)) ||
      /(^|\/)index\.s?html?$/.test(href) ||
      /^(https?:\/\/(www\.)?thelatinlibrary\.com)?\/?$/.test(href)
    );
  });
}

function isVerseParagraph(
  el: MinimalElementNode,
  lineText: string | undefined
): boolean {
  if (
    hasClassIgnoreCase(el, "poetry") ||
    hasClassIgnoreCase(el, "poem") ||
    hasClassIgnoreCase(el, "verse") ||
    el.tagName === "pre"
  ) {
    return true;
  }
  if (lineText === undefined) return false;
  const lines = lineText.split("\n").filter((l) => l.trim().length > 0);
  return lines.length >= 3 && lines.every((l) => l.length <= 100);
}

interface MutableState {
  pageTitle: string | undefined;
  nav: string[] | undefined;
  headings: string[];
  paragraphs: MinimalElementNode[];
  blocks: PageBlock[];
  footerParts: string[];
  warnings: string[];
  preserveLineBreaks: boolean;
}

function snippet(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function addBlock(
  state: MutableState,
  el: MinimalElementNode,
  kindHint: PageBlockKind
): void {
  const flat = extractText(el);
  const lines = extractText(el, { preserveLineBreaks: true });
  let kind = kindHint;
  if (kind === "paragraph" && isVerseParagraph(el, lines)) kind = "verse";
  const text = state.preserveLineBreaks ? lines : flat;
  const { markers, anchors } = detectBlockMarkers(el, text, kind);
  state.blocks.push({ kind, text, element: el, markers, anchors });
  if (kind === "heading") {
    state.headings.push(flat);
  } else {
    state.paragraphs.push(el);
  }
}

function syntheticParagraph(
  childNodes: readonly MinimalChildNode[]
): MinimalElementNode {
  return {
    tagName: "p",
    attrs: [{ name: SYNTHETIC_PARAGRAPH_ATTR, value: "true" }],
    childNodes,
  };
}

/**
 * Splits loose inline nodes into paragraphs at runs of two or more `<br>`
 * (only whitespace between them), dropping runs with no visible text.
 */
function flushLoose(
  state: MutableState,
  loose: MinimalChildNode[],
  where: string
): void {
  if (loose.length === 0) return;
  const groups: MinimalChildNode[][] = [[]];
  let pendingBrs: MinimalChildNode[] = [];
  for (const n of loose) {
    if (isElement(n) && n.tagName === "br") {
      pendingBrs.push(n);
      continue;
    }
    if (isText(n) && n.value.trim().length === 0 && pendingBrs.length > 0) {
      pendingBrs.push(n);
      continue;
    }
    const brCount = pendingBrs.filter(isElement).length;
    if (brCount >= 2) {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(...pendingBrs);
    }
    pendingBrs = [];
    groups[groups.length - 1].push(n);
  }
  let made = 0;
  for (const g of groups) {
    const p = syntheticParagraph(g);
    if (extractText(p).length === 0) continue;
    addBlock(state, p, "paragraph");
    made += 1;
  }
  if (made > 0) {
    state.warnings.push(
      `Loose text/inline content directly in <${where}> wrapped into ${made} paragraph(s).`
    );
  }
  loose.length = 0;
}

function setTitle(state: MutableState, text: string, tag: string): boolean {
  if (state.pageTitle === undefined) {
    state.pageTitle = text;
    return true;
  }
  state.warnings.push(
    `More than one title element; <${tag}> '${snippet(
      text
    )}' kept as a heading.`
  );
  return false;
}

function addFooter(state: MutableState, text: string): void {
  if (state.footerParts.length > 0) {
    state.warnings.push("More than one footer block.");
  }
  state.footerParts.push(text);
}

/**
 * Sorts the children of a container (`<body>`, or a wrapper `<div>` etc.)
 * into the page parts. Mirrors the pilot's `readPageContent` rules first, then
 * falls back to lenient handling.
 */
function classifyChildren(
  container: MinimalElementNode,
  state: MutableState,
  depth: number
): void {
  const loose: MinimalChildNode[] = [];
  const where = container.tagName;
  for (const child of container.childNodes) {
    if (isText(child)) {
      if (child.value.trim().length > 0 || loose.length > 0) loose.push(child);
      continue;
    }
    if (!isElement(child)) continue; // comments, doctypes
    const tag = child.tagName;
    if (INLINE_TAGS.has(tag) && !containsElement(child, isBlockTag)) {
      loose.push(child);
      continue;
    }
    flushLoose(state, loose, where);
    if (SKIPPED_TAGS.has(tag)) continue;
    classifyElement(child, state, depth);
  }
  flushLoose(state, loose, where);
}

function classifyElement(
  child: MinimalElementNode,
  state: MutableState,
  depth: number
): void {
  const tag = child.tagName;
  const text = extractText(child);

  // --- The pilot's rules, in its order. ---
  if (tag === "h1" || (tag === "p" && hasClass(child, "pagehead"))) {
    if (!setTitle(state, text, tag) && text.length > 0) {
      addBlock(state, child, "heading");
    }
    return;
  }
  if (isNavigationBlock(child)) {
    if (state.nav !== undefined) {
      state.warnings.push("More than one internal_navigation block; merged.");
      state.nav = [...state.nav, ...navTargets(child)];
    } else {
      state.nav = navTargets(child);
    }
    return;
  }
  if (tag === "div" && hasClass(child, "footer")) {
    addFooter(state, text);
    return;
  }
  if (tag === "p" && containsElement(child, hasTag("table"))) {
    // Older pages put the footer links in a table inside a <p>.
    if (LATIN_LIBRARY_RE.test(text)) {
      addFooter(state, text);
    } else if (text.length > 0) {
      state.warnings.push(
        `Table inside <p> that isn't the footer kept as a table: '${snippet(
          text
        )}'`
      );
      addBlock(state, child, "table");
    }
    return;
  }
  const hasBlocks = containsElement(child, isBlockTag);
  const canRecurse = depth < MAX_CONTAINER_DEPTH;
  if (tag === "div" && child.attrs.length > 0) {
    if (hasBlocks && canRecurse) {
      classifyChildren(child, state, depth + 1);
    } else if (text.length > 0) {
      // Centred headings such as <div align="center">LIBER I</div>.
      if (text.length <= MAX_HEADING_CHARS) {
        addBlock(state, child, "heading");
      } else {
        addBlock(state, child, "paragraph");
      }
    }
    return;
  }
  if (tag === "center" && text.length === 0) return; // a centred <hr>
  if (tag === "p") {
    if (text.length === 0) return; // spacer paragraphs (class=border etc.)
    if (isLinkOnlyFooter(child, text)) {
      addFooter(state, text);
      return;
    }
    addBlock(state, child, "paragraph");
    return;
  }

  // --- Lenient handling of everything the pilot rejected. ---
  if (tag === "hr" || text.length === 0) return;
  if (SUBHEADING_TAGS.has(tag)) {
    if (
      state.pageTitle === undefined &&
      state.blocks.length === 0 &&
      state.nav === undefined
    ) {
      state.warnings.push(
        `No <h1> or p.pagehead; using leading <${tag}> as the page title.`
      );
      state.pageTitle = text;
      return;
    }
    addBlock(state, child, "heading");
    return;
  }
  if (tag === "table") {
    if (LATIN_LIBRARY_RE.test(text) && isFooterTable(child, text)) {
      addFooter(state, text);
      return;
    }
    addBlock(state, child, "table");
    return;
  }
  if (tag === "pre") {
    addBlock(state, child, "verse");
    return;
  }
  if (hasBlocks && canRecurse) {
    classifyChildren(child, state, depth + 1);
    return;
  }
  if (tag === "div" || tag === "center") {
    if (tag === "center" && text.length <= MAX_HEADING_CHARS) {
      addBlock(state, child, "heading");
    } else {
      if (isLinkOnlyFooter(child, text)) {
        addFooter(state, text);
        return;
      }
      addBlock(state, child, "paragraph");
    }
    return;
  }
  if (!BLOCK_TAGS.has(tag) && !INLINE_TAGS.has(tag)) {
    state.warnings.push(
      `Unexpected <${tag}> kept as a paragraph: '${snippet(text)}'`
    );
  }
  addBlock(state, child, "paragraph");
}

/** A table of a few site links (footer), rather than content. */
function isFooterTable(table: MinimalElementNode, text: string): boolean {
  return text.length <= 200 && isLinkOnlyFooter(table, text);
}

/**
 * Reads a Latin Library page leniently. Never throws on any HTML input
 * (only if no HTML parser is available at all; see `parseHtmlToMinimalBody`).
 *
 * Classification of the children of `<body>` (and of wrapper elements such
 * as `<div class="page_wrapper">`, which are walked into):
 * - `<h1>` / `p.pagehead` -> `pageTitle` (the first one; later ones become
 *   heading blocks, with a warning). Without either, a leading `<h2>`-`<h6>`
 *   becomes the title (with a warning); otherwise `pageTitle` is `""`.
 * - `p.internal_navigation`, or a `<p>` of only `#` links -> `nav`
 *   (see `isNavigationBlock`).
 * - `div.footer`, a `<p>` / `<table>` of site links naming The Latin Library
 *   -> `footerText`.
 * - `<div>` with attributes (centred `LIBER I` etc.), `<center>`, `<h2>`-`<h6>`
 *   -> heading blocks (also listed in `headings`).
 * - `<p>` -> paragraph blocks (`verse` for `class=poetry|poem|verse` or 3+
 *   short `<br>` lines), `<pre>` -> verse, `<table>` -> table blocks; all
 *   non-heading blocks are also listed in `paragraphs`.
 * - Loose text and inline elements directly in a container are wrapped into
 *   synthetic `<p data-lenient-synthetic="true">` paragraphs (split at
 *   `<br><br>`), with a warning.
 * - Empty elements, `<hr>`, scripts and styles are dropped.
 *
 * `bodyText` is the pilot's: the text of each element child of `<body>`
 * (plus any loose text), joined with `"\n"`.
 */
export function extractLenientPage(
  rawHtml: string,
  options?: LenientPageParseOptions
): LenientPageContent {
  const { body } = parseHtmlToMinimalBody(rawHtml, options?.parser);
  const state: MutableState = {
    pageTitle: undefined,
    nav: undefined,
    headings: [],
    paragraphs: [],
    blocks: [],
    footerParts: [],
    warnings: [],
    preserveLineBreaks: options?.preserveLineBreaks === true,
  };

  const bodyTextParts: string[] = [];
  for (const child of body.childNodes) {
    if (isText(child)) {
      const t = normalizeSpace(child.value);
      if (t.length > 0) bodyTextParts.push(t);
    } else if (isElement(child) && !SKIPPED_TAGS.has(child.tagName)) {
      bodyTextParts.push(extractText(child));
    }
  }
  if (body.childNodes.length === 0) {
    state.warnings.push("Page has an empty or missing <body>.");
  }

  classifyChildren(body, state, 0);

  if (state.pageTitle === undefined) {
    state.warnings.push("No page title (<h1> or p.pagehead) found.");
  }
  if (state.footerParts.length === 0) {
    state.warnings.push("No site footer found.");
  }
  return {
    pageTitle: state.pageTitle ?? "",
    nav: state.nav,
    headings: state.headings,
    paragraphs: state.paragraphs,
    blocks: state.blocks,
    footerText:
      state.footerParts.length === 0 ? undefined : state.footerParts.join("\n"),
    bodyText: bodyTextParts.join("\n"),
    warnings: state.warnings,
  };
}
