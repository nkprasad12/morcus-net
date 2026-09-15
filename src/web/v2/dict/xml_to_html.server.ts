import { XmlChild } from "@/common/xml/xml_node";
import { linkifyText } from "@/web/v2/dict/linkify.server";
import * as he from "he";

export interface XmlNodeToHtmlOptions {
  allowLinkify?: boolean;
  omitRootId?: boolean;
  /**
   * Ids of elements that a subsection query matched. These are marked so the
   * reader can spot the match while scrolling, without having to click.
   */
  matchedSubsectionIds?: Set<string>;
  /**
   * Every `id` already defined somewhere in the entry's XML. Sense bullets link
   * to `#senseid`, but only a node with an explicit `id` attribute ever emits
   * one, so a bullet whose id is not in this set has to carry the anchor itself
   * or its link dangles.
   */
  existingIds?: Set<string>;
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
    return he.escape(node);
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
      `${attrsMap.get("class") ?? rawClass} section-anchor`.trim()
    );
    attrsMap.set("title", "Copy link to this section");
    // Nothing else in the entry defines this id, so the bullet becomes its own
    // anchor target. Guarded on `existingIds` to avoid emitting a duplicate id
    // when an ancestor (e.g. the enclosing <li> in Lewis & Short) already has it.
    if (
      options?.existingIds !== undefined &&
      !options.existingIds.has(senseId)
    ) {
      attrsMap.set("id", senseId);
    }
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
      `${attrsMap.get("class") ?? rawClass} action-btn forc-action-btn`.trim()
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

  // Flag the element a subsection query matched so it stands out in the body.
  const nodeId = attrsMap.get("id");
  if (
    nodeId !== undefined &&
    options?.matchedSubsectionIds?.has(nodeId) === true
  ) {
    attrsMap.set(
      "class",
      `${attrsMap.get("class") ?? ""} subsection-hit`.trim()
    );
    attrsMap.set("aria-current", "location");
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
    currentClass.includes("action-btn") ||
    currentClass.includes("section-anchor") ||
    currentClass.includes("toc");
  const isForeign = sourceTagName === "foreign";
  const nextAllowLinkify =
    Boolean(options?.allowLinkify) &&
    !isAlreadyLink &&
    !isDisallowedClass &&
    !isForeign;

  let childrenHtml = node.children
    .map((c) =>
      xmlNodeToHtml(c, {
        allowLinkify: nextAllowLinkify,
        matchedSubsectionIds: options?.matchedSubsectionIds,
        existingIds: options?.existingIds,
      })
    )
    .join("");

  // In Forcellini, render an explicit action button label with external link icon
  if (rawClass.includes("forcNewTab")) {
    const linkText = childrenHtml.trim();
    childrenHtml = `<span class="action-btn-icon" aria-hidden="true">&#x2197;</span><span class="action-btn-text">Open in new tab${
      linkText ? ` (${linkText})` : ""
    }</span>`;
  }

  // In Smith & Hall, dLink nodes may have empty children and store the display text in attrs.text
  const dLinkText = attrsMap.get("text");
  if (
    childrenHtml === "" &&
    dLinkText !== undefined &&
    rawClass.includes("dLink")
  ) {
    childrenHtml = he.escape(dLinkText);
  }

  const finalClass = attrsMap.get("class");
  const classNames = finalClass ? ` class="${he.escape(finalClass)}"` : "";
  const idVal = attrsMap.get("id");
  const idAttr =
    idVal && !options?.omitRootId ? ` id="${he.escape(idVal)}"` : "";
  const titleVal = attrsMap.get("title");
  const titleAttr = titleVal ? ` title="${he.escape(titleVal)}"` : "";
  const tabindexVal = attrsMap.get("tabindex");
  const tabindexAttr =
    tabindexVal !== undefined ? ` tabindex="${he.escape(tabindexVal)}"` : "";
  const hrefVal = attrsMap.get("href");
  const hrefAttr = hrefVal ? ` href="${he.escape(hrefVal)}"` : "";
  const targetVal = attrsMap.get("target");
  const targetAttr = targetVal ? ` target="${he.escape(targetVal)}"` : "";
  const relAttr = targetVal === "_blank" ? ' rel="noopener noreferrer"' : "";
  const roleVal = attrsMap.get("role");
  const roleAttr = roleVal ? ` role="${he.escape(roleVal)}"` : "";
  const langVal = attrsMap.get("lang");
  const langAttr = langVal ? ` lang="${he.escape(langVal)}"` : "";
  const dirVal = attrsMap.get("dir");
  const dirAttr = dirVal ? ` dir="${he.escape(dirVal)}"` : "";
  const ariaCurrentVal = attrsMap.get("aria-current");
  const ariaCurrentAttr = ariaCurrentVal
    ? ` aria-current="${he.escape(ariaCurrentVal)}"`
    : "";

  const indentLevel = Number.parseInt(attrsMap.get("indentlevel") ?? "", 10);
  const styleAttr =
    Number.isFinite(indentLevel) && indentLevel > 0
      ? ` style="margin-left: ${indentLevel * 0.5}em;"`
      : "";

  const baseHtml = `<${tagName}${idAttr}${classNames}${titleAttr}${tabindexAttr}${hrefAttr}${targetAttr}${relAttr}${roleAttr}${langAttr}${dirAttr}${ariaCurrentAttr}${styleAttr}>${childrenHtml}</${tagName}>`;

  if (isMateoLink && currentHref) {
    const encodedHref = he.escape(currentHref);
    return `
      <span class="mateo-wrapper">
        ${baseHtml}
        <details class="mateo-embed-pane">
          <summary class="action-btn mateo-toggle-btn" role="button" title="Toggle embedded facsimile viewer">
            <span class="action-btn-icon" aria-hidden="true">&#x1F5C1;</span>
            <span class="action-btn-text">Plate Embed</span>
          </summary>
          <span class="mateo-frame-wrapper">
            <iframe src="${encodedHref}" class="mateo-frame" loading="lazy" title="Facsimile plate from mateo.uni-mannheim.de"></iframe>
          </span>
        </details>
      </span>
    `.trim();
  }

  return baseHtml;
}
