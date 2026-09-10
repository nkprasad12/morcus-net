import { XmlChild } from "@/common/xml/xml_node";
import { linkifyText } from "@/web/v2/dict/linkify.server";
import * as he from "he";

export interface XmlNodeToHtmlOptions {
  allowLinkify?: boolean;
  omitRootId?: boolean;
}

const ALLOWED_TAGS = new Set([
  // Inline phrasing
  "span",
  "i",
  "b",
  "em",
  "strong",
  "u",
  "s",
  "sup",
  "sub",
  "small",
  "code",
  "a",
  // Lists
  "ol",
  "ul",
  "li",
  // Blocks
  "div",
  "p",
  // Tables (e.g. Numeral dictionary)
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const VOID_TAGS = new Set(["br", "hr"]);

/**
 * Recursively converts an XmlNode tree into a clean semantic HTML string.
 */
export function xmlNodeToHtml(
  node: XmlChild,
  options?: XmlNodeToHtmlOptions
): string {
  if (typeof node === "string") {
    if (options?.allowLinkify) {
      return linkifyText(node);
    }
    return he.encode(node);
  }

  const sourceTagName = node.name.toLowerCase();
  let tagName = ALLOWED_TAGS.has(sourceTagName)
    ? sourceTagName
    : VOID_TAGS.has(sourceTagName)
    ? sourceTagName
    : "div";

  const attrsMap = new Map<string, string>();
  for (const [k, v] of node.attrs) {
    attrsMap.set(k.toLowerCase(), v);
  }

  const rawClass = attrsMap.get("class") ?? "";

  // Map TEI XML tags (common in Gesner) to standard HTML elements
  if (sourceTagName === "emph") {
    tagName = "b";
    attrsMap.set("class", `${rawClass} lsEmph`.trim());
  } else if (sourceTagName === "hi") {
    const rend = attrsMap.get("rend");
    tagName = rend === "italic" ? "i" : rend === "bold" ? "b" : "span";
  } else if (sourceTagName === "foreign") {
    tagName = "span";
    if (attrsMap.get("lang") === "GR") {
      attrsMap.set("lang", "el");
    }
  } else if (sourceTagName === "orth") {
    tagName = "b";
    attrsMap.set("class", `${rawClass} lsOrth`.trim());
  } else if (
    sourceTagName === "ref" ||
    sourceTagName === "corr" ||
    sourceTagName === "unclear" ||
    sourceTagName === "gap" ||
    sourceTagName === "note" ||
    sourceTagName === "pb"
  ) {
    tagName = "span";
  } else if (sourceTagName === "def") {
    tagName = "div";
  }

  const isSenseBullet = rawClass.includes("lsSenseBullet");
  const senseId = attrsMap.get("senseid");

  // Transform sense bullets with a senseid into anchor permalinks
  if (isSenseBullet && senseId) {
    tagName = "a";
    attrsMap.set("href", `#${senseId}`);
    attrsMap.set(
      "class",
      `${attrsMap.get("class") ?? rawClass} v2-section-anchor`.trim()
    );
    attrsMap.set("title", "Direct link to this section");
  }

  // Transform Smith & Hall cross-reference links (<span class="dLink" to="..." text="...">)
  if (rawClass.includes("dLink")) {
    const toQuery = attrsMap.get("to");
    if (toQuery) {
      tagName = "a";
      attrsMap.set("href", `/v2/dicts?q=${encodeURIComponent(toQuery)}`);
    }
  }

  // Transform Forcellini external links (<a class="forcNewTab" href="..." target="_blank">word</a>)
  // into an explicit action button with external link icon
  if (rawClass.includes("forcNewTab")) {
    tagName = "a";
    attrsMap.set(
      "class",
      `${
        attrsMap.get("class") ?? rawClass
      } v2-action-btn v2-forc-action-btn`.trim()
    );
    attrsMap.set("target", "_blank");
    attrsMap.set("rel", "noopener noreferrer");
    attrsMap.set("role", "button");
    attrsMap.set("title", "Open full entry on lexica.linguax.com in new tab");
  }

  // Transform Mateo (Univ. of Mannheim) plate links into external links
  const currentHref = attrsMap.get("href");
  const isMateoLink =
    tagName === "a" &&
    Boolean(currentHref?.startsWith("https://mateo.uni-mannheim.de"));
  if (isMateoLink) {
    attrsMap.set("target", "_blank");
    attrsMap.set("rel", "noopener noreferrer");
    attrsMap.set("title", "View plate on mateo.uni-mannheim.de");
  }

  // Rewrite relative internal links to dictionary searches
  if (
    currentHref &&
    !currentHref.includes("://") &&
    !currentHref.startsWith("/") &&
    !currentHref.startsWith("#")
  ) {
    attrsMap.set("href", `/v2/dicts?q=${encodeURIComponent(currentHref)}`);
  }

  // Mark expandable abbreviations and hover elements focusable for keyboard navigation and No-JS mobile focus
  const isAbbr =
    rawClass.includes("lsHover") ||
    (attrsMap.has("title") && tagName !== "a" && !isSenseBullet);
  if (isAbbr) {
    attrsMap.set("tabindex", "0");
  }

  if (VOID_TAGS.has(tagName)) {
    return `<${tagName}>`;
  }

  const isAlreadyLink = tagName === "a";
  const currentClass = attrsMap.get("class") ?? "";
  const isDisallowedClass =
    currentClass.includes("lsOrth") ||
    currentClass.includes("lsEmph") ||
    currentClass.includes("lsHover") ||
    currentClass.includes("lsSenseBullet") ||
    currentClass.includes("dLink") ||
    currentClass.includes("forcNewTab") ||
    currentClass.includes("v2-action-btn") ||
    currentClass.includes("v2-section-anchor") ||
    currentClass.includes("v2-toc");
  const isForeign = sourceTagName === "foreign";
  const nextAllowLinkify =
    Boolean(options?.allowLinkify) &&
    !isAlreadyLink &&
    !isDisallowedClass &&
    !isForeign;

  let childrenHtml = node.children
    .map((c) => xmlNodeToHtml(c, { allowLinkify: nextAllowLinkify }))
    .join("");

  // In Forcellini, render an explicit action button label with external link icon
  if (rawClass.includes("forcNewTab")) {
    const linkText = childrenHtml.trim();
    childrenHtml = `<span class="v2-action-btn-icon" aria-hidden="true">&#x2197;</span><span class="v2-action-btn-text">Open in new tab${
      linkText ? ` (${linkText})` : ""
    }</span>`;
  }

  // In Smith & Hall, dLink nodes may have empty children and store the display text in attrs.text
  if (
    childrenHtml === "" &&
    attrsMap.has("text") &&
    rawClass.includes("dLink")
  ) {
    childrenHtml = he.encode(attrsMap.get("text")!);
  }

  const finalClass = attrsMap.get("class");
  const classNames = finalClass ? ` class="${he.encode(finalClass)}"` : "";
  const idAttr =
    attrsMap.get("id") && !options?.omitRootId
      ? ` id="${he.encode(attrsMap.get("id")!)}"`
      : "";
  const titleAttr = attrsMap.get("title")
    ? ` title="${he.encode(attrsMap.get("title")!)}"`
    : "";
  const tabindexVal = attrsMap.get("tabindex");
  const tabindexAttr =
    tabindexVal !== undefined ? ` tabindex="${he.encode(tabindexVal)}"` : "";
  const hrefAttr = attrsMap.get("href")
    ? ` href="${he.encode(attrsMap.get("href")!)}"`
    : "";
  const targetVal = attrsMap.get("target");
  const targetAttr = targetVal ? ` target="${he.encode(targetVal)}"` : "";
  const relAttr = targetVal === "_blank" ? ' rel="noopener noreferrer"' : "";
  const roleVal = attrsMap.get("role");
  const roleAttr = roleVal ? ` role="${he.encode(roleVal)}"` : "";
  const langVal = attrsMap.get("lang");
  const langAttr = langVal ? ` lang="${he.encode(langVal)}"` : "";
  const dirVal = attrsMap.get("dir");
  const dirAttr = dirVal ? ` dir="${he.encode(dirVal)}"` : "";

  const indentLevel = Number.parseInt(attrsMap.get("indentlevel") ?? "", 10);
  const styleAttr =
    Number.isFinite(indentLevel) && indentLevel > 0
      ? ` style="margin-left: ${indentLevel * 0.5}em;"`
      : "";

  const baseHtml = `<${tagName}${idAttr}${classNames}${titleAttr}${tabindexAttr}${hrefAttr}${targetAttr}${relAttr}${roleAttr}${langAttr}${dirAttr}${styleAttr}>${childrenHtml}</${tagName}>`;

  if (isMateoLink && currentHref) {
    const encodedHref = he.encode(currentHref);
    return `
      <span class="v2-mateo-wrapper">
        ${baseHtml}
        <details class="v2-mateo-embed-pane">
          <summary class="v2-action-btn v2-mateo-toggle-btn" role="button" title="Toggle embedded facsimile viewer">
            <span class="v2-action-btn-icon" aria-hidden="true">&#x1F5C1;</span>
            <span class="v2-action-btn-text">Plate Embed</span>
          </summary>
          <span class="v2-mateo-frame-wrapper">
            <iframe src="${encodedHref}" class="v2-mateo-frame" loading="lazy" title="Facsimile plate from mateo.uni-mannheim.de"></iframe>
          </span>
        </details>
      </span>
    `.trim();
  }

  return baseHtml;
}
