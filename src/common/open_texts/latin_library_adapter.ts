/**
 * Browser-safe adapter converting Latin Library HTML pages (`extractLenientPage`)
 * into the Open Texts `OpenTextDocument` model (`src/common/open_texts/open_text_document.ts`).
 *
 * Must remain 100% browser-safe (no `fs`, `path`, `crypto`, `node:*`, or `parse5`).
 */

import type {
  OpenTextBlock,
  OpenTextDocument,
  OpenTextPage,
  OpenTextRun,
  OpenTextSectionMarker,
  OpenTextSegment,
  OpenTextStyle,
} from "@/common/open_texts/open_text_document";
import {
  extractLenientPage,
  getAttr,
  isElement,
  isText,
  type DetectedMarker,
  type HtmlBodyParser,
  type MinimalChildNode,
  type MinimalElementNode,
  type PageBlock,
} from "@/common/thelatinlibrary";

export const DEFAULT_CHUNK_CHARS = 6000;

export interface LatinLibraryPageInput {
  /** Relative file path, e.g. `"raw/columba1.html"`. */
  readonly path: string;
  /** Decoded HTML string (decoded via `decodeLatinLibraryHtmlBytes`). */
  readonly html: string;
}

export interface LatinLibraryAdapterOptions {
  readonly title?: string;
  readonly author?: string;
  readonly parser?: HtmlBodyParser;
  readonly chunkTargetChars?: number;
}

const INVISIBLE_TAGS = new Set(["script", "style", "noscript", "template"]);
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

const BR = "\u0000";
const WS = /[\s\u00a0]/;

function styleForElement(
  el: MinimalElementNode,
  parent: OpenTextStyle | undefined
): OpenTextStyle | undefined {
  const tag = el.tagName;
  let italic = parent?.italic;
  let bold = parent?.bold;
  let smallCaps = parent?.smallCaps;
  let superscript = parent?.superscript;
  let subscript = parent?.subscript;

  if (tag === "i" || tag === "em" || tag === "cite") {
    italic = true;
  } else if (tag === "b" || tag === "strong") {
    bold = true;
  } else if (tag === "sup") {
    superscript = true;
  } else if (tag === "sub") {
    subscript = true;
  } else if (tag === "small") {
    smallCaps = true;
  }

  const inlineStyle = getAttr(el, "style");
  if (inlineStyle && /font-variant\s*:\s*small-caps/i.test(inlineStyle)) {
    smallCaps = true;
  }

  if (!italic && !bold && !smallCaps && !superscript && !subscript) {
    return undefined;
  }
  return {
    ...(italic ? { italic: true } : {}),
    ...(bold ? { bold: true } : {}),
    ...(smallCaps ? { smallCaps: true } : {}),
    ...(superscript ? { superscript: true } : {}),
    ...(subscript ? { subscript: true } : {}),
  };
}

function stylesEqual(
  a: OpenTextStyle | undefined,
  b: OpenTextStyle | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.italic === b.italic &&
    a.bold === b.bold &&
    a.smallCaps === b.smallCaps &&
    a.superscript === b.superscript &&
    a.subscript === b.subscript
  );
}

/**
 * Extracts per-character `OpenTextStyle` aligned 1-to-1 with `extractText(root, { preserveLineBreaks: true })`.
 * Returns `undefined` when the element contains no inline styling.
 */
function extractAlignedStyles(
  root: MinimalElementNode
): (OpenTextStyle | undefined)[] | undefined {
  let hasAnyStyle = false;
  const rawChars: string[] = [];
  const rawStyles: (OpenTextStyle | undefined)[] = [];

  const pushChar = (ch: string, style: OpenTextStyle | undefined) => {
    rawChars.push(ch);
    rawStyles.push(style);
  };

  type Frame =
    | {
        node: MinimalChildNode;
        inPre: boolean;
        style: OpenTextStyle | undefined;
      }
    | { separator: true; style: OpenTextStyle | undefined };

  const stack: Frame[] = [{ node: root, inPre: false, style: undefined }];
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if ("separator" in frame) {
      pushChar(" ", frame.style);
      continue;
    }
    const { node: n, inPre, style } = frame;
    if (isText(n)) {
      const val = inPre ? n.value.replace(/\r?\n/g, BR) : n.value;
      for (let i = 0; i < val.length; i++) {
        pushChar(val[i], style);
      }
      continue;
    }
    if (!isElement(n)) continue;
    if (n.tagName === "br") {
      pushChar(BR, style);
      continue;
    }
    if (INVISIBLE_TAGS.has(n.tagName)) continue;

    const nextStyle = styleForElement(n, style);
    if (nextStyle !== undefined) hasAnyStyle = true;

    const childInPre = inPre || n.tagName === "pre";
    if (TEXT_BOUNDARY_TAGS.has(n.tagName)) {
      pushChar(" ", style);
      stack.push({ separator: true, style });
    }
    for (let i = n.childNodes.length - 1; i >= 0; i--) {
      stack.push({
        node: n.childNodes[i],
        inPre: childInPre,
        style: nextStyle,
      });
    }
  }

  if (!hasAnyStyle) return undefined;

  const outStyles: (OpenTextStyle | undefined)[] = [];
  let pendingSpace = false;
  let pendingBreaks = 0;
  let pendingStyle: OpenTextStyle | undefined;

  for (let i = 0; i < rawChars.length; i++) {
    const ch = rawChars[i];
    const st = rawStyles[i];
    if (ch === BR) {
      pendingBreaks += 1;
      pendingStyle = st;
      continue;
    }
    if (WS.test(ch)) {
      pendingSpace = true;
      pendingStyle = st;
      continue;
    }
    if (outStyles.length > 0) {
      if (pendingBreaks > 0) {
        if (pendingBreaks >= 2) {
          outStyles.push(pendingStyle, pendingStyle);
        } else {
          outStyles.push(pendingStyle);
        }
      } else if (pendingSpace) {
        outStyles.push(pendingStyle);
      }
    }
    pendingSpace = false;
    pendingBreaks = 0;
    outStyles.push(st);
  }

  return outStyles;
}

