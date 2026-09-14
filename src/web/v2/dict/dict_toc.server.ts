/**
 * UI V2 Dictionary Table of Contents (TOC) SSR Generator
 *
 * Extracts hierarchical sense outlines across matched lexica, enforces gating
 * thresholds, caps depth (Levels 1–3), and generates semantic, No-JS accessible HTML.
 */

import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import {
  DICT_NAMES,
  DICT_ACRONYMS,
} from "@/web/v2/dict/dict_attribution.server";
import { findDictInfo } from "@/web/v2/dict/dict_clustering.common";
import * as he from "he";

export { DICT_ACRONYMS };

export interface DictTocOptions {
  /** Map of dictionary key to entry results */
  results: DictsFusedResponse;
  /** Filtered or ordered dictionary keys that produced results */
  hitKeys?: string[];
  /** Maximum sense depth to display (defaults to 3) */
  maxLevel?: number;
}

/**
 * Truncates long sense descriptions cleanly at a word boundary with an ellipsis.
 */
export function truncateSenseText(
  text: string,
  maxLength: number = 75
): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.6) {
    return cut.slice(0, lastSpace) + "…";
  }
  return cut + "…";
}

/**
 * Counts total outline senses, maximum sense count in a single entry,
 * and total entries across hit keys.
 */
export function countTotalSenses(
  results: DictsFusedResponse,
  hitKeys?: string[]
): { totalSenses: number; maxSingleEntrySenses: number; totalEntries: number } {
  const keys =
    hitKeys ??
    Object.keys(results).filter((k) => results[k] && results[k].length > 0);

  let totalSenses = 0;
  let maxSingleEntrySenses = 0;
  let totalEntries = 0;

  for (const key of keys) {
    const entries = results[key] || [];
    totalEntries += entries.length;
    for (const entry of entries) {
      const senses = entry.outline?.senses || [];
      totalSenses += senses.length;
      if (senses.length > maxSingleEntrySenses) {
        maxSingleEntrySenses = senses.length;
      }
    }
  }

  return { totalSenses, maxSingleEntrySenses, totalEntries };
}

/**
 * Returns true if the search results meet the gating threshold for displaying a TOC:
 * - At least 4 senses across all matched entries, OR
 * - At least 3 senses in any single entry, OR
 * - More than 1 total entry across matched lexica (for multi-entry / cross-lexicon navigation).
 */
export function hasDictToc(
  results: DictsFusedResponse,
  hitKeys?: string[]
): boolean {
  const { totalSenses, maxSingleEntrySenses, totalEntries } = countTotalSenses(
    results,
    hitKeys
  );
  return totalSenses >= 4 || maxSingleEntrySenses >= 3 || totalEntries > 1;
}

/**
 * Renders the semantic HTML Table of Contents for UI V2 dictionary results.
 * Returns an empty string if gating conditions are not met.
 */
