/**
 * Morcus Reader V2 - Citation Hierarchy Types & Helpers
 *
 * Supports classical works of arbitrary depth (e.g. book.chapter.section,
 * poem.line, book.line, act.scene.line).
 */

import { formatSectionLabel } from "@/common/library/section_labels";

/**
 * Citation ID tuple representing hierarchical address coordinates (e.g. ["1", "1", "2"]).
 */
export type CitationId = string[];

/**
 * Converts a CitationId tuple to canonical dot notation (e.g. ["1", "2", "3"] -> "1.2.3").
 */
export function citationToString(id: CitationId): string {
  return id.join(".");
}

/**
 * Parses a dot-separated citation string into a CitationId tuple (e.g. "1.2.3" -> ["1", "2", "3"]).
 */
export function parseCitationString(str: string): CitationId {
  return str
    .trim()
    .split(".")
    .filter((tok) => tok.length > 0);
}

/**
 * Whether `id` names an editor's front matter that was once cited and paged
 * on its own (Cicero's `sigla.1`, De Fato's `arg.1`) and is now uncitable
 * text at the top of the work's first page (`normalizeCiceroChapterMilestones`).
 */
export function isRetiredFrontMatterId(id: string): boolean {
  return /^(?:sigla|arg)(?:\.|$)/i.test(id.trim());
}

/**
 * Computes a boundary-aware differential citation label between the current page
 * and a target page. Returns only the structural tier that changes relative to the current page.
 * E.g.:
 * - (["1", "2"], ["1", "3"], ["book", "chapter"]) -> "Chapter 3"
 * - (["1", "29"], ["2", "1"], ["book", "chapter"]) -> "Book 2"
 * - (["14", "1", "14"], ["14", "2", "1"], ["book", "topic", "chapter"]) -> "Topic 2"
 */
export function getDifferentialCitationLabel(
  currPageId: CitationId | string,
  targetPageId: CitationId | string,
  textParts: string[]
): string {
  const currArr = Array.isArray(currPageId)
    ? currPageId
    : parseCitationString(currPageId);
  const targetArr = Array.isArray(targetPageId)
    ? targetPageId
    : parseCitationString(targetPageId);

  let diffIdx = 0;
  while (
    diffIdx < currArr.length &&
    diffIdx < targetArr.length &&
    currArr[diffIdx] === targetArr[diffIdx]
  ) {
    diffIdx++;
  }
  if (diffIdx >= targetArr.length) {
    diffIdx = targetArr.length - 1;
  }
  const partName = textParts[diffIdx] ?? `Section`;
  const value = targetArr[diffIdx] ?? "";
  return formatSectionLabel(partName, value, targetArr[diffIdx - 1]);
}
