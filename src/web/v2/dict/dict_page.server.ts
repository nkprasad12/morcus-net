import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import { renderEntryResult } from "@/web/v2/dict/entry_view.server";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";
import {
  DICT_ATTRIBUTIONS,
  DICT_NAMES,
  DICT_ACRONYMS,
  resolveDictDisplayName,
  resolveDictAcronym,
  dictCardId,
  resolveDictLang,
} from "@/web/v2/dict/dict_attribution.server";
import { renderDictLandingHtml } from "@/web/v2/dict/dict_landing.server";
import { hasGreek } from "@/web/v2/dict/dict_greek.common";
import { renderGreekFallbackHtml } from "@/web/v2/dict/dict_greek.server";
import { buildTocTree, renderDictTocHtml } from "@/web/v2/dict/dict_toc.server";
import * as he from "he";

export {
  DICT_NAMES,
  DICT_ACRONYMS,
  resolveDictDisplayName,
  resolveDictAcronym,
  dictCardId,
  resolveDictLang,
};

export interface DictResultsOptions {
  queriedDicts?: string[];
  isInflected?: boolean;
  isEmbedded?: boolean;
}

/**
 * Renders the error partial shown when a dictionary lookup fails.
 *
 * `term` is user-controlled (a raw search query or entry id), so it is escaped.
 * Kept here beside the other `.no-results` renderers so the router never
 * hand-builds this markup — an earlier inline copy in the router dropped the
 * escaping and reflected the query straight back into the response.
 */
export function renderDictErrorHtml(
  term: string,
  isIdSearch: boolean = false
): string {
  const action = isIdSearch ? "retrieving ID" : "searching for";
  return `<div class="no-results"><p>An error occurred ${action} "${he.escape(
    term
  )}".</p></div>`;
}

/**
 * Renders the generic empty-state when no dictionary results object is provided.
 */
export function renderNoResultsHtml(query: string): string {
  return `
      <div class="no-results">
        <p>No results found for "<strong>${he.escape(query)}</strong>".</p>
      </div>
    `;
}

export interface NoEntriesOptions {
  query: string;
  queriedDicts?: string[];
  isInflected?: boolean;
}

/**
 * Renders the zero-hit state when active dictionaries returned 0 matching entries,
 * including exact headword / inflected guidance and queried lexicon names.
 */
export function renderNoEntriesHtml(options: NoEntriesOptions): string {
  const { query, queriedDicts, isInflected = true } = options;
  const queriedNames = (queriedDicts ?? [])
    .map(resolveDictDisplayName)
    .join(", ");
  return `
      <div class="no-results">
        <p>No dictionary entries found for "<strong>${he.escape(
          query
        )}</strong>".</p>
        ${
          !isInflected
            ? `<p class="no-results-sub inflected-hint">
                Exact headword search is active.
                <a href="/v2/dicts?q=${encodeURIComponent(
                  query
                )}&o=1" class="link">Enable inflected search</a> to find conjugated verbs and declined nouns.
              </p>`
            : ""
        }
        ${
          queriedNames
            ? `<p class="no-results-sub">Searched: ${he.escape(
                queriedNames
              )}</p>`
            : ""
        }
      </div>
    `;
}

export interface JumpNavOptions {
  results: DictsFusedResponse;
  hitKeys: string[];
  allQueriedKeys: string[];
}

/**
 * Renders the top jump navigation pills and total entry counter across queried dictionaries.
 * Returns an empty string if 1 or fewer dictionaries produced results.
 */
