import {
  rowPlainText,
  type TheLatinLibraryWork,
} from "@/common/library/process_thelatinlibrary";
import {
  createParse5BodyParser,
  extractLenientPage,
  parseRoman,
  toRoman,
  type MinimalElementNode,
} from "@/common/thelatinlibrary";
import {
  textOf,
  wordTokens,
  type HtmlElement,
} from "@/scripts/thelatinlibrary/html";
import { parse } from "parse5";

export { parseRoman, toRoman };

const parse5BodyParser = createParse5BodyParser(parse);

/**
 * Explicitly reviewed non-fatal warnings from `extractLenientPage` that are
 * accepted by the strict pilot converters. Empty by default.
 */
const ALLOWED_PAGE_WARNINGS: readonly RegExp[] = [];

export class ConversionError extends Error {}

export function fail(message: string): never {
  throw new ConversionError(message);
}

/** The result of converting one Latin Library page. */
export interface PageConversion {
  rows: TheLatinLibraryWork["rows"];
  /** Visible page title (`<h1>` or `p.pagehead`). */
  pageTitle: string;
  /** All visible body text, used for provenance scanning. */
  bodyText: string;
  report: string[];
}

/** The body of a page, sorted into the parts converters care about. */
export interface PageContent {
  pageTitle: string;
  /** `#target`s of the `internal_navigation` block, if the page has one. */
  nav: string[] | undefined;
  /** Text of centred `<div>` headings such as `LIBER III`, in order. */
  headings: string[];
  /** Non-empty content paragraphs, in order. */
  paragraphs: HtmlElement[];
  bodyText: string;
}

/**
 * Sorts the direct children of `<body>` via C2's lenient page layer, enforcing
 * zero unallowed warnings so text or structure can't be silently lost.
 */
export function readPageContent(html: string, label?: string): PageContent {
  const lenient = extractLenientPage(html, { parser: parse5BodyParser });
  const unallowedWarnings = lenient.warnings.filter(
    (w) => !ALLOWED_PAGE_WARNINGS.some((re) => re.test(w))
  );
  if (unallowedWarnings.length > 0) {
    fail(
      label !== undefined
        ? `${label}: ${unallowedWarnings[0]}`
        : unallowedWarnings[0]
    );
  }
  if (lenient.blocks.some((b) => b.kind === "table")) {
    fail(
      label !== undefined
        ? `${label}: Unexpected <table> directly in <body>.`
        : "Unexpected <table> directly in <body>."
    );
  }
  return {
    pageTitle: lenient.pageTitle,
    nav: lenient.nav,
    headings: lenient.headings,
    paragraphs: lenient.paragraphs.filter(
      (n: MinimalElementNode): n is HtmlElement =>
        "nodeName" in n && "namespaceURI" in n
    ),
    bodyText: lenient.bodyText,
  };
}

export const extractPage = readPageContent;

/**
 * Checks that converting lost and invented no words: the content paragraphs'
 * tokens must equal the rows' tokens plus the markers that were removed.
 */
export function checkNoTextLost(
  paragraphs: HtmlElement[],
  rows: TheLatinLibraryWork["rows"],
  removedMarkerTokens: number
): string {
  const pageTokens = paragraphs.reduce(
    (n, p) => n + wordTokens(textOf(p)).length,
    0
  );
  const rowTokens = rows.reduce(
    (n, [, t]) => n + wordTokens(rowPlainText(t)).length,
    0
  );
  if (rowTokens + removedMarkerTokens !== pageTokens) {
    fail(
      `Token mismatch: page has ${pageTokens}, rows+markers have ${
        rowTokens + removedMarkerTokens
      }.`
    );
  }
  return `text: ${pageTokens} page tokens = ${rowTokens} row tokens + ${removedMarkerTokens} markers`;
}
