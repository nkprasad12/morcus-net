import { type DictLang } from "@/common/dictionaries/dictionaries";
import { haveCompatibleVowelLength } from "@/common/character_utils";
import { removeDiacritics } from "@/common/text_cleaning";
import type { CompletionItem } from "@/web/ui/dict/search/dict_completions.common";
import { DICT_SOURCE_LANG } from "@/web/ui/dict/settings/dict_bitmask.common";

export interface Candidate {
  dictKey: string;
  lang: DictLang;
  word: string;
  clean?: string;
}

/**
 * Resolves the source language for a canonical dictionary key.
 * Defaults to "La" for universal ("*") or unrecognized dictionaries.
 */
export function getDictSourceLang(dictKey: string): DictLang {
  const from = DICT_SOURCE_LANG[dictKey];
  return !from || from === "*" ? "La" : from;
}

/**
 * Folds orthographic equivalents into canonical forms for prefix matching
 * (v -> u, j -> i in Latin; ß -> ss in German).
 */
export function foldOrthography(clean: string, lang: DictLang): string {
  return lang === "La"
    ? clean.replaceAll("v", "u").replaceAll("j", "i")
    : lang === "De"
    ? clean.replaceAll("ß", "ss")
    : clean;
}

/**
 * Deduplicates candidates, clusters vowel-length variants via haveCompatibleVowelLength,
 * selects Gaffiot as canonical macron leader for Latin, sorts results, and exits early
 * once the limit of clusters is reached.
 */
export function clusterAndDeduplicate(
  candidates: Candidate[],
  limit: number = 25
): CompletionItem[] {
  if (candidates.length === 0 || limit <= 0) {
    return [];
  }

  // Group candidates by lang and normalized base word (lowercase without diacritics)
  const groups = new Map<
    string,
    { lang: DictLang; cleanForm: string; options: Candidate[] }
  >();

  for (const c of candidates) {
    if (!c.word) continue;
    const cleanForm = c.clean ?? removeDiacritics(c.word).toLowerCase();
    const groupKey = `${c.lang}:${cleanForm}`;
    let entry = groups.get(groupKey);
    if (!entry) {
      entry = { lang: c.lang, cleanForm, options: [] };
      groups.set(groupKey, entry);
    }
    entry.options.push(c);
  }

  // Sort groups alphabetically by cleanForm to enable sound early-exit
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const cmp = a.cleanForm.localeCompare(b.cleanForm);
    return cmp !== 0 ? cmp : a.lang.localeCompare(b.lang);
  });

  const results: CompletionItem[] = [];

  for (const group of sortedGroups) {
    // In each (lang, cleanForm) group, cluster compatible vowel lengths
    const formGroups: Candidate[][] = [];
    for (const option of group.options) {
      let foundGroup = false;
      for (const fg of formGroups) {
        const compatible = fg.every((member) =>
          haveCompatibleVowelLength(member.word, option.word)
        );
        if (compatible) {
          fg.push(option);
          foundGroup = true;
          break;
        }
      }
      if (!foundGroup) {
        formGroups.push([option]);
      }
    }

    // Canonical leader selection: prefer Gaffiot for Latin macrons
    for (const fg of formGroups) {
      const leader = fg.find((m) => m.dictKey === "GAF") ?? fg[0];
      results.push({ lang: group.lang, word: leader.word });
    }

    // Early exit once the requested limit is reached
    if (results.length >= limit) {
      break;
    }
  }

  // Tie-breaker sort by clean lower-case, then raw word
  results.sort((a, b) => {
    const comp = removeDiacritics(a.word)
      .toLowerCase()
      .localeCompare(removeDiacritics(b.word).toLowerCase());
    return comp !== 0 ? comp : a.word.localeCompare(b.word);
  });

  return results.slice(0, limit);
}

/**
 * Filters words from dictionary chunks matching the given query (expanding orthographic
 * equivalents), and clusters the matching candidates with early exit.
 */
export function filterAndClusterDictionaryChunks(
  dictChunks: Record<string, string[]>,
  activeDictKeys: readonly string[],
  query: string,
  limit: number = 25
): CompletionItem[] {
  const folded = removeDiacritics(query.trim()).toLowerCase();
  if (!folded) return [];

  const dictsToScan =
    activeDictKeys.length > 0 ? activeDictKeys : Object.keys(dictChunks);

  const candidates: Candidate[] = [];

  for (const dictKey of dictsToScan) {
    const words = dictChunks[dictKey];
    if (!words || words.length === 0) continue;

    const lang = getDictSourceLang(dictKey);
    const foldedQuery = foldOrthography(folded, lang);

    for (const word of words) {
      const clean = removeDiacritics(word).toLowerCase();
      if (foldOrthography(clean, lang).startsWith(foldedQuery)) {
        candidates.push({ dictKey, lang, word, clean });
      }
    }
  }

  return clusterAndDeduplicate(candidates, limit);
}