export function renderJumpNavHtml(options: JumpNavOptions): string {
  const { results, hitKeys, allQueriedKeys } = options;
  if (hitKeys.length <= 1) {
    return "";
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
      const shortName = resolveDictDisplayName(dictKey);
      const dictAcronym = resolveDictAcronym(dictKey);
      const count = entries.length;
      const cardId = dictCardId(dictKey);
      if (count > 0) {
        return `<a href="#${cardId}" class="jump-pill" title="Jump to ${he.escape(
          shortName
        )} (${count} ${
          count === 1 ? "entry" : "entries"
        })"><span class="jump-pill-name">${he.escape(
          dictAcronym
        )}</span><span class="jump-pill-count">${count}</span></a>`;
      } else {
        return `<span class="jump-pill jump-pill-zero" title="No entries found in ${he.escape(
          shortName
        )}"><span class="jump-pill-name">${he.escape(
          dictAcronym
        )}</span><span class="jump-pill-count">0</span></span>`;
      }
    })
    .join("");

  return `
      <nav class="results-nav" aria-label="Jump to dictionary">
        <div class="results-pills">
          ${pillsHtml}
        </div>
        <div class="results-total">
          ${totalCount} ${totalCount === 1 ? "result" : "results"}
        </div>
      </nav>
    `;
}

export interface DictCardOptions {
  dictKey: string;
  entries: EntryResult[];
  isEmbedded?: boolean;
}

/**
 * Renders quick-jump sub-navigation when a dictionary has multiple entries.
 */
function renderEntryQuickJumpHtml(entries: EntryResult[]): string {
  if (entries.length <= 1) {
    return "";
  }

  const jumpLinks = entries
    .map((entry, idx) => {
      const rawHeadword =
        entry.outline?.mainLabel?.trim() ||
        entry.outline?.mainKey?.trim() ||
        entry.outline?.mainSection?.text?.trim() ||
        `Entry ${idx + 1}`;
      const headword = rawHeadword.replace(/<[^>]+>/g, "").trim();
      const entryAnchor = entry.outline.mainSection.sectionId;
      return `<li><a href="#${entryAnchor}" class="entry-nav-link"><span class="entry-nav-word">${he.escape(
        headword
      )}</span></a></li>`;
    })
    .join("");

  return `
          <div class="entry-nav" aria-label="Jump to entry">
            <span class="entry-nav-label">Jump to</span>
            <ul class="entry-nav-list">
              ${jumpLinks}
            </ul>
          </div>
        `;
}

/**
 * Renders the source attribution popover if metadata exists for the given dictionary key.
 */
function renderDictSourceAttributionHtml(dictKey: string): string {
  const attrInfo = DICT_ATTRIBUTIONS[dictKey];
  if (!attrInfo) {
    return "";
  }

  return `
          <details class="dict-source-pane" name="dict-source">
            <summary class="dict-source-btn" title="View dictionary source information">
              <span class="dict-source-btn-icon" aria-hidden="true">&#x24D8;</span>
              <span class="dict-source-btn-text">Source</span>
            </summary>
            <div class="dict-source-popover">
              <div class="dict-source-popover-title">Source &amp; Attribution</div>
              <div class="dict-source-popover-body">${attrInfo.detailsHtml}</div>
            </div>
          </details>
        `;
}

/**
 * Renders a full dictionary card section containing header, quick-jump nav, source attribution,
 * and rendered entry results.
 */
export function renderDictCardHtml(options: DictCardOptions): string {
  const { dictKey, entries, isEmbedded = false } = options;
  const shortName = resolveDictDisplayName(dictKey);
  const dictAcronym = resolveDictAcronym(dictKey);
  const dictLang = resolveDictLang(dictKey);
  const totalEntries = entries.length;
  const cardId = dictCardId(dictKey);

  const quickJumpHtml = renderEntryQuickJumpHtml(entries);
  const attrHtml = renderDictSourceAttributionHtml(dictKey);

  const entriesHtml = entries
    .map((entry, idx) =>
      renderEntryResult(entry, `${dictKey}-${idx}`, idx + 1, totalEntries, {
        dictKey,
        dictName: shortName,
        dictAcronym,
        dictLang,
        isEmbedded,
      })
    )
    .join("");

  return `
        <section class="dict-card" id="${cardId}">
          <header class="dict-header dict-header-slim">
            <div class="dict-header-row">
              <details class="dict-toggle" open>
                <summary class="dict-summary">
                  <span class="dict-toggle-icon" aria-hidden="true"></span>
                  <span class="dict-acronym">${he.escape(dictAcronym)}</span>
                  <span class="dict-name dict-title">${he.escape(
                    shortName
                  )}</span>
                  <span class="dict-count">(${totalEntries})</span>
                </summary>
              </details>
              ${attrHtml}
            </div>
            ${quickJumpHtml}
          </header>
          <div class="dict-body">
            ${entriesHtml}
          </div>
        </section>
      `;
}

