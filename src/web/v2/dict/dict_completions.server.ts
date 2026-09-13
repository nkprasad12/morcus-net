import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  type DictLang,
  type CompletionsFusedRequest,
  type CompletionsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { removeDiacritics } from "@/common/text_cleaning";
import { hasGreek } from "@/web/v2/dict/dict_greek.common";
import {
  cleanCompletionQuery,
  type CompletionItem,
  type DictChunksResponse,
} from "@/web/v2/dict/dict_completions.common";
import {
  Candidate,
  clusterAndDeduplicate,
  findDictInfo,
  getDictSourceLang,
  getExpandedPrefixes,
} from "@/web/v2/dict/dict_clustering.common";

export {
  cleanCompletionQuery,
  type CompletionItem,
  type DictChunksResponse,
  Candidate,
  clusterAndDeduplicate,
  findDictInfo,
  getDictSourceLang,
  getExpandedPrefixes,
};

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

export interface V2DictChunksOptions {
  rawPrefix: string;
  activeDictKeys?: string[];
}

/**
 * Returns a dictionary-keyed map of string arrays for a 2-letter prefix chunk.
 */
export async function getV2DictChunks(
  provider: CompletionsProvider,
  options: V2DictChunksOptions
): Promise<DictChunksResponse> {
  const { rawPrefix, activeDictKeys } = options;

  if (!rawPrefix || hasGreek(rawPrefix)) {
    return {};
  }

  const { query, isSuffix } = cleanCompletionQuery(rawPrefix);
  if (!query || isSuffix) {
    return {};
  }

  const prefix = query.toLowerCase();
  const dictKeys =
    activeDictKeys && activeDictKeys.length > 0
      ? activeDictKeys
      : LatinDict.AVAILABLE.map((d) => d.key);

  // Partition active dictionaries by source language
  const partitions = new Map<DictLang, string[]>();
  for (const dictKey of dictKeys) {
    const lang = getDictSourceLang(dictKey);
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
    const prefixes = getExpandedPrefixes(prefix, lang);
    for (const p of prefixes) {
      tasks.push(
        provider
          .getCompletions({ query: p, dicts: groupDicts })
          .then((res) => ({ lang, res }))
          .catch((err) => {
            console.error(`Error in completions chunk for prefix "${p}":`, err);
            return { lang, res: {} };
          })
      );
    }
  }

  try {
    const resolved = await Promise.all(tasks);
    const dictWordsMap = new Map<string, Set<string>>();

    for (const { res } of resolved) {
      for (const [dictKey, words] of Object.entries(res)) {
        let set = dictWordsMap.get(dictKey);
        if (!set) {
          set = new Set<string>();
          dictWordsMap.set(dictKey, set);
        }
        for (const word of words || []) {
          if (word) set.add(word);
        }
      }
    }

    const result: DictChunksResponse = {};
    for (const [dictKey, wordSet] of dictWordsMap.entries()) {
      const sortedWords = Array.from(wordSet).sort((a, b) => {
        const comp = removeDiacritics(a)
          .toLowerCase()
          .localeCompare(removeDiacritics(b).toLowerCase());
        return comp !== 0 ? comp : a.localeCompare(b);
      });
      result[dictKey] = sortedWords;
    }

    return result;
  } catch (err) {
    console.error("Error in getV2DictChunks:", err);
    return {};
  }
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
