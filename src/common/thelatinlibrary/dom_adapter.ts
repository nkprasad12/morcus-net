/**
 * Browser-safe minimal DOM abstraction for Latin Library pages.
 *
 * - In Node, `parse5`'s tree already satisfies `MinimalElementNode`; callers
 *   inject it via `createParse5BodyParser(parse5.parse)` (this module never
 *   imports `parse5` itself).
 * - In browsers (or `jsdom`), `DOMParser` output is adapted into the same
 *   minimal shape by `domParserBodyParser`.
 *
 * Must not import `fs`, `path`, `crypto`, `node:*` or `parse5`.
 */

import type {
  HtmlBodyParser,
  MinimalChildNode,
  MinimalElementNode,
  MinimalTextNode,
} from "@/common/thelatinlibrary/page_layer_types";

// ---------------------------------------------------------------------------
// Node predicates and accessors
// ---------------------------------------------------------------------------

export function isElement(node: MinimalChildNode): node is MinimalElementNode {
  return "tagName" in node;
}

export function isText(node: MinimalChildNode): node is MinimalTextNode {
  return !("tagName" in node) && node.nodeName === "#text";
}

export function getAttr(
  el: MinimalElementNode,
  name: string
): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function hasClass(el: MinimalElementNode, cls: string): boolean {
  return (getAttr(el, "class") ?? "").split(/\s+/).includes(cls);
}

/** Like `hasClass`, but case-insensitive (`class=POETRY` vs `poetry`). */
export function hasClassIgnoreCase(
  el: MinimalElementNode,
  cls: string
): boolean {
  const want = cls.toLowerCase();
  return (getAttr(el, "class") ?? "").toLowerCase().split(/\s+/).includes(want);
}

/**
 * All descendants of `root` (excluding `root` itself) matching `pred`, in
 * document order. Iterative, so arbitrarily deep trees cannot overflow the
 * stack.
 */
export function findElements(
  root: MinimalElementNode,
  pred: (el: MinimalElementNode) => boolean
): MinimalElementNode[] {
  const out: MinimalElementNode[] = [];
  const stack: MinimalChildNode[] = [...root.childNodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!isElement(node)) continue;
    if (pred(node)) out.push(node);
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      stack.push(node.childNodes[i]);
    }
  }
  return out;
}

