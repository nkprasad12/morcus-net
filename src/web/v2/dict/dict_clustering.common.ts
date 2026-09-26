import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";
import { type DictLang } from "@/common/dictionaries/dictionaries";
import { Vowels } from "@/common/character_utils";
import { removeDiacritics } from "@/common/text_cleaning";
import type { CompletionItem } from "@/web/v2/dict/dict_completions.common";

export interface Candidate {
  dictKey: string;
  lang: DictLang;
  word: string;
}

const EXTRA_KEY_LOOKUP = new Map<string, string>([
  ["u", "v"],
  ["v", "u"],
  ["i", "j"],
  ["j", "i"],
]);

/**
 * Resolves a dictionary key to its LatinDictInfo, handling aliases and case-insensitivity.
 */
export function findDictInfo(key: string): LatinDictInfo | undefined {
  const direct = LatinDict.BY_KEY.get(key);
  if (direct) return direct;
  const lower = key.toLowerCase();
  return LatinDict.AVAILABLE.find(
    (d) =>
      d.key.toLowerCase() === lower ||
      d.displayName.toLowerCase() === lower ||
      (lower === "ls" && d.key === "L&S") ||
      (lower === "sh" && d.key === "S&H") ||
      (lower === "ra" && d.key === "R&A") ||
      (lower === "gaffiot" && d.key === "GAF") ||
      (lower === "georges" && d.key === "GRG") ||
      (lower === "pozo" && d.key === "EGL") ||
      (lower === "gesner" && d.key === "GES") ||
      (lower === "forcellini" && d.key === "FOR") ||
      (lower === "numeral" && d.key === "NUM")
  );
}

/**
 * Resolves the source language for a given dictionary key.
 * Defaults to "La" for universal ("*") or unrecognized dictionaries.
 */
export function getDictSourceLang(dictKey: string): DictLang {
  const info = findDictInfo(dictKey);
  if (!info || info.languages.from === "*") {
    return "La";
  }
  return info.languages.from;
}

/**
 * Expands query prefixes for orthographic equivalents (u/v, i/j in Latin; ß/ss in German).
 */
export function getExpandedPrefixes(prefix: string, lang: DictLang): string[] {
  if (lang === "La") {
    const maxDepth = Math.min(25, prefix.length);
    let prefixes: string[] = [""];
    for (let i = 0; i < maxDepth; i++) {
      const nextChar = prefix.charAt(i);
      const altChar = EXTRA_KEY_LOOKUP.get(nextChar);
      const nextChars =
        altChar === undefined ? [nextChar] : [nextChar, altChar];
      prefixes = prefixes.flatMap((p) => nextChars.map((n) => p + n));
    }
    if (prefix.length > maxDepth) {
      const remainder = prefix.slice(maxDepth);
      prefixes = prefixes.map((p) => p + remainder);
    }
    return prefixes;
  }
  if (lang === "De") {
    const s1 = prefix.replaceAll("ß", "ss");
    const s2 = prefix.replaceAll("ss", "ß");
    return Array.from(new Set([prefix, s1, s2]));
  }
  return [prefix];
}

/**
 * Deduplicates candidates, clusters vowel-length variants via Vowels.haveCompatibleLength,
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
    const cleanForm = removeDiacritics(c.word).toLowerCase();
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
          Vowels.haveCompatibleLength(member.word, option.word)
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
      const leader =
        fg.find(
          (m) =>
            m.dictKey === LatinDict.Gaffiot.key ||
            m.dictKey.toUpperCase() === "GAF" ||
            m.dictKey.toLowerCase() === "gaffiot"
        ) ?? fg[0];
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
  activeDictKeys: string[],
  query: string,
  limit: number = 25
): CompletionItem[] {
  const clean = query.trim();
  if (!clean) return [];

  const dictsToScan =
    activeDictKeys.length > 0 ? activeDictKeys : Object.keys(dictChunks);

  const candidates: Candidate[] = [];

  for (const dictKey of dictsToScan) {
    const words = dictChunks[dictKey];
    if (!words || words.length === 0) continue;

    const lang = getDictSourceLang(dictKey);
    const prefixes = getExpandedPrefixes(clean.toLowerCase(), lang);

    for (const word of words) {
      const cleanWord = removeDiacritics(word).toLowerCase();
      if (prefixes.some((p) => cleanWord.startsWith(p))) {
        candidates.push({ dictKey, lang, word });
      }
    }
  }

  return clusterAndDeduplicate(candidates, limit);
}
