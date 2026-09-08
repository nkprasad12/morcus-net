import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import { renderEntryResult } from "@/web/v2/dict/entry_view.server";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";
import { DICT_ATTRIBUTIONS } from "@/web/v2/dict/dict_attribution";
import * as he from "he";

export const DICT_NAMES: Record<string, string> = {
  "L&S": "Lewis & Short",
  "S&H": "Smith & Hall",
  GAF: "Gaffiot",
  GRG: "Georges",
  EGL: "Pozo",
  GES: "Gesner",
  FOR: "Forcellini",
  "R&A": "Riddle & Arnold",
  NUM: "Latin Numerals",
  // Legacy or lowercase keys fallback
  ls: "Lewis & Short",
  sh: "Smith & Hall",
  gaffiot: "Gaffiot",
  georges: "Georges",
  pozo: "Pozo",
  gesner: "Gesner",
  forcellini: "Forcellini",
  riddle_arnold: "Riddle & Arnold",
  numeral: "Latin Numerals",
};

export const DICT_SHORT_NAMES: Record<string, string> = {
  "L&S": "Lewis & Short",
  "S&H": "Smith & Hall",
  GAF: "Gaffiot",
  GRG: "Georges",
  EGL: "Pozo",
  GES: "Gesner",
  FOR: "Forcellini",
  "R&A": "Riddle & Arnold",
  NUM: "Numerals",
  ls: "Lewis & Short",
  sh: "Smith & Hall",
  gaffiot: "Gaffiot",
  georges: "Georges",
  pozo: "Pozo",
  gesner: "Gesner",
  forcellini: "Forcellini",
  riddle_arnold: "Riddle & Arnold",
  numeral: "Numerals",
};

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
        <p>Type a word (e.g. <em>equōrum</em>, <em>equus</em>, <em>horse</em>, <em>cheval</em>, <em>Pferd</em>) to search all lexica.</p>
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

  const totalCount = dictKeys.reduce(
    (acc, key) => acc + (results[key]?.length || 0),
    0
  );

  const pillsHtml = dictKeys
    .map((dictKey) => {
      const entries = results[dictKey];
      const shortName =
        DICT_SHORT_NAMES[dictKey] ??
        DICT_NAMES[dictKey] ??
        LatinDict.BY_KEY.get(dictKey)?.displayName ??
        dictKey.toUpperCase();
      const count = entries.length;
      const cardId = `dict-${dictKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      return `<a href="#${cardId}" class="v2-jump-pill"><span class="v2-jump-pill-name">${he.encode(
        shortName
      )}</span><span class="v2-jump-pill-count">${count}</span></a>`;
    })
    .join("");

  const jumpBarHtml = `
    <nav class="v2-results-nav" aria-label="Jump to dictionary">
      <div class="v2-results-pills">
        ${pillsHtml}
      </div>
      <div class="v2-results-total">
        ${totalCount} ${totalCount === 1 ? "result" : "results"}
      </div>
    </nav>
  `;

  const cardsHtml = dictKeys
    .map((dictKey) => {
      const entries = results[dictKey];
      const dictName =
        DICT_NAMES[dictKey] ??
        LatinDict.BY_KEY.get(dictKey)?.displayName ??
        dictKey.toUpperCase();
      const totalEntries = entries.length;
      const cardId = `dict-${dictKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

      let quickJumpHtml = "";
      if (totalEntries > 1) {
        const jumpLinks = entries
          .map((entry, idx) => {
            const headword =
              entry.outline?.mainLabel?.trim() ||
              entry.outline?.mainKey?.trim() ||
              entry.outline?.mainSection?.text?.trim() ||
              `Entry ${idx + 1}`;
            const entryAnchor = entry.outline.mainSection.sectionId;
            return `<li><a href="#${entryAnchor}" class="v2-entry-nav-link"><span class="v2-entry-nav-word">${he.encode(
              headword
            )}</span></a></li>`;
          })
          .join("");

        quickJumpHtml = `
          <div class="v2-entry-nav" aria-label="Jump to entry">
            <span class="v2-entry-nav-label">Jump to</span>
            <ul class="v2-entry-nav-list">
              ${jumpLinks}
            </ul>
          </div>
        `;
      }

      const entriesHtml = entries
        .map((entry, idx) =>
          renderEntryResult(entry, `${dictKey}-${idx}`, idx + 1, totalEntries)
        )
        .join("");

      let attrHtml = "";
      const attrInfo = DICT_ATTRIBUTIONS[dictKey];
      if (attrInfo) {
        attrHtml = `
          <details class="v2-dict-source-pane" name="v2-dict-source">
            <summary class="v2-dict-source-btn" title="View dictionary source information">
              <span class="v2-dict-source-btn-icon" aria-hidden="true">&#x24D8;</span>
              <span class="v2-dict-source-btn-text">Source</span>
            </summary>
            <div class="v2-dict-source-popover">
              <div class="v2-dict-source-popover-title">Source &amp; Attribution</div>
              <div class="v2-dict-source-popover-body">${attrInfo.detailsHtml}</div>
            </div>
          </details>
        `;
      }

      return `
        <section class="v2-dict-card" id="${cardId}">
          <header class="v2-dict-header">
            <div class="v2-dict-header-row">
              <details class="v2-dict-toggle" open>
                <summary class="v2-dict-summary">
                  <span class="v2-dict-toggle-icon" aria-hidden="true"></span>
                  <span class="v2-dict-title">${he.encode(dictName)}</span>
                  <span class="v2-dict-collapsed-badge">${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}</span>
                </summary>
              </details>
              ${attrHtml}
            </div>
            ${quickJumpHtml}
          </header>
          <div class="v2-dict-body">
            ${entriesHtml}
          </div>
        </section>
      `;
    })
    .join("\n");

  return `${jumpBarHtml}\n${cardsHtml}`;
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
  const resultsHtml = renderDictResultsHtml(options.query, options.results);

  const titlePrefix = options.isIdSearch ? `ID ${query}` : query;

  const contentHtml = `
    <morcus-dict-search>
      ${renderDictSearchBar({
        query: options.isIdSearch ? "" : options.query,
        action: "/v2/dicts",
      })}

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
