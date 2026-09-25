import he from "he";

import { assert, checkPresent } from "@/common/assert";
import type { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import { isString } from "@/web/utils/rpc/parsing";
import { safeFetchText, withDefaultScheme } from "@/web/scraping/safe_fetch";

const BLOCK_STARTS = new Set(["p", "div"]);
const ALL_TAGS = new Set(
  [...BLOCK_STARTS].concat([
    "font",
    "body",
    "a",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "span",
    "b",
    "i",
    "table",
    "tr",
    "td",
  ])
);

/** Fetches a page's text. Injectable so tests need not touch the network. */
export type PageFetcher = (url: string) => Promise<{ text: string }>;

/** {@link scrapeUrlText} with an explicit fetcher, for tests. */
export async function scrapeUrlTextWith(
  url: string,
  fetcher: PageFetcher
): Promise<string> {
  const { text: rawText } = await fetcher(withDefaultScheme(url));
  const tree = parseRawXml(rawText, {
    unpairedTags: ["br", "BR"],
  });
  const body = tree.findDescendants("body")[0];
  return htmlToText(checkPresent(body));
}

/**
 * Scrapes the visible text of a user-supplied page. Fetching goes through
 * `safeFetchText`, which refuses private/reserved destinations and enforces
 * time, size, redirect and content-type limits, because the URL is arbitrary
 * visitor input.
 *
 * Keep this single-argument: it is registered as an RPC handler, and
 * `RouteDefinition` calls handlers with extra positional arguments.
 */
export function scrapeUrlText(url: string): Promise<string> {
  return scrapeUrlTextWith(url, safeFetchText);
}

function htmlToText(root: XmlNode): string {
  const tag = root.name.toLowerCase();
  assert(ALL_TAGS.has(tag), tag);
  const result: string[] = [];
  // Include br here since fast-xml-parser doesn't handle it correctly and
  // includes text inside.
  if (BLOCK_STARTS.has(tag) || tag === "br") {
    result.push("\n");
  }
  for (const child of root.children) {
    result.push(isString(child) ? he.decode(child) : htmlToText(child));
  }
  if (BLOCK_STARTS.has(tag)) {
    result.push("\n");
  }
  return result.join("").replaceAll("&nbsp;", " ");
}