/** Whether any descendant of `root` matches `pred`. */
export function containsElement(
  root: MinimalElementNode,
  pred: (el: MinimalElementNode) => boolean
): boolean {
  const stack: MinimalChildNode[] = [...root.childNodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!isElement(node)) continue;
    if (pred(node)) return true;
    for (const c of node.childNodes) stack.push(c);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/** Elements whose content is never visible text. */
const INVISIBLE_TAGS = new Set(["script", "style", "noscript", "template"]);

/**
 * Block-level elements whose start and end separate words, as a browser's
 * layout would.
 */
const TEXT_BOUNDARY_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "center",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
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
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** Collapses whitespace (including non-breaking spaces) and trims. */
export function normalizeSpace(text: string): string {
  return text.replace(/[\s\u00a0]+/g, " ").trim();
}

/** Word tokens (letters/digits), used to check that no text was lost. */
export function wordTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export interface ExtractTextOptions {
  /**
   * When true, `<br>` (and literal newlines inside `<pre>`) become `"\n"`;
   * runs of two or more breaks become one blank line (`"\n\n"`). Otherwise all
   * whitespace collapses to single spaces.
   */
  readonly preserveLineBreaks?: boolean;
}

/** Sentinel for a line break while building raw text (never in HTML text). */
const BR = "\u0000";

/** A position of interest (e.g. an anchor) recorded while extracting text. */
export interface TextMark<T> {
  readonly data: T;
  /** Offset in the normalized text of the first visible char at/after the mark. */
  readonly offset: number;
}

const WS = /[\s\u00a0]/;

/**
 * Extracts text, maps "marks" (elements selected by `markWhere`) to their
 * offsets in the normalized text, and optionally derives per-character state
 * (`charStates`, 1-to-1 with `text`) via `deriveCharState`. Shared by
 * `extractText`, the marker detector, and the inline-style extractor.
 */
export function extractTextWithMarks<T, S = never>(
  node: MinimalChildNode,
  options: ExtractTextOptions | undefined,
  markWhere?: (el: MinimalElementNode) => T | undefined,
  deriveCharState?: (
    el: MinimalElementNode,
    parent: S | undefined
  ) => S | undefined
): { text: string; marks: TextMark<T>[]; charStates?: (S | undefined)[] } {
  const preserve = options?.preserveLineBreaks === true;
  const parts: string[] = [];
  let rawLength = 0;
  const rawMarks: { data: T; rawIndex: number }[] = [];
  const rawStates: (S | undefined)[] | undefined =
    deriveCharState !== undefined ? [] : undefined;
  let hasAnyState = false;
  const push = (s: string, state?: S) => {
    parts.push(s);
    rawLength += s.length;
    if (rawStates !== undefined) {
      for (let i = 0; i < s.length; i++) {
        rawStates.push(state);
      }
    }
  };

  // Iterative walk. `pre` depth tracks whether we are inside a `<pre>`.
  // A `separator` frame stands for the end of a block-level element.
  type Frame =
    | { node: MinimalChildNode; inPre: boolean; state: S | undefined }
    | { separator: true; inPre: boolean; state: S | undefined };
  const stack: Frame[] = [{ node, inPre: false, state: undefined }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if ("separator" in frame) {
      push(" ", frame.state);
      continue;
    }
    const { node: n, inPre, state } = frame;
    if (isText(n)) {
      push(preserve && inPre ? n.value.replace(/\r?\n/g, BR) : n.value, state);
      continue;
    }
    if (!isElement(n)) continue;
    if (n.tagName === "br") {
      push(preserve ? BR : " ", state);
      continue;
    }
    if (INVISIBLE_TAGS.has(n.tagName)) continue;
    if (markWhere !== undefined) {
      const data = markWhere(n);
      if (data !== undefined) rawMarks.push({ data, rawIndex: rawLength });
    }
    const nextState =
      deriveCharState !== undefined ? deriveCharState(n, state) : undefined;
    if (nextState !== undefined) {
      hasAnyState = true;
    }
    const childInPre = inPre || n.tagName === "pre";
    if (TEXT_BOUNDARY_TAGS.has(n.tagName)) {
      // Block boundaries separate words: `<td>Liber I</td><td>Liber II</td>`.
      push(" ", state);
      stack.push({ separator: true, inPre, state });
    }
    for (let i = n.childNodes.length - 1; i >= 0; i--) {
      stack.push({
        node: n.childNodes[i],
        inPre: childInPre,
        state: nextState,
      });
    }
  }
  const raw = parts.join("");

  // Normalize, recording for each raw index the output offset of the next
  // visible character.
  let out = "";
  const outStates: (S | undefined)[] | undefined =
    rawStates !== undefined && hasAnyState ? [] : undefined;
  let pendingSpace = false;
  let pendingBreaks = 0;
  let pendingState: S | undefined;
  // A mark at raw index i resolves to the output offset of the first visible
  // raw char at or after i (or the end of the text).
  const resolved = new Map<number, number>();
  let markCursor = 0;
  const sortedMarkIdx = [...new Set(rawMarks.map((m) => m.rawIndex))].sort(
    (a, b) => a - b
  );
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const st = rawStates?.[i];
    if (ch === BR) {
      pendingBreaks += 1;
      pendingState = st;
      continue;
    }
    if (WS.test(ch)) {
      pendingSpace = true;
      pendingState = st;
      continue;
    }
    if (out.length > 0) {
      if (pendingBreaks > 0) {
        out += pendingBreaks >= 2 ? "\n\n" : "\n";
        if (outStates !== undefined) {
          if (pendingBreaks >= 2) {
            outStates.push(pendingState, pendingState);
          } else {
            outStates.push(pendingState);
          }
        }
      } else if (pendingSpace) {
        out += " ";
        if (outStates !== undefined) {
          outStates.push(pendingState);
        }
      }
    }
    pendingSpace = false;
    pendingBreaks = 0;
    while (
      markCursor < sortedMarkIdx.length &&
      sortedMarkIdx[markCursor] <= i
    ) {
      resolved.set(sortedMarkIdx[markCursor], out.length);
      markCursor += 1;
    }
    out += ch;
    if (outStates !== undefined) {
      outStates.push(st);
    }
  }
  while (markCursor < sortedMarkIdx.length) {
    resolved.set(sortedMarkIdx[markCursor], out.length);
    markCursor += 1;
  }
  return {
    text: out,
    marks: rawMarks.map((m) => ({
      data: m.data,
      offset: resolved.get(m.rawIndex) ?? out.length,
    })),
    ...(outStates !== undefined ? { charStates: outStates } : {}),
  };
}

