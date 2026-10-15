import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  type DictLang,
  type CompletionsFusedRequest,
  type CompletionsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { removeDiacritics } from "@/common/text_cleaning";
import { hasGreek } from "@/web/v2/dict/search/dict_greek.common";
import {
  cleanCompletionQuery,
  type CompletionItem,
  type DictChunksResponse,
} from "@/web/v2/dict/search/dict_completions.common";
import {
  Candidate,
  clusterAndDeduplicate,
  getDictSourceLang,
  getExpandedPrefixes,
} from "@/web/v2/dict/dict_clustering.common";
import { findDictInfo } from "@/web/v2/dict/settings/dict_selection.common";

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
}

/**
 * Returns a dictionary-keyed map of string arrays for a prefix chunk across all
 * dictionaries.
 */
export async function getV2DictChunks(
  provider: CompletionsProvider,
  options: V2DictChunksOptions
): Promise<DictChunksResponse> {
  const { rawPrefix } = options;

  if (!rawPrefix || hasGreek(rawPrefix)) {
    return {};
  }

  const { query, isSuffix } = cleanCompletionQuery(rawPrefix);
  if (!query || isSuffix) {
    return {};
  }

  const prefix = removeDiacritics(query).toLowerCase();
  const dictKeys = LatinDict.AVAILABLE.map((d) => d.key);

  // Partition active dictionaries by source language
  const partitions = new Map<DictLang, string[]>();
  for (const dictKey of dictKeys) {
    const lang = getDictSourceLang(findDictInfo(dictKey)?.key ?? dictKey);
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
        if (!words || words.length === 0) continue;
        let set = dictWordsMap.get(dictKey);
        if (!set) {
          set = new Set<string>();
          dictWordsMap.set(dictKey, set);
        }
        for (const word of words) {
          if (word) set.add(word);
        }
      }
    }

    const result: DictChunksResponse = {};
    for (const [dictKey, wordSet] of dictWordsMap.entries()) {
      const decorated = Array.from(wordSet, (word) => ({
        word,
        clean: removeDiacritics(word).toLowerCase(),
      }));
      decorated.sort((a, b) => {
        const comp = a.clean < b.clean ? -1 : a.clean > b.clean ? 1 : 0;
        return comp !== 0 ? comp : a.word.localeCompare(b.word);
      });
      result[dictKey] = decorated.map((d) => d.word);
    }

    return result;
  } catch (err) {
    console.error("Error in getV2DictChunks:", err);
    return {};
  }
}

/**
 * Server completion engine for V2 dictionary suffix autocomplete (`-arum`, `-ibus`).
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
  if (!query || !isSuffix) {
    return [];
  }

  const dictKeys =
    activeDictKeys.length > 0
      ? activeDictKeys
      : LatinDict.AVAILABLE.map((d) => d.key);

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