export function renderDictTocHtml(options: DictTocOptions): string {
  const { results } = options;
  const hitKeys =
    options.hitKeys ??
    Object.keys(results).filter((k) => results[k] && results[k].length > 0);

  const { totalSenses, maxSingleEntrySenses, totalEntries } = countTotalSenses(
    results,
    hitKeys
  );

  // Gating check
  if (totalSenses < 4 && maxSingleEntrySenses < 3 && totalEntries <= 1) {
    return "";
  }

  const maxLevel = options.maxLevel ?? 3;

  const groupsHtml = hitKeys
    .map((dictKey) => {
      const entries = results[dictKey] || [];
      if (entries.length === 0) return "";

      const info = findDictInfo(dictKey);
      const dictAcronym =
        info?.key ??
        DICT_ACRONYMS[dictKey] ??
        DICT_ACRONYMS[dictKey.toLowerCase()] ??
        dictKey.toUpperCase();

      const dictName =
        DICT_NAMES[dictKey] ??
        DICT_NAMES[dictKey.toLowerCase()] ??
        info?.displayName ??
        dictKey.toUpperCase();

      const cardId = `dict-${dictKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

      const entriesHtml = entries
        .map((entry, idx) => {
          const entryAnchorId = entry.outline?.mainSection?.sectionId ?? "";
          const headword =
            entry.outline?.mainLabel?.trim() ||
            entry.outline?.mainKey?.trim() ||
            entry.outline?.mainSection?.text?.trim() ||
            `Entry ${idx + 1}`;

          const allSenses = entry.outline?.senses || [];
          const visibleSenses = allSenses.filter((s) => s.level <= maxLevel);

          let sensesHtml = "";
          if (visibleSenses.length > 0) {
            const itemsHtml = visibleSenses
              .map((sense) => {
                const indentLevel = Math.max(0, sense.level - 1);
                const indentStyle =
                  indentLevel > 0
                    ? ` style="margin-left: ${indentLevel * 0.75}rem;"`
                    : "";

                const ordinalHtml = sense.ordinal
                  ? `<strong class="v2-toc-ordinal">${he.escape(
                      sense.ordinal
                    )}</strong> `
                  : "";

                const textHtml = he.escape(truncateSenseText(sense.text));

                return `<li class="v2-toc-item v2-toc-level-${
                  sense.level
                }"${indentStyle}><a href="#${he.escape(
                  sense.sectionId
                )}" class="v2-toc-link">${ordinalHtml}<span class="v2-toc-text">${textHtml}</span></a></li>`;
              })
              .join("\n");

            sensesHtml = `
              <ul class="v2-toc-list">
                ${itemsHtml}
              </ul>
            `;
          } else if (entries.length === 1 && entryAnchorId) {
            // Lone entry without outlined senses
            sensesHtml = `
              <ul class="v2-toc-list">
                <li class="v2-toc-item v2-toc-level-1">
                  <a href="#${he.escape(
                    entryAnchorId
                  )}" class="v2-toc-link"><span class="v2-toc-text">${he.escape(
              headword
            )}</span></a>
                </li>
              </ul>
            `;
          }

          if (entries.length > 1 || totalEntries > 1) {
            const info = findDictInfo(dictKey);
            const dictLang =
              info && info.languages.from !== "*"
                ? info.languages.from.toLowerCase()
                : "la";
            return `
              <div class="v2-toc-entry">
                <div class="v2-toc-entry-header">
                  <a href="#${he.escape(
                    entryAnchorId
                  )}" class="v2-toc-link v2-toc-entry-link">
                    <span class="v2-toc-badge v2-toc-badge-${dictLang}">${he.escape(
              dictAcronym
            )}</span>
                    <span class="v2-toc-entry-word">${he.escape(
                      headword
                    )}</span>
                  </a>
                </div>
                ${sensesHtml}
              </div>
            `;
          }

          return sensesHtml;
        })
        .join("\n");

      return `
        <div class="v2-toc-group">
          <div class="v2-toc-dict-header">
            <a href="#${cardId}" class="v2-toc-dict-link">
              <span class="v2-toc-dict-name">${he.escape(dictName)}</span>
            </a>
          </div>
          ${entriesHtml}
        </div>
      `;
    })
    .filter(Boolean)
    .join("\n");

  let entriesSummaryHtml = "";
  if (totalEntries > 1) {
    const groupItems = hitKeys
      .map((dictKey) => {
        const entries = results[dictKey] || [];
        if (entries.length === 0) return "";

        const info = findDictInfo(dictKey);
        const dictAcronym =
          info?.key ??
          DICT_ACRONYMS[dictKey] ??
          DICT_ACRONYMS[dictKey.toLowerCase()] ??
          dictKey.toUpperCase();
        const dictLang =
          info && info.languages.from !== "*"
            ? info.languages.from.toLowerCase()
            : "la";

        const chipsHtml = entries
          .map((entry, idx) => {
            const entryAnchorId = entry.outline?.mainSection?.sectionId ?? "";
            const rawHeadword =
              entry.outline?.mainLabel?.trim() ||
              entry.outline?.mainKey?.trim() ||
              entry.outline?.mainSection?.text?.trim() ||
              `Entry ${idx + 1}`;
            const headword = rawHeadword.replace(/<[^>]+>/g, "").trim();
            const anchor = entryAnchorId
              ? `#${entryAnchorId}`
              : `#dict-${dictKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

            return `<li class="v2-toc-entry-chip-item"><a href="${he.escape(
              anchor
            )}" class="v2-toc-entry-chip" title="Jump to ${he.escape(
              headword
            )} (${he.escape(
              dictAcronym
            )})"><span class="v2-toc-chip-text">${he.escape(
              headword
            )}</span></a></li>`;
          })
          .join("\n");

        return `
          <div class="v2-toc-entries-group">
            <span class="v2-toc-badge v2-toc-badge-${dictLang}">${he.escape(
          dictAcronym
        )}</span>
            <ul class="v2-toc-entries-sublist">
              ${chipsHtml}
            </ul>
          </div>
        `;
      })
      .filter(Boolean);

    const dividerHtml = `<span class="v2-toc-entries-divider" aria-hidden="true">|</span>`;

    entriesSummaryHtml = `
      <div class="v2-toc-section v2-toc-entries-summary">
        <div class="v2-toc-entries-groups">
          ${groupItems.join(`\n${dividerHtml}\n`)}
        </div>
      </div>
    `;
  }

  const outlineSectionHtml = groupsHtml.trim()
    ? `
      <div class="v2-toc-section v2-toc-outline">
        ${groupsHtml}
      </div>
    `
    : "";

  let teaserCount = "";
  if (totalEntries > 1 && totalSenses > 0) {
    teaserCount = `(${totalEntries} entries · ${totalSenses} ${
      totalSenses === 1 ? "sense" : "senses"
    })`;
  } else if (totalEntries > 1) {
    teaserCount = `(${totalEntries} entries)`;
  } else {
    teaserCount = `(${totalSenses} ${totalSenses === 1 ? "sense" : "senses"})`;
  }

  return `
    <morcus-dict-toc class="v2-drawer v2-drawer-toc">
      <details class="v2-toc-details" open>
        <summary class="v2-drawer-bar v2-toc-bar" role="button" aria-label="Table of Contents">
          <div class="v2-drawer-handle" aria-hidden="true"></div>
          <div class="v2-drawer-teaser">
            <span class="v2-drawer-label v2-toc-teaser-label">Contents <span class="v2-toc-count">${teaserCount}</span></span>
          </div>
        </summary>
        <div class="v2-toc-body">
          <nav class="v2-toc-nav" aria-label="Table of Contents Outline">
            ${entriesSummaryHtml}
            ${outlineSectionHtml}
          </nav>
        </div>
      </details>
    </morcus-dict-toc>
  `;
}