/**
 * The visible text of a node. Entities are already decoded by the parser,
 * comments/scripts/styles are dropped and whitespace (including non-breaking
 * spaces) is collapsed. `<br>` becomes a space, or `"\n"` with
 * `preserveLineBreaks`.
 *
 * `<script>`, `<style>`, `<noscript>` and `<template>` content is skipped and
 * block-level boundaries (`<p>`, `<div>`, `<td>`, `<li>`, ...) separate words.
 */
export function extractText(
  node: MinimalChildNode,
  options?: ExtractTextOptions
): string {
  return extractTextWithMarks<never>(node, options).text;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** The shape of a parsed document root (parse5 `Document` or adapted DOM). */
export interface MinimalDocumentLike {
  readonly childNodes: readonly MinimalChildNode[];
}

const EMPTY_BODY: MinimalElementNode = Object.freeze({
  tagName: "body",
  attrs: Object.freeze([]),
  childNodes: Object.freeze([]),
});

/**
 * Finds `<body>` and `<head><title>` in a parsed document. Pages without a
 * `<body>` (e.g. `<frameset>` pages) get an empty body.
 */
export function bodyAndTitleOfDocument(doc: MinimalDocumentLike): {
  body: MinimalElementNode;
  headTitle?: string;
} {
  const html = doc.childNodes.find(
    (n): n is MinimalElementNode => isElement(n) && n.tagName === "html"
  );
  const top = html?.childNodes.filter(isElement) ?? [];
  const body = top.find((e) => e.tagName === "body") ?? EMPTY_BODY;
  const head = top.find((e) => e.tagName === "head");
  const titleEl =
    head === undefined
      ? undefined
      : findElements(head, (e) => e.tagName === "title")[0];
  const headTitle =
    titleEl === undefined ? undefined : extractText(titleEl) || undefined;
  return headTitle === undefined ? { body } : { body, headTitle };
}

/**
 * Wraps `parse5.parse` (passed in by Node callers, so this module stays free
 * of a `parse5` import) as an `HtmlBodyParser`. parse5's AST satisfies the
 * minimal node interfaces directly, with no copying.
 *
 * ```ts
 * import { parse } from "parse5";
 * const parser = createParse5BodyParser(parse);
 * ```
 */
export function createParse5BodyParser(
  parse: (html: string) => MinimalDocumentLike
): HtmlBodyParser {
  return (rawHtml) => bodyAndTitleOfDocument(parse(rawHtml));
}

// --- DOMParser adapter -----------------------------------------------------

/** The subset of the DOM `Node` interface the adapter reads. */
interface DomNodeLike {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly childNodes: ArrayLike<DomNodeLike>;
  readonly localName?: string | null;
  readonly tagName?: string;
  readonly attributes?: ArrayLike<{ name: string; value: string }>;
  readonly data?: string;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;
const COMMENT_NODE = 8;

interface MutableElement {
  tagName: string;
  attrs: { name: string; value: string }[];
  childNodes: MinimalChildNode[];
}

function adaptLeaf(node: DomNodeLike): MinimalChildNode {
  if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
    return { nodeName: "#text", value: node.data ?? "" };
  }
  if (node.nodeType === COMMENT_NODE) return { nodeName: "#comment" };
  return { nodeName: node.nodeName };
}

/**
 * Adapts a DOM element (from `DOMParser`) into a `MinimalElementNode` tree:
 * lowercase `tagName`, `attrs: { name, value }[]` with lowercase names, and
 * `childNodes` of elements / `#text` / other nodes. Iterative.
 */
export function adaptDomElement(root: DomNodeLike): MinimalElementNode {
  const makeElement = (el: DomNodeLike): MutableElement => {
    const attrs: { name: string; value: string }[] = [];
    const domAttrs = el.attributes;
    if (domAttrs !== undefined) {
      for (let i = 0; i < domAttrs.length; i++) {
        attrs.push({
          name: domAttrs[i].name.toLowerCase(),
          value: domAttrs[i].value,
        });
      }
    }
    const tag = el.localName ?? el.tagName ?? el.nodeName;
    return { tagName: tag.toLowerCase(), attrs, childNodes: [] };
  };
  const out = makeElement(root);
  const stack: [DomNodeLike, MutableElement][] = [[root, out]];
  while (stack.length > 0) {
    const [dom, min] = stack.pop()!;
    const kids = dom.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      if (child.nodeType === ELEMENT_NODE) {
        const adapted = makeElement(child);
        min.childNodes.push(adapted);
        stack.push([child, adapted]);
      } else {
        min.childNodes.push(adaptLeaf(child));
      }
    }
  }
  return out;
}

