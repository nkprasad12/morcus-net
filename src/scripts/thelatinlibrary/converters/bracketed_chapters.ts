import { checkSequentialIds } from "@/scripts/thelatinlibrary/converters/checks";
import {
  getAttr,
  isElement,
  textOf,
} from "@/scripts/thelatinlibrary/converters/html";
import {
  checkNoTextLost,
  fail,
  readPageContent,
  type PageConversion,
} from "@/scripts/thelatinlibrary/converters/page";
import { splitAtSequentialMarkers } from "@/scripts/thelatinlibrary/converters/strict_markers";
import type { HtmlElement } from "@/scripts/thelatinlibrary/converters/html";

export { ConversionError } from "@/scripts/thelatinlibrary/converters/page";

/**
 * Converter for Latin Library pages laid out as numbered chapters:
 *
 *   <p class="internal_navigation"><a href="#1">1</a> ... </p>
 *   <p>Untitled preamble ...</p>                      -> chapter "pr"
 *   <p>[<a name="1">1</a>] Chapter text ...</p>        -> chapter "1"
 *   ...
 *   <p>[1] Appendix text ...</p>                      -> chapter "appendix1"
 *
 * Anything outside this shape is an error. The converter never guesses.
 */

/** A leading chapter marker such as `[12]` (with or without an anchor). */
const MARKER = /^\[\s*(\d+)\s*\]\s*/;

/** The `name` of an `<a name>` that is a direct child of `p`, if any. */
function anchorName(p: HtmlElement): string | undefined {
  for (const child of p.childNodes) {
    if (isElement(child) && child.tagName === "a") {
      const name = getAttr(child, "name");
      if (name !== undefined) {
        return name;
      }
    }
  }
  return undefined;
}

export function extractBracketedChapters(
  paragraphs: readonly HtmlElement[],
  nav: readonly string[]
): { rows: [string[], string][]; anchoredCount: number; markerTokens: number } {
  const mainParagraphs: HtmlElement[] = [];
  const appendixParagraphs: HtmlElement[] = [];
  const anchoredSeen: string[] = [];

  for (const p of paragraphs) {
    if (anchoredSeen.length === nav.length) {
      appendixParagraphs.push(p);
      continue;
    }
    const text = textOf(p);
    const anchor = anchorName(p);
    const match = MARKER.exec(text);
    if (anchor !== undefined) {
      if (match === null || match[1] !== anchor) {
        fail(
          `Anchor '${anchor}' is not at the start of its paragraph: '${text.slice(
            0,
            60
          )}'`
        );
      }
      const expected = nav[anchoredSeen.length];
      if (anchor !== expected) {
        fail(
          `Chapter anchor '${anchor}' found where navigation expects '${expected}'.`
        );
      }
      anchoredSeen.push(anchor);
      mainParagraphs.push(p);
      continue;
    }
    if (match !== null) {
      fail(`Unanchored marker '[${match[1]}]' before the last chapter.`);
    }
    if (anchoredSeen.length === 0) {
      mainParagraphs.push(p);
      continue;
    }
    fail(
      `Unnumbered paragraph after chapter ${anchoredSeen.at(-1)}: '${text.slice(
        0,
        60
      )}'`
    );
  }

  if (anchoredSeen.length !== nav.length) {
    fail(
      `Navigation lists ${nav.length} chapters but ${anchoredSeen.length} anchors were found.`
    );
  }

  const mainSections = splitAtSequentialMarkers(mainParagraphs.map(textOf), {
    label: "Chapters",
    allowInlineSplits: false,
    allowLeadingPr: true,
  });
  checkSequentialIds(
    mainSections.map(([id]) => id),
    "Chapters"
  );

  const rows: [string[], string][] = mainSections.map(([id, text]) => [
    [id],
    text,
  ]);
  let markerTokens = mainSections.filter(([id]) => id !== "pr").length;

  if (appendixParagraphs.length > 0) {
    const appendixSections = splitAtSequentialMarkers(
      appendixParagraphs.map(textOf),
      {
        label: "Appendix",
        allowInlineSplits: false,
        allowLeadingPr: false,
      }
    );
    checkSequentialIds(
      appendixSections.map(([id]) => id),
      "Appendix"
    );
    for (const [id, text] of appendixSections) {
      rows.push([[`appendix${id}`], text]);
      markerTokens += 1;
    }
  }

  return { rows, anchoredCount: anchoredSeen.length, markerTokens };
}

export function convertBracketedChapters(html: string): PageConversion {
  const content = readPageContent(html);
  const { nav, paragraphs } = content;
  if (nav === undefined || nav.length === 0) {
    fail(
      "No internal_navigation block; this page needs a different converter."
    );
  }
  if (content.headings.length > 0) {
    fail(`Unexpected heading(s): ${content.headings.join(", ")}`);
  }

  const { rows, anchoredCount, markerTokens } = extractBracketedChapters(
    paragraphs,
    nav
  );
  const report = [
    `navigation: ${nav.length} targets match ${anchoredCount} anchors`,
    checkNoTextLost(paragraphs, rows, markerTokens),
  ];
  return {
    rows,
    pageTitle: content.pageTitle,
    bodyText: content.bodyText,
    report,
  };
}