function sliceToRuns(
  text: string,
  start: number,
  end: number,
  alignedStyles: readonly (OpenTextStyle | undefined)[] | undefined
): OpenTextRun[] {
  if (end <= start) return [];
  if (!alignedStyles || alignedStyles.length < end) {
    return [{ kind: "text", text: text.slice(start, end) }];
  }

  const runs: OpenTextRun[] = [];
  let runStart = start;
  let currentStyle = alignedStyles[start];

  for (let i = start + 1; i < end; i++) {
    const st = alignedStyles[i];
    if (!stylesEqual(st, currentStyle)) {
      runs.push({
        kind: "text",
        text: text.slice(runStart, i),
        ...(currentStyle ? { style: currentStyle } : {}),
      });
      runStart = i;
      currentStyle = st;
    }
  }

  runs.push({
    kind: "text",
    text: text.slice(runStart, end),
    ...(currentStyle ? { style: currentStyle } : {}),
  });
  return runs;
}

function deduplicateMarkers(
  markers: readonly DetectedMarker[]
): DetectedMarker[] {
  const sorted = [...markers].sort((a, b) => a.offset - b.offset);
  const result: DetectedMarker[] = [];
  for (const m of sorted) {
    const prev = result[result.length - 1];
    if (prev && prev.offset === m.offset && prev.value === m.value) {
      // Prefer non-anchor marker over bare anchor when both sit at the same offset.
      if (prev.kind === "anchor" && m.kind !== "anchor") {
        result[result.length - 1] = m;
      }
      continue;
    }
    result.push(m);
  }
  return result;
}

function buildSegmentsForRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  markers: readonly DetectedMarker[],
  alignedStyles: readonly (OpenTextStyle | undefined)[] | undefined
): OpenTextSegment[] {
  const segments: OpenTextSegment[] = [];
  let cursor = rangeStart;

  for (const marker of markers) {
    const pos = Math.max(rangeStart, Math.min(rangeEnd, marker.offset));
    if (pos > cursor) {
      segments.push(...sliceToRuns(text, cursor, pos, alignedStyles));
      cursor = pos;
    }
    const sectionMarker: OpenTextSectionMarker = {
      kind: "section",
      label: marker.value,
    };
    segments.push(sectionMarker);

    // Strip leading raw bracketed/bare marker token (e.g. "[1] " or "1. ") at rangeStart
    // so the section number is not rendered twice (once in gutter, once inline).
    if (
      marker.offset === rangeStart &&
      (marker.kind === "bracketed_number" || marker.kind === "bare_number") &&
      marker.raw.length > 0 &&
      text.startsWith(marker.raw, cursor)
    ) {
      cursor += marker.raw.length;
      while (cursor < rangeEnd && text[cursor] === " ") {
        cursor += 1;
      }
    }
  }

  if (cursor < rangeEnd) {
    segments.push(...sliceToRuns(text, cursor, rangeEnd, alignedStyles));
  }

  return segments;
}