interface DomDocumentLike {
  readonly documentElement?: DomNodeLike | null;
}

type DomParserCtor = new () => {
  parseFromString(html: string, type: string): DomDocumentLike;
};

function globalDomParser(): DomParserCtor | undefined {
  // Typed as always present by lib.dom, but absent in Node.
  const ctor: DomParserCtor | undefined = globalThis.DOMParser;
  return typeof ctor === "function" ? ctor : undefined;
}

/**
 * `HtmlBodyParser` backed by `new DOMParser().parseFromString(html,
 * "text/html")`. Throws if `DOMParser` is unavailable.
 */
export const domParserBodyParser: HtmlBodyParser = (rawHtml) => {
  const Ctor = globalDomParser();
  if (Ctor === undefined) {
    throw new Error("DOMParser is not available in this environment.");
  }
  const doc = new Ctor().parseFromString(rawHtml, "text/html");
  const root = doc.documentElement;
  // Adapt the whole `<html>` element and reuse the parse5 lookup, so both
  // parsers resolve `<body>` and `<head><title>` identically.
  return bodyAndTitleOfDocument({
    childNodes:
      root === null || root === undefined ? [] : [adaptDomElement(root)],
  });
};

// --- Default parser selection ---------------------------------------------

let registeredParser: HtmlBodyParser | undefined = undefined;

/**
 * Registers the parser used when `parseHtmlToMinimalBody` /
 * `extractLenientPage` get no explicit `parser` and `DOMParser` is
 * unavailable (i.e. in Node). Pass `undefined` to clear.
 */
export function setDefaultHtmlBodyParser(
  parser: HtmlBodyParser | undefined
): void {
  registeredParser = parser;
}

/**
 * The parser used when none is given: `DOMParser` when available, otherwise
 * the one registered with `setDefaultHtmlBodyParser`.
 */
export function defaultHtmlBodyParser(): HtmlBodyParser | undefined {
  if (globalDomParser() !== undefined) return domParserBodyParser;
  return registeredParser;
}

/**
 * Parses a full HTML page the way a browser would and returns its `<body>`
 * (empty for pages without one) plus the `<head><title>` text, if any.
 *
 * Throws only if no parser is available at all (no `parser` argument, no
 * global `DOMParser` and nothing registered): that is a configuration error,
 * not a property of the input.
 */
export function parseHtmlToMinimalBody(
  rawHtml: string,
  parser?: HtmlBodyParser
): { body: MinimalElementNode; headTitle?: string } {
  const p = parser ?? defaultHtmlBodyParser();
  if (p === undefined) {
    throw new Error(
      "No HtmlBodyParser: pass one (e.g. createParse5BodyParser(parse5.parse)), " +
        "call setDefaultHtmlBodyParser, or run where DOMParser exists."
    );
  }
  const { body, headTitle } = p(rawHtml);
  return headTitle === undefined ? { body } : { body, headTitle };
}
