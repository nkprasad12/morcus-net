/**
 * Morcus Reader V2 - Domain Types and Citation Hierarchy Models
 *
 * Supports classical works of arbitrary depth (e.g. book.chapter.section,
 * poem.line, book.line, act.scene.line).
 */

/**
 * Citation ID tuple representing hierarchical address coordinates (e.g. ["1", "1", "2"]).
 */
export type CitationId = string[];

export interface ReaderSection {
  /** Hierarchical coordinate ID (e.g. ["1", "1", "1"]) */
  id: CitationId;
  /** Latin source text */
  latin: string;
  /** Optional synchronized English translation */
  english?: string;
  /** Optional critical or grammatical notes */
  notes?: string[];
}

export interface ReaderPage {
  /** Page-level hierarchical coordinate (e.g. ["1", "1"] for Book 1, Chapter 1) */
  id: CitationId;
  /** Human-readable page title (e.g. "Liber I, Caput I") */
  title: string;
  /** Ordered list of leaf sections on this page */
  sections: ReaderSection[];
}

export interface ReaderWork {
  /** Work identifier key (e.g. "dbg", "catullus", "aeneid", "amphitruo") */
  id: string;
  /** Canonical Latin title */
  title: string;
  /** English title translation */
  englishTitle?: string;
  /** Author name */
  author: string;
  /** Semantic names for each structural level (e.g. ["book", "chapter", "section"]) */
  textParts: string[];
  /** Depth at which text is paginated (e.g. 2 for chapter, 1 for poem) */
  paginationDepth: number;
  /** Critical edition attribution */
  editor?: string;
  /** Translation attribution */
  translator?: string;
  /** Canonical Text Services URN */
  ctsUrn?: string;
  /** License details */
  license?: string;
  /** Source repository URL */
  sourceRepo?: string;
  /** Ordered collection of readable pages */
  pages: ReaderPage[];
}

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
 * Generates a human-readable semantic label from a CitationId and textParts hierarchy.
 * E.g. (["1", "2"], ["book", "chapter", "section"]) -> "Book 1, Chapter 2"
 */
export function citationToSemanticLabel(
  id: CitationId,
  textParts: string[]
): string {
  return id
    .map((val, idx) => {
      const partName = textParts[idx] ?? `Level ${idx + 1}`;
      const capitalized = partName.charAt(0).toUpperCase() + partName.slice(1);
      return `${capitalized} ${val}`;
    })
    .join(", ");
}

/**
 * Derives the local/leaf identifier relative to the current page.
 * E.g., for section ["2", "1", "2"] on page ["2", "1"], returns "2".
 */
export function getSectionLocalId(
  secId: CitationId,
  pageId: CitationId
): string {
  const localTokens = secId.slice(pageId.length);
  return localTokens.length > 0
    ? localTokens.join(".")
    : secId[secId.length - 1] ?? "";
}

/**
 * Derives the redundant prefix that is already established by the page header.
 * E.g., for section ["2", "1", "2"] on page ["2", "1"], returns "2.1.".
 */
export function getSectionPrefix(
  secId: CitationId,
  pageId: CitationId
): string {
  const full = citationToString(secId);
  const local = getSectionLocalId(secId, pageId);
  return full.slice(0, full.length - local.length);
}

export interface JumpResolution {
  pageIndex: number;
  page: ReaderPage;
  targetSectionId?: string;
}

/**
 * Resolves a quick-jump string (either relative like "2" or full like "2.1.2")
 * against a given work and active page.
 */
export function resolveCitationJump(
  input: string,
  work: ReaderWork,
  currentPageIndex: number = 0
): JumpResolution | null {
  const raw = input.trim();
  if (!raw) return null;

  const currentPage = work.pages[currentPageIndex] ?? work.pages[0];
  const tokens = parseCitationString(raw);
  const k = work.paginationDepth;

  // 1. Check for single-token relative jump within the active page (e.g. typing "2" while on 1.1)
  if (tokens.length === 1 && currentPage) {
    const localTarget = tokens[0];
    const sectionMatch = currentPage.sections.find((s) => {
      const loc = getSectionLocalId(s.id, currentPage.id);
      return loc === localTarget;
    });
    if (sectionMatch) {
      return {
        pageIndex: currentPageIndex,
        page: currentPage,
        targetSectionId: citationToString(sectionMatch.id),
      };
    }
  }

  // 2. Exact match against page ID
  const pageIdx = work.pages.findIndex((p) => {
    const pageTokens = tokens.slice(0, k);
    return (
      pageTokens.length === p.id.length &&
      pageTokens.every((tok, idx) => p.id[idx] === tok)
    );
  });

  if (pageIdx !== -1) {
    const targetPage = work.pages[pageIdx];
    const targetSectionId =
      tokens.length > k ? citationToString(tokens) : undefined;
    return {
      pageIndex: pageIdx,
      page: targetPage,
      targetSectionId,
    };
  }

  // 3. Prefix match (e.g. entering "2" when work has 3 levels navigates to Book 2, Chapter 1)
  const prefixIdx = work.pages.findIndex((p) =>
    tokens.every((tok, idx) => p.id[idx] === tok)
  );
  if (prefixIdx !== -1) {
    return {
      pageIndex: prefixIdx,
      page: work.pages[prefixIdx],
    };
  }

  return null;
}
