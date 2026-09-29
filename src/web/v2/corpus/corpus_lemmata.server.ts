/**
 * Lemma shards for the autocomplete (DESIGN §4.4, §7.2).
 *
 * The corpus lemma list (~31k entries) is split by first letter, so the
 * browser fetches one shard (a few kB gzipped) the first time the user types
 * `@lemma:<letter>`, rather than the whole list up front.
 */

import { CORPUS_LEMMATA_LIST } from "@/common/library/corpus/corpus_common";
import { readCorpusSuggestionList } from "@/web/v2/corpus/corpus_query.server";

/** Lowercased first letter → the JSON array of the lemmata starting with it. */
export type LemmaShards = ReadonlyMap<string, string>;

/**
 * Groups `lemmata` by their lowercased first letter, so `Caesar` and `caedo`
 * share the `c` shard. Each shard is sorted by UTF-16 code unit (the default
 * `sort()`), which is the order the client's binary search assumes.
 */
export function buildLemmaShards(lemmata: readonly string[]): LemmaShards {
  const groups = new Map<string, string[]>();
  for (const lemma of lemmata) {
    if (lemma.length === 0) continue;
    const key = lemma[0].toLowerCase();
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [lemma]);
    } else {
      group.push(lemma);
    }
  }
  return new Map(
    [...groups].map(([key, group]) => [key, JSON.stringify(group.sort())])
  );
}

let cachedLemmata: Promise<readonly string[] | undefined> | null = null;

/** The corpus lemma list, or `undefined` if the corpus isn't built. */
export function loadCorpusLemmata(): Promise<readonly string[] | undefined> {
  if (cachedLemmata === null) {
    cachedLemmata = readCorpusSuggestionList(CORPUS_LEMMATA_LIST);
  }
  return cachedLemmata;
}
