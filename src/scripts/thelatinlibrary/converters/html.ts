import {
  extractText,
  getAttr as commonGetAttr,
  hasClass as commonHasClass,
  isElement as commonIsElement,
  isText as commonIsText,
  normalizeSpace,
  wordTokens,
} from "@/common/thelatinlibrary";
import { parse, type DefaultTreeAdapterMap } from "parse5";

export { normalizeSpace, wordTokens };

export type HtmlNode = DefaultTreeAdapterMap["childNode"];
export type HtmlElement = DefaultTreeAdapterMap["element"];
type HtmlParent = DefaultTreeAdapterMap["parentNode"];

/** Parses a full HTML page the way a browser would, returning `<body>`. */
export function parseBody(html: string): HtmlElement {
  const doc = parse(html);
  const htmlEl = doc.childNodes.find(isElement);
  const body = htmlEl?.childNodes
    .filter(isElement)
    .find((e) => e.tagName === "body");
  if (body === undefined) {
    throw new Error("No <body> element found.");
  }
  return body;
}

export function isElement(node: HtmlNode | HtmlParent): node is HtmlElement {
  return commonIsElement(node);
}

export function isText(
  node: HtmlNode
): node is DefaultTreeAdapterMap["textNode"] {
  return commonIsText(node);
}

export function getAttr(el: HtmlElement, name: string): string | undefined {
  return commonGetAttr(el, name);
}

export function hasClass(el: HtmlElement, cls: string): boolean {
  return commonHasClass(el, cls);
}

/**
 * The visible text of a node: entities are already decoded by parse5,
 * `<br>` becomes a space, comments are dropped and whitespace (including
 * non-breaking spaces) is collapsed.
 */
export function textOf(node: HtmlNode): string {
  return extractText(node);
}
