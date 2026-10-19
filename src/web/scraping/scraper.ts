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

/** Elements that start a new line. Anything else is traversed as inline. */
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "nav",
  "aside",
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
  const tree = checkPresent(
    parseRawXml(`<root>${rawText}</root>`, {
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

function htmlToText(root: XmlNode): string {
  const tag = root.name.toLowerCase();
  if (
    SKIPPED_TAGS.has(tag) ||
    root.name.startsWith("!") ||
    root.name.startsWith("?") ||
    root.name === "#comment"
  ) {
    return "";
  }
  const result: string[] = [];
  // Include br here since fast-xml-parser doesn't handle it correctly and
  // includes text inside.
  if (BLOCK_TAGS.has(tag) || tag === "br") {
    result.push("\n");
  }
  for (const child of root.children) {
    result.push(isString(child) ? he.decode(child) : htmlToText(child));
  }
  if (BLOCK_TAGS.has(tag)) {
    result.push("\n");
  }
  return result.join("").replaceAll("&nbsp;", " ");
}
