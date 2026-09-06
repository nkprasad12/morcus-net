import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { EntryResult, EntryOutline } from "@/common/dictionaries/dict_result";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { processWords, removeDiacritics } from "@/common/text_cleaning";
import { XmlChild } from "@/common/xml/xml_node";
import { renderPageShell } from "@/web/v2/server/page_shell";
import * as he from "he";

const DICT_NAMES: Record<string, string> = {
  "L&S": "Lewis & Short (Latin-English)",
  "S&H": "Smith & Hall (English-Latin)",
  GAF: "Gaffiot (Latin-French)",
  GRG: "Georges (Latin-German)",
  EGL: "Pozo (Latin-Spanish)",
  GES: "Gesner (Latin-Latin)",
  FOR: "Forcellini (Latin-Latin)",
  "R&A": "Riddle & Arnold (English-Latin)",
  NUM: "Latin Numerals",
  // Legacy or lowercase keys fallback
  ls: "Lewis & Short (Latin-English)",
  sh: "Smith & Hall (English-Latin)",
  gaffiot: "Gaffiot (Latin-French)",
  georges: "Georges (Latin-German)",
  pozo: "Pozo (Latin-Spanish)",
  gesner: "Gesner (Latin-Latin)",
  forcellini: "Forcellini (Latin-Latin)",
  riddle_arnold: "Riddle & Arnold (English-Latin)",
  numeral: "Latin Numerals",
};

/**
 * Recursively converts an XmlNode tree into a clean semantic HTML string.
 */
export interface XmlNodeToHtmlOptions {
  allowLinkify?: boolean;
}

