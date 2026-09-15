/**
 * UI V2 Dictionary Table of Contents (TOC) SSR Generator
 *
 * Extracts hierarchical sense outlines across matched lexica, enforces gating
 * thresholds, caps depth (Levels 1–3), and generates semantic, No-JS accessible HTML.
 */

import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { EntryOutline } from "@/common/dictionaries/dict_result";
import {
  DICT_ACRONYMS,
  dictCardId,
  resolveDictAcronym,
  resolveDictDisplayName,
  resolveDictLang,
} from "@/web/v2/dict/dict_attribution.server";
import * as he from "he";

export { DICT_ACRONYMS };

export const TOC_MIN_TOTAL_SENSES = 4;
export const TOC_MIN_SINGLE_ENTRY_SENSES = 3;
export const TOC_MIN_MULTI_ENTRIES = 2;

export interface SenseCounts {
  totalSenses: number;
  maxSingleEntrySenses: number;
  totalEntries: number;
}

export interface DictTocOptions {
  /** Map of dictionary key to entry results */
  results: DictsFusedResponse;
  /** Filtered or ordered dictionary keys that produced results */
  hitKeys?: string[];
  /** Maximum sense depth to display (defaults to 3) */
  maxLevel?: number;
}

/** Sense item in the TOC hierarchy */
export interface TocSenseItem {
  sectionId: string;
  level: number;
  indentLevel: number;
  ordinal: string;
  text: string;
}

/** Entry node containing senses or lone entry anchor */
export interface TocEntryNode {
  headword: string;
  entryAnchorId: string;
  dictAcronym: string;
  dictLang: string;
  showHeader: boolean;
  isLoneEntry: boolean;
  senses: TocSenseItem[];
}

/** Lexicon group containing entries */
export interface TocGroupNode {
  dictKey: string;
  dictName: string;
  dictAcronym: string;
  cardId: string;
  entries: TocEntryNode[];
}

/** Quick-jump chip for multi-entry / cross-lexicon summary bar */
export interface TocChipItem {
  headword: string;
  anchor: string;
  title: string;
}

/** Group of chips belonging to a dictionary */
export interface TocChipGroup {
  dictKey: string;
  dictAcronym: string;
  dictLang: string;
  chips: TocChipItem[];
}

