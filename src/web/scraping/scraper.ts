import he from "he";

import { assert, checkPresent } from "@/common/assert";
import type { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import { isString } from "@/web/utils/rpc/parsing";

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

function normalizeUrl(url: string): string {
  if (!url.startsWith("https:") && !url.startsWith("http:")) {
    return "https://" + url;
  }
  return url;
}

export async function scrapeUrlText(url: string): Promise<string> {
  const response = await fetch(normalizeUrl(url));
  assert(response.ok, `Status ${response.status} on ${url}`);
  const rawText = await response.text();
  const tree = parseRawXml(rawText, {
    unpairedTags: ["br", "BR"],
  });
  const body = tree.findDescendants("body")[0];
  return htmlToText(checkPresent(body));
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
