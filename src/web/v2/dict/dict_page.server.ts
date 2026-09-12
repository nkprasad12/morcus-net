import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import { renderEntryResult } from "@/web/v2/dict/entry_view.server";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";
import {
  DICT_ATTRIBUTIONS,
  DICT_NAMES,
  DICT_ACRONYMS,
} from "@/web/v2/dict/dict_attribution";
import { renderDictLandingHtml } from "@/web/v2/dict/dict_landing.server";
import { hasGreek } from "@/web/v2/dict/dict_greek.common";
import { renderGreekFallbackHtml } from "@/web/v2/dict/dict_greek.server";
import * as he from "he";

export { DICT_NAMES, DICT_ACRONYMS };

/**
 * Renders only the results container inner HTML (used for partial AJAX swaps and full SSR).
 */
export function renderDictResultsHtml(
  query: string,
  results?: DictsFusedResponse,
  queriedDicts?: string[],
  isInflected: boolean = true
): string {
  if (!query.trim()) {
    return renderDictLandingHtml(queriedDicts, isInflected);
  }

  if (hasGreek(query)) {
    return renderGreekFallbackHtml(query);
  }

  if (!results) {
    return `
      <div class="v2-no-results">
        <p>No results found for "<strong>${he.escape(query)}</strong>".</p>
      </div>
    `;
  }

  // Determine all dictionaries to represent in the jump bar / transparency status
  const hitKeys = Object.keys(results).filter(
    (key) => results[key] && results[key].length > 0
  );

  // If queriedDicts was provided, use that to preserve order and show 0-hit dictionaries;
  // otherwise fallback to hitKeys.
  const allQueriedKeys =
    queriedDicts && queriedDicts.length > 0 ? queriedDicts : hitKeys;

  if (hitKeys.length === 0) {
    const queriedNames = allQueriedKeys
      .map((k) => DICT_NAMES[k] ?? LatinDict.BY_KEY.get(k)?.displayName ?? k)
      .join(", ");
    return `
      <div class="v2-no-results">
        <p>No dictionary entries found for "<strong>${he.escape(
          query
        )}</strong>".</p>
        ${
          !isInflected
            ? `<p class="v2-no-results-sub v2-inflected-hint">
                Exact headword search is active.
                <a href="/v2/dicts?q=${encodeURIComponent(
                  query
                )}&o=1" class="v2-link">Enable inflected search</a> to find conjugated verbs and declined nouns.
              </p>`
            : ""
        }
        ${
          queriedNames
            ? `<p class="v2-no-results-sub">Searched: ${he.encode(
                queriedNames
              )}</p>`
            : ""
        }
      </div>
    `;
  }

  const totalCount = hitKeys.reduce(
    (acc, key) => acc + (results[key]?.length || 0),
    0
  );

  // Sort jump pills so dictionaries with results come first, followed by zero-hit dictionaries
  const sortedPillKeys = [...allQueriedKeys].sort((a, b) => {
    const countA = results[a]?.length || 0;
    const countB = results[b]?.length || 0;
    if (countA > 0 && countB === 0) return -1;
    if (countA === 0 && countB > 0) return 1;
    return 0; // maintain relative queried order
  });

  const pillsHtml = sortedPillKeys
    .map((dictKey) => {
      const entries = results[dictKey] || [];
      const shortName =
        DICT_NAMES[dictKey] ??
        LatinDict.BY_KEY.get(dictKey)?.displayName ??
        dictKey.toUpperCase();
      const dictAcronym =
        DICT_ACRONYMS[dictKey] ??
        DICT_ACRONYMS[dictKey.toLowerCase()] ??
        dictKey.toUpperCase();
      const count = entries.length;
      const cardId = `dict-${dictKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      if (count > 0) {
        return `<a href="#${cardId}" class="v2-jump-pill" title="Jump to ${he.encode(
          shortName
        )} (${count} ${
          count === 1 ? "entry" : "entries"
        })"><span class="v2-jump-pill-name">${he.encode(
          dictAcronym
        )}</span><span class="v2-jump-pill-count">${count}</span></a>`;
      } else {
        return `<span class="v2-jump-pill v2-jump-pill-zero" title="No entries found in ${he.encode(
          shortName
        )}"><span class="v2-jump-pill-name">${he.encode(
          dictAcronym
        )}</span><span class="v2-jump-pill-count">0</span></span>`;
      }
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

  const cardsHtml = hitKeys
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
                  <span class="v2-dict-collapsed-badge">${totalEntries} ${
        totalEntries === 1 ? "entry" : "entries"
      }</span>
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
  queriedDicts?: string[];
  isInflected?: boolean;
  isIdSearch?: boolean;
  embedded?: boolean;
}

/**
 * Renders the full standalone HTML page for UI V2.
 */
export function renderDictPageHtml(options: DictPageOptions): string {
  const query = options.query || "";
  const isInflected = options.isInflected !== false;
  const resultsHtml = renderDictResultsHtml(
    options.query,
    options.results,
    options.queriedDicts,
    isInflected
  );

  const titlePrefix = options.isIdSearch ? `ID ${query}` : query;
  const isEmbedded = options.embedded ?? false;

  const contentHtml = `
    <morcus-dict-search>
      ${renderDictSearchBar({
        query: options.isIdSearch ? "" : options.query,
        action: "/v2/dicts",
        activeDicts: options.queriedDicts,
        isInflected: isInflected,
        extraHiddenInputs: isEmbedded ? { embedded: "1" } : undefined,
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
    hideAppBar: isEmbedded,
  });
}
