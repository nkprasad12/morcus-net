import he from "he";

import { checkPresent } from "@/common/assert";
import type { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import { isString } from "@/web/utils/rpc/parsing";
import { safeFetchText, withDefaultScheme } from "@/web/scraping/safe_fetch";

/** HTML void elements that do not require a closing tag. */
const VOID_TAGS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

const UNPAIRED_TAGS = [
  ...VOID_TAGS,
  ...VOID_TAGS.map((tag) => tag.toUpperCase()),
];

/** Elements whose content is never visible text. Dropped with their subtree. */
const SKIPPED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "math",
  "iframe",
  "object",
  "canvas",
  "head",
  "title",
  "meta",
  "link",
  "button",
  "select",
  "textarea",
  "form",
  "input",
]);

/**
 * Page chrome (site navigation and sidebars) rather than the page's own text.
 * Dropped with their subtree, like {@link SKIPPED_TAGS}. `<header>` and
 * `<footer>` are only page-level chrome outside sectioning content and `<main>`
 * (matching HTML's `banner`/`contentinfo` landmark scoping), so article/section
 * headers and footers with titles or attribution survive.
 */
const CHROME_TAGS = new Set(["nav", "aside"]);

/**
 * Sectioning content and `<main>`: inside these, `<header>` and `<footer>` are
 * section headers/footers rather than page-level `banner`/`contentinfo` chrome.
 */
const SECTIONING_OR_MAIN_TAGS = new Set([
  "article",
  "aside",
  "main",
  "nav",
  "section",
]);

/** ARIA landmark roles of page chrome. */
const CHROME_ROLES = new Set([
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
]);

/** Whether `node` is page chrome, by tag or by ARIA landmark role. */
function isPageChrome(
  node: XmlNode,
  tag: string,
  inSectionOrMain: boolean
): boolean {
  if (CHROME_TAGS.has(tag)) {
    return true;
  }
  if (!inSectionOrMain && (tag === "header" || tag === "footer")) {
    return true;
  }
  for (const [key, value] of node.attrs) {
    if (key.toLowerCase() !== "role") {
      continue;
    }
    // `role` is a whitespace-separated token list; any chrome role matches.
    for (const role of value.toLowerCase().split(/\s+/)) {
      if (CHROME_ROLES.has(role)) {
        return true;
      }
    }
  }
  return false;
}

/** Elements that start a new line. Anything else is traversed as inline. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "blockquote",
  "pre",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "figure",
  "figcaption",
  "hr",
  "address",
  "center",
  "details",
  "summary",
]);

/** Fetches a page's text. Injectable so tests need not touch the network. */
type PageFetcher = (url: string) => Promise<{ text: string }>;

/** {@link scrapeUrlText} with an explicit fetcher, for tests. */
export async function scrapeUrlTextWith(
  url: string,
  fetcher: PageFetcher
): Promise<string> {
  const { text: rawText } = await fetcher(withDefaultScheme(url));
  // Strip raw-text <script>/<style> blocks and HTML comments before XML parsing
  // so unescaped `<` (e.g. `if (a < b)`) inside inline JS/CSS cannot confuse
  // fast-xml-parser into swallowing subsequent document nodes.
  const sanitized = rawText
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  const tree = checkPresent(
    parseRawXml(`<root>${sanitized}</root>`, {
      keepWhitespace: true,
      unpairedTags: UNPAIRED_TAGS,
    })
  );
  const body =
    tree.findDescendants("body")[0] ??
    tree.findDescendants("BODY")[0] ??
    tree.findDescendants("html")[0] ??
    tree.findDescendants("HTML")[0] ??
    tree;
  return htmlToText(body);
}

/**
 * Scrapes the visible text of a user-supplied page. Fetching goes through
 * `safeFetchText`, which refuses private/reserved destinations and enforces
 * time, size, redirect and content-type limits, because the URL is arbitrary
 * visitor input.
 */
export function scrapeUrlText(url: string): Promise<string> {
  return scrapeUrlTextWith(url, safeFetchText);
}

function htmlToText(root: XmlNode, inSectionOrMain = false): string {
  const tag = root.name.toLowerCase();
  if (
    SKIPPED_TAGS.has(tag) ||
    isPageChrome(root, tag, inSectionOrMain) ||
    root.name.startsWith("!") ||
    root.name.startsWith("?") ||
    root.name === "#comment"
  ) {
    return "";
  }
  const childInSectionOrMain =
    inSectionOrMain || SECTIONING_OR_MAIN_TAGS.has(tag);
  const result: string[] = [];
  // Include br here since fast-xml-parser doesn't handle it correctly and
  // includes text inside.
  if (BLOCK_TAGS.has(tag) || tag === "br") {
    result.push("\n");
  }
  for (const child of root.children) {
    result.push(
      isString(child)
        ? he.decode(child)
        : htmlToText(child, childInSectionOrMain)
    );
  }
  if (BLOCK_TAGS.has(tag)) {
    result.push("\n");
  }
  return result.join("").replaceAll("&nbsp;", " ");
}