/** Complete normalized hierarchical TOC model */
export interface DictTocTree {
  totalEntries: number;
  totalSenses: number;
  teaserCount: string;
  chipGroups: TocChipGroup[];
  groups: TocGroupNode[];
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
 * Resolves active dictionary keys containing at least 1 entry.
 */
export function resolveHitKeys(
  results: DictsFusedResponse,
  hitKeys?: string[]
): string[] {
  return (
    hitKeys ??
    Object.keys(results).filter((k) => results[k] && results[k].length > 0)
  );
}

/**
 * Counts total outline senses, maximum sense count in a single entry,
 * and total entries across hit keys.
 */
export function countTotalSenses(
  results: DictsFusedResponse,
  hitKeys?: string[]
): SenseCounts {
  const keys = resolveHitKeys(results, hitKeys);

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
 * Evaluates whether entry and sense counts satisfy TOC visibility gating thresholds.
 */
export function meetsTocThreshold(counts: SenseCounts): boolean {
  return (
    counts.totalSenses >= TOC_MIN_TOTAL_SENSES ||
    counts.maxSingleEntrySenses >= TOC_MIN_SINGLE_ENTRY_SENSES ||
    counts.totalEntries >= TOC_MIN_MULTI_ENTRIES
  );
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
  return meetsTocThreshold(countTotalSenses(results, hitKeys));
}

/**
 * Extracts and sanitizes the entry headword, stripping embedded XML/HTML tags.
 */
export function extractHeadword(
  entry: { outline?: Partial<EntryOutline> },
  idx: number
): string {
  const raw =
    entry.outline?.mainLabel?.trim() ||
    entry.outline?.mainKey?.trim() ||
    entry.outline?.mainSection?.text?.trim() ||
    `Entry ${idx + 1}`;
  return raw.replace(/<[^>]+>/g, "").trim();
}

/**
 * Formats the TOC teaser count badge (e.g. "(2 entries · 4 senses)").
 */
export function formatTeaserCount(
  totalEntries: number,
  totalSenses: number
): string {
  if (totalEntries > 1 && totalSenses > 0) {
    return `(${totalEntries} entries · ${totalSenses} ${
      totalSenses === 1 ? "sense" : "senses"
    })`;
  }
  if (totalEntries > 1) {
    return `(${totalEntries} entries)`;
  }
  return `(${totalSenses} ${totalSenses === 1 ? "sense" : "senses"})`;
}

/**
 * Constructs the pure view-model tree representing dictionary TOC hierarchy.
 * Returns null if gating thresholds are not met.
 */
export function buildTocTree(options: DictTocOptions): DictTocTree | null {
  const { results } = options;
  const hitKeys = resolveHitKeys(results, options.hitKeys);
  const counts = countTotalSenses(results, hitKeys);

  if (!meetsTocThreshold(counts)) {
    return null;
  }

  const { totalEntries, totalSenses } = counts;
  const maxLevel = options.maxLevel ?? 3;

  const groups: TocGroupNode[] = [];
  for (const dictKey of hitKeys) {
    const entries = results[dictKey] || [];
    if (entries.length === 0) continue;

    const dictAcronym = resolveDictAcronym(dictKey);
    const dictName = resolveDictDisplayName(dictKey);
    const dictLang = resolveDictLang(dictKey);
    const cardId = dictCardId(dictKey);

    const entryNodes: TocEntryNode[] = entries.map((entry, idx) => {
      const entryAnchorId = entry.outline?.mainSection?.sectionId ?? "";
      const headword = extractHeadword(entry, idx);
      const allSenses = entry.outline?.senses || [];
      const visibleSenses = allSenses.filter((s) => s.level <= maxLevel);

      const senses: TocSenseItem[] = visibleSenses.map((sense) => ({
        sectionId: sense.sectionId,
        level: sense.level,
        indentLevel: Math.max(0, sense.level - 1),
        ordinal: sense.ordinal || "",
        text: truncateSenseText(sense.text),
      }));

      const isLoneEntry =
        visibleSenses.length === 0 &&
        entries.length === 1 &&
        Boolean(entryAnchorId);
      const showHeader = entries.length > 1 || totalEntries > 1;

      return {
        headword,
        entryAnchorId,
        dictAcronym,
        dictLang,
        showHeader,
        isLoneEntry,
        senses,
      };
    });

    groups.push({
      dictKey,
      dictName,
      dictAcronym,
      cardId,
      entries: entryNodes,
    });
  }

  const chipGroups: TocChipGroup[] = [];
  if (totalEntries > 1) {
    for (const dictKey of hitKeys) {
      const entries = results[dictKey] || [];
      if (entries.length === 0) continue;

      const dictAcronym = resolveDictAcronym(dictKey);
      const dictLang = resolveDictLang(dictKey);
      const chips: TocChipItem[] = entries.map((entry, idx) => {
        const entryAnchorId = entry.outline?.mainSection?.sectionId ?? "";
        const headword = extractHeadword(entry, idx);
        const anchor = entryAnchorId
          ? `#${entryAnchorId}`
          : `#${dictCardId(dictKey)}`;
        return {
          headword,
          anchor,
          title: `Jump to ${headword} (${dictAcronym})`,
        };
      });

      chipGroups.push({
        dictKey,
        dictAcronym,
        dictLang,
        chips,
      });
    }
  }

  const teaserCount = formatTeaserCount(totalEntries, totalSenses);

  return {
    totalEntries,
    totalSenses,
    teaserCount,
    chipGroups,
    groups,
  };
}

/**
 * Renders the multi-lexicon quick-jump chip bar.
 */
export function renderTocEntriesSummaryHtml(
  chipGroups: TocChipGroup[]
): string {
  if (chipGroups.length === 0) return "";

  const groupItems = chipGroups.map((group) => {
    const chipsHtml = group.chips
      .map(
        (chip) =>
          `<li class="v2-toc-entry-chip-item"><a href="${he.escape(
            chip.anchor
          )}" class="v2-toc-entry-chip" title="${he.escape(
            chip.title
          )}"><span class="v2-toc-chip-text">${he.escape(
            chip.headword
          )}</span></a></li>`
      )
      .join("\n");

    return `
      <div class="v2-toc-entries-group">
        <span class="v2-toc-badge v2-toc-badge-${group.dictLang}">${he.escape(
      group.dictAcronym
    )}</span>
        <ul class="v2-toc-entries-sublist">
          ${chipsHtml}
        </ul>
      </div>
    `;
  });

  const dividerHtml = `<span class="v2-toc-entries-divider" aria-hidden="true">|</span>`;

  return `
    <div class="v2-toc-section v2-toc-entries-summary">
      <div class="v2-toc-entries-groups">
        ${groupItems.join(`\n${dividerHtml}\n`)}
      </div>
    </div>
  `;
}

/**
 * Renders the sense list (<ul class="v2-toc-list">) for a single entry.
 */
export function renderTocSensesHtml(entry: TocEntryNode): string {
  if (entry.senses.length > 0) {
    const itemsHtml = entry.senses
      .map((sense) => {
        const indentStyle =
          sense.indentLevel > 0
            ? ` style="margin-left: ${sense.indentLevel * 0.75}rem;"`
            : "";
        const ordinalHtml = sense.ordinal
          ? `<strong class="v2-toc-ordinal">${he.escape(
              sense.ordinal
            )}</strong> `
          : "";
        const textHtml = he.escape(sense.text);

        return `<li class="v2-toc-item v2-toc-level-${
          sense.level
        }"${indentStyle}><a href="#${he.escape(
          sense.sectionId
        )}" class="v2-toc-link">${ordinalHtml}<span class="v2-toc-text">${textHtml}</span></a></li>`;
      })
      .join("\n");

    return `
      <ul class="v2-toc-list">
        ${itemsHtml}
      </ul>
    `;
  }

  if (entry.isLoneEntry && entry.entryAnchorId) {
    return `
      <ul class="v2-toc-list">
        <li class="v2-toc-item v2-toc-level-1">
          <a href="#${he.escape(
            entry.entryAnchorId
          )}" class="v2-toc-link"><span class="v2-toc-text">${he.escape(
      entry.headword
    )}</span></a>
        </li>
      </ul>
    `;
  }

  return "";
}

/**
 * Renders a single entry in the outline, with an entry header/badge if showHeader is true.
 */
export function renderTocEntryHtml(entry: TocEntryNode): string {
  const sensesHtml = renderTocSensesHtml(entry);
  if (!entry.showHeader) {
    return sensesHtml;
  }

  return `
    <div class="v2-toc-entry">
      <div class="v2-toc-entry-header">
        <a href="#${he.escape(
          entry.entryAnchorId
        )}" class="v2-toc-link v2-toc-entry-link">
          <span class="v2-toc-badge v2-toc-badge-${entry.dictLang}">${he.escape(
    entry.dictAcronym
  )}</span>
          <span class="v2-toc-entry-word">${he.escape(entry.headword)}</span>
        </a>
      </div>
      ${sensesHtml}
    </div>
  `;
}

/**
 * Renders a single lexicon outline group.
 */
export function renderTocGroupHtml(group: TocGroupNode): string {
  const entriesHtml = group.entries.map(renderTocEntryHtml).join("\n");
  return `
    <div class="v2-toc-group">
      <div class="v2-toc-dict-header">
        <a href="#${group.cardId}" class="v2-toc-dict-link">
          <span class="v2-toc-dict-name">${he.escape(group.dictName)}</span>
        </a>
      </div>
      ${entriesHtml}
    </div>
  `;
}

/**
 * Renders the hierarchical outline section containing all dictionary groups and senses.
 */
export function renderTocSenseListHtml(tree: DictTocTree): string {
  if (tree.groups.length === 0) return "";
  const groupsHtml = tree.groups.map(renderTocGroupHtml).join("\n");
  if (!groupsHtml.trim()) return "";

  return `
    <div class="v2-toc-section v2-toc-outline">
      ${groupsHtml}
    </div>
  `;
}

/**
 * Renders the semantic HTML Table of Contents for UI V2 dictionary results.
 * Accepts either a pre-built DictTocTree or raw DictTocOptions.
 * Returns an empty string if gating conditions are not met.
 */
export function renderDictTocHtml(input: DictTocOptions | DictTocTree): string {
  const tree = "groups" in input ? input : buildTocTree(input);
  if (!tree) {
    return "";
  }

  const entriesSummaryHtml = renderTocEntriesSummaryHtml(tree.chipGroups);
  const outlineSectionHtml = renderTocSenseListHtml(tree);

  return `
    <morcus-dict-toc class="v2-drawer v2-drawer-toc">
      <details class="v2-toc-details" open>
        <summary class="v2-drawer-bar v2-toc-bar" role="button" aria-label="Table of Contents">
          <div class="v2-drawer-handle" aria-hidden="true"></div>
          <div class="v2-drawer-teaser">
            <span class="v2-drawer-label v2-toc-teaser-label">Contents <span class="v2-toc-count">${tree.teaserCount}</span></span>
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
