import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { XmlChild } from "@/common/xml/xml_node";
import { renderPageShell } from "@/web/pe/server/page_shell";
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
export function xmlNodeToHtml(node: XmlChild): string {
  if (typeof node === "string") {
    return he.encode(node);
  }

  const tagName = node.name.toLowerCase() === "span" ? "span" : "div";
  const attrsMap = new Map<string, string>();
  for (const [k, v] of node.attrs) {
    attrsMap.set(k.toLowerCase(), v);
  }

  const classNames = attrsMap.get("class")
    ? ` class="${he.encode(attrsMap.get("class")!)}"`
    : "";
  const idAttr = attrsMap.get("id")
    ? ` id="${he.encode(attrsMap.get("id")!)}"`
    : "";
  const titleAttr = attrsMap.get("title")
    ? ` title="${he.encode(attrsMap.get("title")!)}"`
    : "";

  const childrenHtml = node.children.map((c) => xmlNodeToHtml(c)).join("");
  return `<${tagName}${idAttr}${classNames}${titleAttr}>${childrenHtml}</${tagName}>`;
}

/**
 * Formats an EntryResult into semantic HTML.
 */
export function renderEntryResult(result: EntryResult): string {
  const entryHtml = xmlNodeToHtml(result.entry);

  let inflectionsHtml = "";
  if (result.inflections && result.inflections.length > 0) {
    const rows = result.inflections
      .map(
        (inf) => `
        <tr>
          <td><strong>${he.encode(inf.form)}</strong></td>
          <td>${he.encode(inf.lemma)}</td>
          <td>${he.encode(inf.data)}</td>
          <td>${he.encode(inf.usageNote ?? "")}</td>
        </tr>`
      )
      .join("");

    inflectionsHtml = `
      <details class="pe-inflections">
        <summary>Morphological Inflections (${result.inflections.length})</summary>
        <table class="pe-inflection-table">
          <thead>
            <tr><th>Form</th><th>Lemma</th><th>Analysis</th><th>Notes</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    `;
  }

  return `
    <article class="pe-entry">
      ${entryHtml}
      ${inflectionsHtml}
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
      <div class="pe-no-results">
        <p>Type a Latin word (e.g. <em>caesar</em>, <em>amo</em>, <em>bellum</em>) to search all Latin lexica.</p>
      </div>
    `;
  }

  if (!results) {
    return `
      <div class="pe-no-results">
        <p>No results found for "<strong>${he.encode(query)}</strong>".</p>
      </div>
    `;
  }

  const dictKeys = Object.keys(results).filter(
    (key) => results[key] && results[key].length > 0
  );

  if (dictKeys.length === 0) {
    return `
      <div class="pe-no-results">
        <p>No dictionary entries found for "<strong>${he.encode(
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
      const entriesHtml = entries.map(renderEntryResult).join("");

      return `
        <details class="pe-dict-card" open>
          <summary class="pe-dict-summary">
            <span>${he.encode(dictName)}</span>
            <span class="pe-badge">${entries.length} ${
        entries.length === 1 ? "entry" : "entries"
      }</span>
          </summary>
          <div class="pe-dict-body">
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
}

/**
 * Renders the full standalone HTML page for progressive enhancement.
 */
export function renderDictPageHtml(options: DictPageOptions): string {
  const queryEncoded = he.encode(options.query || "");
  const resultsHtml = renderDictResultsHtml(options.query, options.results);

  const contentHtml = `
    <header class="pe-header">
      <h1>Morcus Latin Dictionary</h1>
      <p>Progressive enhancement prototype with zero-JS support and Lit custom elements.</p>
    </header>

    <morcus-dict-search>
      <form class="pe-search-form" action="/pe/dicts" method="GET">
        <div class="pe-input-wrapper">
          <input
            type="text"
            name="q"
            class="pe-input"
            value="${queryEncoded}"
            placeholder="Search Latin word (e.g. caesar, virtus)..."
            autocomplete="off"
            autofocus
          />
        </div>
        <button type="submit" class="pe-button">Search</button>
      </form>

      <output id="dict-results" class="pe-results">
        ${resultsHtml}
      </output>
    </morcus-dict-search>
  `;

  return renderPageShell({
    title: options.query
      ? `${queryEncoded} - Morcus Dictionary`
      : "Morcus Dictionary (Progressive Enhancement)",
    activePage: "dicts",
    contentHtml,
  });
}
