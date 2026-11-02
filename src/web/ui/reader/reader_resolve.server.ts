/**
 * Resolves a page id or a typed citation to a page of a work and, when it
 * names one, the section on that page. Kept free of the library database so
 * test doubles of `reader_loader.server.ts` can share it.
 */

import type {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/preprocess/preprocessed_types";
import { expandRomanLawCitationAliases } from "@/common/library/section_labels";
import { isRetiredFrontMatterId } from "@/web/ui/reader/reader_types.server";

/** The result of resolving a page id or citation in a work. */
export interface ResolvedPage {
  page: V2PreprocessedPage;
  index: number;
  pageIndex: number;
  matched: boolean;
  /**
   * The canonical id (as in `#sec-<id>`) of the section on `page` that the
   * citation names, when it names one rather than the page itself. An alias
   * citation (`1.1.1pr`, `30.79.1`, a bare lex) gives the id of the section
   * it stands for, not of its empty alias anchor.
   */
  sectionId?: string;
}

/** Leading label words a typed citation may start with (`Book 2`, `Lex 1.1.1pr`). */
const CITATION_LABEL_WORD =
  /^(book|liber|title|titulus|lex|paragraph|chapter|caput|section|elegy|poem|carmen)\s+/i;

/** Whether `id` can appear verbatim in an `id="sec-..."` attribute. */
function isPlainAnchorId(id: string): boolean {
  return /^[^\s"'<>&]+$/.test(id);
}

/**
 * The canonical id of the section that `id` names in a page's HTML, if any.
 * An alias anchor is an empty `<span id="sec-ALIAS">` in a section's gutter,
 * ahead of the gutter's link to the section itself (`work_preprocessor.ts`).
 */
function canonicalSectionIdIn(html: string, id: string): string | undefined {
  if (!isPlainAnchorId(id)) return undefined;
  const aliasSpan = `<span id="sec-${id}"></span>`;
  const aliasAt = html.indexOf(aliasSpan);
  if (aliasAt !== -1) {
    const link =
      /^(?:<span id="sec-[^"]*"><\/span>)*<a href="#sec-([^"]+)"/.exec(
        html.slice(aliasAt + aliasSpan.length)
      );
    if (link !== null) return link[1];
  }
  return html.includes(`id="sec-${id}"`) ? id : undefined;
}

/**
 * The canonical id of the section on `page` named by one of `needles` (in
 * order), or `undefined` if they name the page itself, a level above it,
 * retired front matter, or nothing on it.
 */
function findSectionOnPage(
  page: V2PreprocessedPage,
  needles: Iterable<string>
): string | undefined {
  const pageId = Array.isArray(page.id) ? page.id.join(".") : page.id;
  const candidates = Array.from(needles);
  if (
    candidates.some(
      (needle) =>
        needle === pageId ||
        pageId.startsWith(needle + ".") ||
        isRetiredFrontMatterId(needle)
    )
  ) {
    return undefined;
  }
  const html = page.singleHtml;
  for (const needle of candidates) {
    const found =
      canonicalSectionIdIn(html, needle) ??
      (needle.includes(".")
        ? undefined
        : canonicalSectionIdIn(html, `${pageId}.${needle}`));
    if (found !== undefined) return found;
  }
  return undefined;
}

export function resolvePageInWork(
  work: V2PreprocessedWork,
  pageIdOrCitation?: string | string[]
): ResolvedPage {
  if (!pageIdOrCitation || work.pages.length === 0) {
    return { page: work.pages[0], index: 0, pageIndex: 0, matched: true };
  }

  const rawNeedle = Array.isArray(pageIdOrCitation)
    ? pageIdOrCitation.join(".")
    : pageIdOrCitation.trim();

  if (!rawNeedle) {
    return { page: work.pages[0], index: 0, pageIndex: 0, matched: true };
  }

  const k =
    work.paginationDepth ||
    (work.textParts.length > 1 ? work.textParts.length - 1 : 1);

  // Strip optional leading label word (e.g. Zero-JS `?jump=Book+2` -> "2")
  const stripped = rawNeedle.replace(CITATION_LABEL_WORD, "").trim();
  // Roman-law citation aliases: compact `pr` (`1.1.1pr` <-> `1.1.1.pr`) and
  // Digest Books 30–32 title-`0` elision (`30.79.1` -> `30.0.79.1`, `30.1pr` -> `30.0.1.pr`).
  const candidateNeedles = new Set<string>(
    stripped && stripped !== rawNeedle ? [rawNeedle, stripped] : [rawNeedle]
  );
  if (work.citationStyle === "roman_law") {
    for (const base of Array.from(candidateNeedles)) {
      for (const alias of expandRomanLawCitationAliases(base, work.textParts)) {
        candidateNeedles.add(alias);
      }
    }
  }

  const found = (index: number): ResolvedPage => {
    const page = work.pages[index];
    return {
      page,
      index,
      pageIndex: index,
      matched: true,
      sectionId: findSectionOnPage(page, candidateNeedles),
    };
  };

  const tryResolve = (needle: string): ResolvedPage | null => {
    // 1. Exact string match against page.id (e.g. "1.1" === "1.1")
    const exactIdx = work.pages.findIndex((p) => {
      const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
      return pIdStr === needle;
    });
    if (exactIdx !== -1) {
      return found(exactIdx);
    }

    // 2. Prefix match if user typed a deeper citation (e.g. "1.2.3" -> page "1.2")
    const tokens = needle.split(".").filter((t) => t.length > 0);
    const pageTokens = tokens.slice(0, k);
    const pageTokenStr = pageTokens.join(".");

    const prefixIdx = work.pages.findIndex((p) => {
      const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
      return pIdStr === pageTokenStr;
    });
    if (prefixIdx !== -1) {
      return found(prefixIdx);
    }

    // 3. Segment-delimited prefix match (e.g. "2" -> "2.1" or "1.5.10" -> "1.5",
    //    never "1.55" -> "1.5")
    const startsWithIdx = work.pages.findIndex((p) => {
      const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
      return needle.startsWith(pIdStr + ".") || pIdStr.startsWith(needle + ".");
    });
    if (startsWithIdx !== -1) {
      return found(startsWithIdx);
    }

    return null;
  };

  for (const needle of candidateNeedles) {
    const resolved = tryResolve(needle);
    if (resolved) return resolved;
  }

  // 4. A section on some page. A work cited by line alone (`["line"]`) has a
  //    single page `1`, so `?jump=57` has to find the page holding `sec-57`.
  //    This reads page HTML, so it only runs once everything else has missed.
  for (const needle of candidateNeedles) {
    if (!isPlainAnchorId(needle)) continue;
    const anchor = `id="sec-${needle}"`;
    const sectionIdx = work.pages.findIndex((p) =>
      p.singleHtml.includes(anchor)
    );
    if (sectionIdx !== -1) {
      return found(sectionIdx);
    }
    if (!needle.includes(".")) {
      const compoundIdx = work.pages.findIndex((p) => {
        const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
        return p.singleHtml.includes(`id="sec-${pIdStr}.${needle}"`);
      });
      if (compoundIdx !== -1) {
        return found(compoundIdx);
      }
    }
  }

  // 5. Front matter that used to be a page of its own (`sigla`, `arg`, as in
  //    `/work/cicero/brutus/sigla` or `sigla.1`) now opens the first page.
  if (isRetiredFrontMatterId(rawNeedle)) {
    return { page: work.pages[0], index: 0, pageIndex: 0, matched: true };
  }

  return { page: work.pages[0], index: 0, pageIndex: 0, matched: false };
}