export function linkifyText(text: string): string {
  const parts = processWords(text, (word) => {
    const cleanWord = removeDiacritics(word).replaceAll("-", "").trim();
    const isLatinWord = !/\d/.test(word) && /[a-zA-Z]/.test(cleanWord);
    if (isLatinWord) {
      const href = `/v2/dicts?q=${encodeURIComponent(cleanWord)}`;
      return `<a href="${he.encode(href)}" class="v2-lat-word">${he.encode(
        word
      )}</a>`;
    }
    return he.encode(word);
  });
  return parts.join("");
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

export function xmlNodeToHtml(
  node: XmlChild,
  options?: XmlNodeToHtmlOptions
): string {
  if (typeof node === "string") {
    if (options?.allowLinkify !== false) {
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

  // Rewrite relative internal links to dictionary searches
  const currentHref = attrsMap.get("href");
  if (
    currentHref &&
    !currentHref.includes("://") &&
    !currentHref.startsWith("/") &&
    !currentHref.startsWith("#")
  ) {
    attrsMap.set("href", `/v2/dicts?q=${encodeURIComponent(currentHref)}`);
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
    currentClass.includes("v2-section-anchor") ||
    currentClass.includes("v2-toc");
  const isForeign = sourceTagName === "foreign";
  const nextAllowLinkify =
    (options?.allowLinkify ?? true) &&
    !isAlreadyLink &&
    !isDisallowedClass &&
    !isForeign;

  let childrenHtml = node.children
    .map((c) => xmlNodeToHtml(c, { allowLinkify: nextAllowLinkify }))
    .join("");

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
  const idAttr = attrsMap.get("id")
    ? ` id="${he.encode(attrsMap.get("id")!)}"`
    : "";
  const titleAttr = attrsMap.get("title")
    ? ` title="${he.encode(attrsMap.get("title")!)}"`
    : "";
  const hrefAttr = attrsMap.get("href")
    ? ` href="${he.encode(attrsMap.get("href")!)}"`
    : "";
  const targetVal = attrsMap.get("target");
  const targetAttr = targetVal ? ` target="${he.encode(targetVal)}"` : "";
  const relAttr = targetVal === "_blank" ? ' rel="noopener noreferrer"' : "";
  const langVal = attrsMap.get("lang");
  const langAttr = langVal ? ` lang="${he.encode(langVal)}"` : "";
  const dirVal = attrsMap.get("dir");
  const dirAttr = dirVal ? ` dir="${he.encode(dirVal)}"` : "";

  const indentLevel = Number.parseInt(attrsMap.get("indentlevel") ?? "", 10);
  const styleAttr =
    Number.isFinite(indentLevel) && indentLevel > 0
      ? ` style="margin-left: ${indentLevel * 0.5}em;"`
      : "";

  return `<${tagName}${idAttr}${classNames}${titleAttr}${hrefAttr}${targetAttr}${relAttr}${langAttr}${dirAttr}${styleAttr}>${childrenHtml}</${tagName}>`;
}

/**
 * Renders the table of contents / outline for a dictionary entry.
 */
export function renderEntryOutline(outline?: EntryOutline): string {
  if (!outline?.senses || outline.senses.length === 0) {
    return "";
  }

  const items = outline.senses
    .map((sense) => {
      const indentStyle =
        sense.level > 0
          ? ` style="margin-left: ${sense.level * 0.75}rem;"`
          : "";
      const ordinalHtml = sense.ordinal
        ? `<strong class="v2-toc-ordinal">${he.encode(sense.ordinal)}</strong> `
        : "";
      const textHtml = he.encode(sense.text.trim());
      return `<li${indentStyle}><a href="#${he.encode(
        sense.sectionId
      )}" class="v2-toc-link">${ordinalHtml}${textHtml}</a></li>`;
    })
    .join("");

  return `
    <details class="v2-toc">
      <summary class="v2-toc-summary">Outline (${outline.senses.length} sections)</summary>
      <ul class="v2-toc-list">
        ${items}
      </ul>
    </details>
  `;
}

/**
 * Formats an EntryResult into semantic HTML with top tools bar / desktop side-rail.
 */
export function renderEntryResult(
  result: EntryResult,
  entryIndex: string | number = 0
): string {
  const hasOutline = Boolean(
    result.outline?.senses && result.outline.senses.length > 0
  );
  const hasInflections = Boolean(
    result.inflections && result.inflections.length > 0
  );
  const hasTools = hasOutline || hasInflections;

  let toolsHtml = "";
  if (hasTools) {
    const groupName = `entry-tools-${entryIndex}`;
    const outlineItems = hasOutline
      ? result
          .outline!.senses!.map((sense) => {
            const indentStyle =
              sense.level > 0
                ? ` style="margin-left: ${sense.level * 0.75}rem;"`
                : "";
            const ordinalHtml = sense.ordinal
              ? `<strong class="v2-toc-ordinal">${he.encode(
                  sense.ordinal
                )}</strong> `
              : "";
            const textHtml = he.encode(sense.text.trim());
            return `<li${indentStyle}><a href="#${he.encode(
              sense.sectionId
            )}" class="v2-toc-link">${ordinalHtml}${textHtml}</a></li>`;
          })
          .join("")
      : "";

    const outlinePanelHtml = hasOutline
      ? `
        <details class="v2-tool-pane" name="${groupName}">
          <summary class="v2-tab-pill">Outline</summary>
          <div class="v2-tool-body">
            <ul class="v2-toc-list">
              ${outlineItems}
            </ul>
          </div>
        </details>
      `
      : "";

    const inflectionsRows = hasInflections
      ? result
          .inflections!.map(
            (inf) => `
            <tr>
              <td><strong>${he.encode(inf.form)}</strong></td>
              <td>${he.encode(inf.lemma)}</td>
              <td>${he.encode(inf.data)}</td>
              <td>${he.encode(inf.usageNote ?? "")}</td>
            </tr>`
          )
          .join("")
      : "";

    const inflectionsPanelHtml = hasInflections
      ? `
        <details class="v2-tool-pane" name="${groupName}">
          <summary class="v2-tab-pill">Inflections</summary>
          <div class="v2-tool-body">
            <div class="v2-table-scroller">
              <table class="v2-inflection-table">
                <thead>
                  <tr><th>Form</th><th>Lemma</th><th>Analysis</th><th>Notes</th></tr>
                </thead>
                <tbody>${inflectionsRows}</tbody>
              </table>
            </div>
          </div>
        </details>
      `
      : "";

    toolsHtml = `
      <div class="v2-entry-tools">
        <div class="v2-segmented-bar">
          ${outlinePanelHtml}
          ${inflectionsPanelHtml}
        </div>
      </div>
    `;
  }

  const entryHtml = xmlNodeToHtml(result.entry, { allowLinkify: true });

  return `
    <article class="v2-entry ${hasTools ? "has-tools" : ""}">
      ${toolsHtml}
      <div class="v2-entry-content">
        ${entryHtml}
      </div>
    </article>
  `;
}

/**
 * Renders only the results container inner HTML (used for partial AJAX swaps and full SSR).
 */
export function renderDictResultsHtml(
  query: string,
  results?: DictsFusedResponse
): string {
  if (!query.trim()) {
    return `
      <div class="v2-no-results">
        <p>Type a word (e.g. <em>equus</em>, <em>horse</em>, <em>cheval</em>, <em>Pferd</em>) to search all lexica.</p>
      </div>
    `;
  }

  if (!results) {
    return `
      <div class="v2-no-results">
        <p>No results found for "<strong>${he.escape(query)}</strong>".</p>
      </div>
    `;
  }

  const dictKeys = Object.keys(results).filter(
    (key) => results[key] && results[key].length > 0
  );

  if (dictKeys.length === 0) {
    return `
      <div class="v2-no-results">
        <p>No dictionary entries found for "<strong>${he.escape(
          query
        )}</strong>".</p>
      </div>
    `;
  }

  return dictKeys
    .map((dictKey) => {
      const entries = results[dictKey];
      const dictName =
        DICT_NAMES[dictKey] ??
        LatinDict.BY_KEY.get(dictKey)?.displayName ??
        dictKey.toUpperCase();
      const entriesHtml = entries
        .map((entry, idx) => renderEntryResult(entry, `${dictKey}-${idx}`))
        .join("");

      return `
        <details class="v2-dict-card" open>
          <summary class="v2-dict-summary">
            <span>${he.encode(dictName)}</span>
            <span class="v2-badge">${entries.length} ${
        entries.length === 1 ? "entry" : "entries"
      }</span>
          </summary>
          <div class="v2-dict-body">
            ${entriesHtml}
          </div>
        </details>
      `;
    })
    .join("\n");
}

export interface DictPageOptions {
  query: string;
  results?: DictsFusedResponse;
  isIdSearch?: boolean;
}

/**
 * Renders the full standalone HTML page for UI V2.
 */
export function renderDictPageHtml(options: DictPageOptions): string {
  const query = options.query || "";
  const queryEscaped = he.escape(query);
  const resultsHtml = renderDictResultsHtml(options.query, options.results);

  const titlePrefix = options.isIdSearch ? `ID ${query}` : query;

  const contentHtml = `
    <morcus-dict-search>
      <form class="v2-search-form" action="/v2/dicts" method="GET">
        <div class="v2-input-wrapper">
          <input
            type="text"
            name="q"
            class="v2-input"
            value="${options.isIdSearch ? "" : queryEscaped}"
            placeholder="Search for a word (e.g. equus, horse, cheval, Pferd)..."
            autocomplete="off"
          />
        </div>
        <button type="submit" class="v2-button">Search</button>
      </form>

      <output id="dict-results" class="v2-results">
        ${resultsHtml}
      </output>
    </morcus-dict-search>
  `;

  return renderPageShell({
    title: options.query
      ? `${titlePrefix} - Morcus Dictionary`
      : "Morcus Dictionary (UI V2)",
    activePage: "dicts",
    contentHtml,
  });
}