/**
 * Renders only the results container inner HTML (used for partial AJAX swaps and full SSR).
 */
export function renderDictResultsHtml(
  query: string,
  results?: DictsFusedResponse,
  options: DictResultsOptions = {}
): string {
  const { queriedDicts, isInflected = true, isEmbedded = false } = options;

  if (!query.trim()) {
    return renderDictLandingHtml(queriedDicts, isInflected);
  }

  if (hasGreek(query)) {
    return renderGreekFallbackHtml(query);
  }

  if (!results) {
    return renderNoResultsHtml(query);
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
    return renderNoEntriesHtml({
      query,
      queriedDicts: allQueriedKeys,
      isInflected,
    });
  }

  const jumpBarHtml = renderJumpNavHtml({
    results,
    hitKeys,
    allQueriedKeys,
  });

  const cardsHtml = hitKeys
    .map((dictKey) =>
      renderDictCardHtml({
        dictKey,
        entries: results[dictKey] || [],
        isEmbedded,
      })
    )
    .join("\n");

  const tocTree =
    !isEmbedded && results ? buildTocTree({ results, hitKeys }) : null;
  const hasToc = tocTree !== null;
  const tocHtml = tocTree ? renderDictTocHtml(tocTree) : "";

  return `
    <div class="results-layout${hasToc ? " has-toc" : ""}">
      ${tocHtml}
      <div class="results-main">
        ${jumpBarHtml}
        ${cardsHtml}
      </div>
    </div>
  `;
}

/**
 * Parses and clamps an optional dictionary font scale percentage between 70% and 140%.
 * Returns undefined if raw is null/undefined, NaN, or non-numeric.
 */
export function parseDictScale(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const num =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
      ? Number.parseInt(raw, 10)
      : NaN;
  if (!Number.isFinite(num)) return undefined;
  return Math.min(140, Math.max(70, num));
}

export interface DictPageOptions {
  query: string;
  results?: DictsFusedResponse;
  queriedDicts?: string[];
  isInflected?: boolean;
  isIdSearch?: boolean;
  embedded?: boolean;
  scale?: number;
}

/**
 * Renders the full standalone HTML page for UI V2.
 */
export function renderDictPageHtml(options: DictPageOptions): string {
  const query = options.query || "";
  const isInflected = options.isInflected !== false;
  const isEmbedded = options.embedded ?? false;
  const resultsHtml = renderDictResultsHtml(options.query, options.results, {
    queriedDicts: options.queriedDicts,
    isInflected,
    isEmbedded,
  });

  const titlePrefix = options.isIdSearch ? `ID ${query}` : query;

  const dictScale = parseDictScale(options.scale);
  const extraHeadHtml =
    dictScale !== undefined
      ? `<style>:root { --dict-scale: ${(dictScale / 100).toFixed(
          2
        )}; }</style>`
      : undefined;

  const contentHtml = `
    <morcus-dict-search>
      ${renderDictSearchBar({
        query: options.isIdSearch ? "" : options.query,
        action: "/v2/dicts",
        activeDicts: options.queriedDicts,
        isInflected: isInflected,
        extraHiddenInputs: isEmbedded ? { embedded: "1" } : undefined,
        includePageWidth: !isEmbedded,
      })}

      <output id="dict-results" class="results">
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
    extraHeadHtml,
  });
}
