import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";
import {
  type DictLang,
  type CompletionsFusedRequest,
  type CompletionsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { Vowels } from "@/common/character_utils";
import { removeDiacritics } from "@/common/text_cleaning";
import { hasGreek } from "@/web/v2/dict/dict_greek.common";
import {
  cleanCompletionQuery,
  type CompletionItem,
} from "@/web/v2/dict/dict_completions.common";

export { cleanCompletionQuery, type CompletionItem };

export interface CompletionsProvider {
  getCompletions(
    request: CompletionsFusedRequest
  ): Promise<CompletionsFusedResponse>;
}

export interface V2CompletionsOptions {
  rawQuery: string;
  activeDictKeys: string[];
  limit?: number;
}

interface Candidate {
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
 * selects Gaffiot as canonical macron leader for Latin, and sorts results.
 */
export function clusterAndDeduplicate(
  candidates: Candidate[],
  limit: number = 25
): CompletionItem[] {
  // Group by source language and diacritic-stripped clean form
  const groupsByLang = new Map<DictLang, Map<string, Candidate[]>>();
  for (const c of candidates) {
    if (!c.word) continue;
    let langMap = groupsByLang.get(c.lang);
    if (!langMap) {
      langMap = new Map<string, Candidate[]>();
      groupsByLang.set(c.lang, langMap);
    }
    const cleanForm = removeDiacritics(c.word).toLowerCase();
    let list = langMap.get(cleanForm);
    if (!list) {
      list = [];
      langMap.set(cleanForm, list);
    }
    list.push(c);
  }

  const results: CompletionItem[] = [];

  // In each (lang, cleanForm) group, cluster compatible vowel lengths
  for (const [lang, formMap] of groupsByLang.entries()) {
    for (const [_, options] of formMap.entries()) {
      const formGroups: Candidate[][] = [];
      for (const option of options) {
        let foundGroup = false;
        for (const group of formGroups) {
          const compatible = group.every((member) =>
            Vowels.haveCompatibleLength(member.word, option.word)
          );
          if (compatible) {
            group.push(option);
            foundGroup = true;
            break;
          }
        }
        if (!foundGroup) {
          formGroups.push([option]);
        }
      }

      // Canonical leader selection: prefer Gaffiot for Latin macrons
      for (const group of formGroups) {
        const leader =
          group.find(
            (m) =>
              m.dictKey === LatinDict.Gaffiot.key ||
              m.dictKey.toUpperCase() === "GAF" ||
              m.dictKey.toLowerCase() === "gaffiot"
          ) ?? group[0];
        results.push({ lang, word: leader.word });
      }
    }
  }

  // Sort alphabetically by diacritic-stripped lower-case, then raw word
  results.sort((a, b) => {
    const comp = removeDiacritics(a.word)
      .toLowerCase()
      .localeCompare(removeDiacritics(b.word).toLowerCase());
    return comp !== 0 ? comp : a.word.localeCompare(b.word);
  });

  return results.slice(0, limit);
}

/**
 * Server completion engine for V2 dictionary autocomplete.
 */
export async function getV2Completions(
  provider: CompletionsProvider,
  options: V2CompletionsOptions
): Promise<CompletionItem[]> {
  const { rawQuery, activeDictKeys, limit = 25 } = options;

  // Short-circuit Greek queries or empty input immediately
  if (!rawQuery || hasGreek(rawQuery)) {
    return [];
  }

  const { query, isSuffix } = cleanCompletionQuery(rawQuery);
  if (!query) {
    return [];
  }

  const dictKeys =
    activeDictKeys.length > 0
      ? activeDictKeys
      : LatinDict.AVAILABLE.map((d) => d.key);

  // Suffix searches: query active dictionaries directly without prefix expansion
  if (isSuffix) {
    try {
      const res = await provider.getCompletions({
        query,
        dicts: dictKeys,
      });
      const candidates: Candidate[] = [];
      for (const [dictKey, words] of Object.entries(res)) {
        const dictInfo = findDictInfo(dictKey);
        const lang: DictLang =
          dictInfo?.languages.from === "*"
            ? "La"
            : dictInfo?.languages.from ?? "La";
        for (const word of words || []) {
          candidates.push({ dictKey, lang, word });
        }
      }
      return clusterAndDeduplicate(candidates, limit);
    } catch (err) {
      console.error("Error in suffix completions:", err);
      return [];
    }
  }

  // Prefix searches: partition active dictionaries by source language
  const partitions = new Map<DictLang, string[]>();
  for (const dictKey of dictKeys) {
    const dictInfo = findDictInfo(dictKey);
    const lang: DictLang =
      dictInfo?.languages.from === "*"
        ? "La"
        : dictInfo?.languages.from ?? "La";
    let group = partitions.get(lang);
    if (!group) {
      group = [];
      partitions.set(lang, group);
    }
    group.push(dictKey);
  }

  const tasks: Promise<{
    lang: DictLang;
    res: CompletionsFusedResponse;
  }>[] = [];

  for (const [lang, groupDicts] of partitions.entries()) {
    const prefixes = getExpandedPrefixes(query, lang);
    for (const p of prefixes) {
      tasks.push(
        provider
          .getCompletions({ query: p, dicts: groupDicts })
          .then((res) => ({ lang, res }))
          .catch((err) => {
            console.error(`Error in completions for prefix "${p}":`, err);
            return { lang, res: {} };
          })
      );
    }
  }

  try {
    const resolved = await Promise.all(tasks);
    const candidates: Candidate[] = [];
    for (const { lang: partitionLang, res } of resolved) {
      for (const [dictKey, words] of Object.entries(res)) {
        const dictInfo = findDictInfo(dictKey);
        const lang: DictLang =
          dictInfo?.languages.from === "*"
            ? "La"
            : dictInfo?.languages.from ?? partitionLang;
        for (const word of words || []) {
          candidates.push({ dictKey, lang, word });
        }
      }
    }
    return clusterAndDeduplicate(candidates, limit);
  } catch (err) {
    console.error("Error in prefix completions:", err);
    return [];
  }
}
