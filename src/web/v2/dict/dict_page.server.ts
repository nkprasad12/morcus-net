import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";
import { renderEntryResult } from "@/web/v2/dict/entry_view.server";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";
import {
  DICT_ATTRIBUTIONS,
  DICT_NAMES,
  DICT_ACRONYMS,
} from "@/web/v2/dict/dict_attribution.server";
import { renderDictLandingHtml } from "@/web/v2/dict/dict_landing.server";
import { hasGreek } from "@/web/v2/dict/dict_greek.common";
import { renderGreekFallbackHtml } from "@/web/v2/dict/dict_greek.server";
import { renderDictTocHtml } from "@/web/v2/dict/dict_toc.server";
import { findDictInfo } from "@/web/v2/dict/dict_clustering.common";
import * as he from "he";

export { DICT_NAMES, DICT_ACRONYMS };

export interface DictResultsOptions {
  queriedDicts?: string[];
  isInflected?: boolean;
  isEmbedded?: boolean;
}

/**
 * Renders the error partial shown when a dictionary lookup fails.
 *
 * `term` is user-controlled (a raw search query or entry id), so it is escaped.
 * Kept here beside the other `.v2-no-results` renderers so the router never
 * hand-builds this markup — an earlier inline copy in the router dropped the
 * escaping and reflected the query straight back into the response.
 */
export function renderDictErrorHtml(
  term: string,
  isIdSearch: boolean = false
): string {
  const action = isIdSearch ? "retrieving ID" : "searching for";
  return `<div class="v2-no-results"><p>An error occurred ${action} "${he.escape(
    term
  )}".</p></div>`;
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
            ? `<p class="v2-no-results-sub">Searched: ${he.escape(
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

  let jumpBarHtml = "";
  if (hitKeys.length > 1) {
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
          return `<a href="#${cardId}" class="v2-jump-pill" title="Jump to ${he.escape(
            shortName
          )} (${count} ${
            count === 1 ? "entry" : "entries"
          })"><span class="v2-jump-pill-name">${he.escape(
            dictAcronym
          )}</span><span class="v2-jump-pill-count">${count}</span></a>`;
        } else {
          return `<span class="v2-jump-pill v2-jump-pill-zero" title="No entries found in ${he.escape(
            shortName
          )}"><span class="v2-jump-pill-name">${he.escape(
            dictAcronym
          )}</span><span class="v2-jump-pill-count">0</span></span>`;
        }
      })
      .join("");

    jumpBarHtml = `
      <nav class="v2-results-nav" aria-label="Jump to dictionary">
        <div class="v2-results-pills">
          ${pillsHtml}
        </div>
        <div class="v2-results-total">
          ${totalCount} ${totalCount === 1 ? "result" : "results"}
        </div>
      </nav>
    `;
  }

  const cardsHtml = hitKeys
    .map((dictKey) => {
      const entries = results[dictKey];
      const shortName =
        DICT_NAMES[dictKey] ??
        LatinDict.BY_KEY.get(dictKey)?.displayName ??
        dictKey.toUpperCase();
      const dictAcronym =
        DICT_ACRONYMS[dictKey] ??
        DICT_ACRONYMS[dictKey.toLowerCase()] ??
        dictKey.toUpperCase();
      const info = findDictInfo(dictKey);
      const dictLang =
        info && info.languages.from !== "*"
          ? info.languages.from.toLowerCase()
          : "la";
      const totalEntries = entries.length;
      const cardId = `dict-${dictKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

      let quickJumpHtml = "";
      if (totalEntries > 1) {
        const jumpLinks = entries
          .map((entry, idx) => {
            const rawHeadword =
              entry.outline?.mainLabel?.trim() ||
              entry.outline?.mainKey?.trim() ||
              entry.outline?.mainSection?.text?.trim() ||
              `Entry ${idx + 1}`;
            const headword = rawHeadword.replace(/<[^>]+>/g, "").trim();
            const entryAnchor = entry.outline.mainSection.sectionId;
            return `<li><a href="#${entryAnchor}" class="v2-entry-nav-link"><span class="v2-entry-nav-word">${he.escape(
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
          renderEntryResult(entry, `${dictKey}-${idx}`, idx + 1, totalEntries, {
            dictKey,
            dictName: shortName,
            dictAcronym,
            dictLang,
            isEmbedded,
          })
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
          <header class="v2-dict-header v2-dict-header-slim">
            <div class="v2-dict-header-row">
              <details class="v2-dict-toggle" open>
                <summary class="v2-dict-summary">
                  <span class="v2-dict-toggle-icon" aria-hidden="true"></span>
                  <span class="v2-dict-acronym">${he.escape(dictAcronym)}</span>
                  <span class="v2-dict-name v2-dict-title">${he.escape(
                    shortName
                  )}</span>
                  <span class="v2-dict-count">(${totalEntries})</span>
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

  const tocHtml =
    !isEmbedded && results
      ? renderDictTocHtml({ results, hitKeys, maxLevel: 3 })
      : "";
  const hasToc = Boolean(tocHtml);

  return `
    <div class="v2-results-layout${hasToc ? " has-toc" : ""}">
      ${tocHtml}
      <div class="v2-results-main">
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
      ? `<style>:root { --v2-dict-scale: ${(dictScale / 100).toFixed(
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
    extraHeadHtml,
  });
}