function convertPageBlock(block: PageBlock): OpenTextBlock[] {
  const text = block.text;
  if (text.length === 0) return [];

  const alignedStyles = extractAlignedStyles(block.element);
  const markers = deduplicateMarkers(block.markers);

  if (block.kind === "heading") {
    const segments = buildSegmentsForRange(
      text,
      0,
      text.length,
      markers,
      alignedStyles
    );
    return segments.length > 0 ? [{ kind: "heading", segments }] : [];
  }

  if (block.kind === "verse" || text.includes("\n")) {
    const lineBlocks: OpenTextBlock[] = [];
    let lineStart = 0;
    let lineIdx = 0;

    while (lineStart <= text.length) {
      const nlIdx = text.indexOf("\n", lineStart);
      const lineEnd = nlIdx === -1 ? text.length : nlIdx;
      const lineText = text.slice(lineStart, lineEnd);

      if (lineText.trim().length > 0) {
        const lineMarkers = markers.filter(
          (m) =>
            m.offset >= lineStart &&
            (m.offset < lineEnd || (nlIdx === -1 && m.offset === lineEnd))
        );
        const segments = buildSegmentsForRange(
          text,
          lineStart,
          lineEnd,
          lineMarkers,
          alignedStyles
        );
        if (segments.length > 0) {
          lineBlocks.push({
            kind: "line",
            segments,
            ...(lineIdx === 0 ? { stanzaStart: true } : {}),
          });
          lineIdx += 1;
        }
      }

      if (nlIdx === -1) break;
      lineStart = nlIdx + 1;
    }

    return lineBlocks;
  }

  const segments = buildSegmentsForRange(
    text,
    0,
    text.length,
    markers,
    alignedStyles
  );
  return segments.length > 0 ? [{ kind: "paragraph", segments }] : [];
}

function blockPlainText(block: OpenTextBlock): string {
  return block.segments.map((s) => (s.kind === "text" ? s.text : "")).join("");
}

function chunkBlocksIntoPages(
  blocks: readonly OpenTextBlock[],
  docTitle: string,
  targetChars: number
): OpenTextPage[] {
  if (blocks.length === 0) return [];

  const chunks: OpenTextBlock[][] = [];
  let current: OpenTextBlock[] = [];
  let currentChars = 0;

  for (const block of blocks) {
    const len = blockPlainText(block).length;
    const shouldBreak =
      current.length > 0 &&
      (currentChars >= targetChars ||
        (block.kind === "heading" && currentChars >= targetChars * 0.5));

    if (shouldBreak) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(block);
    currentChars += len;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.map((chunkBlocks, idx) => {
    const firstBlock = chunkBlocks[0];
    const headingLabel =
      firstBlock?.kind === "heading"
        ? blockPlainText(firstBlock).trim()
        : undefined;
    const defaultLabel = chunks.length === 1 ? docTitle : `Part ${idx + 1}`;
    return {
      id: String(idx + 1),
      label:
        headingLabel && headingLabel.length > 0 ? headingLabel : defaultLabel,
      blocks: chunkBlocks,
      notes: [],
    };
  });
}

/**
 * Converts one or more decoded Latin Library HTML pages into an `OpenTextDocument`.
 */
export function parseLatinLibraryOpenText(
  pages: readonly LatinLibraryPageInput[],
  options?: LatinLibraryAdapterOptions
): OpenTextDocument {
  const warnings: string[] = [];
  const parsedPages = pages.map((page) => {
    const lenient = extractLenientPage(page.html, {
      parser: options?.parser,
      preserveLineBreaks: true,
    });
    for (const w of lenient.warnings) {
      warnings.push(pages.length > 1 ? `${page.path}: ${w}` : w);
    }
    return { path: page.path, lenient };
  });

  const firstLenient = parsedPages[0]?.lenient;
  const title =
    options?.title?.trim() ||
    firstLenient?.pageTitle ||
    firstLenient?.headings[0] ||
    "Untitled";
  const author = options?.author?.trim() || undefined;

  if (parsedPages.length === 0) {
    return {
      title,
      ...(author ? { author } : {}),
      pagination: "chunks",
      pages: [],
      warnings,
    };
  }

  if (parsedPages.length > 1) {
    const docPages: OpenTextPage[] = parsedPages.map(({ lenient }, idx) => {
      let blocks = lenient.blocks.flatMap(convertPageBlock);
      if (blocks.length === 0 && lenient.bodyText.trim().length > 0) {
        blocks = lenient.bodyText
          .split(/\n\s*\n/)
          .map((chunk) => chunk.trim())
          .filter((chunk) => chunk.length > 0)
          .map((text) => ({
            kind: "paragraph" as const,
            segments: [{ kind: "text" as const, text }],
          }));
      }
      return {
        id: String(idx + 1),
        label: lenient.pageTitle || lenient.headings[0] || `Page ${idx + 1}`,
        blocks,
        notes: [],
      };
    });

    return {
      title,
      ...(author ? { author } : {}),
      pagination: "pageBreaks",
      pages: docPages,
      warnings,
    };
  }

  const singleLenient = parsedPages[0].lenient;
  let allBlocks = singleLenient.blocks.flatMap(convertPageBlock);
  if (allBlocks.length === 0 && singleLenient.bodyText.trim().length > 0) {
    allBlocks = singleLenient.bodyText
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)
      .map((text) => ({
        kind: "paragraph" as const,
        segments: [{ kind: "text" as const, text }],
      }));
  }

  const targetChars = options?.chunkTargetChars ?? DEFAULT_CHUNK_CHARS;
  const docPages = chunkBlocksIntoPages(allBlocks, title, targetChars);

  return {
    title,
    ...(author ? { author } : {}),
    pagination: "chunks",
    pages: docPages,
    warnings,
  };
}
