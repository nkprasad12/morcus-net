/**
 * Lemma shards for the autocomplete.
 *
 * The corpus lemma list (~31k entries) is split by first letter and
 * pre-compressed (`br -10` and `gzip -9`) into a small SQLite table at build
 * time, so the browser fetches one shard (a few kB) the first time the user
 * types `@lemma:<letter>`, and the server serves the pre-compressed bytes
 * directly without parsing or re-compressing on the fly.
 */

import path from "path";
import zlib from "zlib";
import {
  CORPUS_DIR,
  CORPUS_LEMMATA_DB,
} from "@/common/library/corpus/corpus_common";
import {
  openPrecompressedJsonDb,
  type PrecompressedJsonStore,
} from "@/web/v2/core/server/precompressed_json.server";

/** Lowercased first letter → the JSON array of the lemmata starting with it. */
type LemmaShards = ReadonlyMap<string, string>;

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

let cachedLemmaStore: PrecompressedJsonStore | undefined | null = null;

/**
 * Opens the pre-compressed corpus lemma shards SQLite table, or returns
 * `undefined` if the corpus isn't built.
 */
export function openCorpusLemmaStore(
  corpusDir: string = CORPUS_DIR
): PrecompressedJsonStore | undefined {
  if (corpusDir !== CORPUS_DIR) {
    return openPrecompressedJsonDb(path.join(corpusDir, CORPUS_LEMMATA_DB));
  }
  if (cachedLemmaStore === null) {
    cachedLemmaStore = openPrecompressedJsonDb(
      path.join(CORPUS_DIR, CORPUS_LEMMATA_DB)
    );
  }
  return cachedLemmaStore;
}

/**
 * Resolves `value` against `lemmata`: exact match wins; otherwise a unique
 * case-insensitive match is returned; if none or multiple case-insensitive
 * matches exist, returns `undefined`.
 */
export function resolveCanonicalLemma(
  value: string,
  lemmata: readonly string[]
): string | undefined {
  if (lemmata.includes(value)) {
    return value;
  }
  const lower = value.toLowerCase();
  let match: string | undefined;
  for (const lemma of lemmata) {
    if (lemma.toLowerCase() === lower) {
      if (match !== undefined && match !== lemma) {
        return undefined;
      }
      match = lemma;
    }
  }
  return match;
}

function isReadonlyStringArray(
  source: PrecompressedJsonStore | readonly string[]
): source is readonly string[] {
  return Array.isArray(source);
}

/**
 * Builds a lemma canonicalizer from a `PrecompressedJsonStore` of first-letter
 * shards (decoding each shard at most once) or an in-memory lemma list.
 */
export function createLemmaCanonicalizer(
  source: PrecompressedJsonStore | readonly string[] | undefined
): (value: string) => string | undefined {
  if (source === undefined) {
    return () => undefined;
  }
  if (isReadonlyStringArray(source)) {
    return (value: string) =>
      value.length === 0 ? undefined : resolveCanonicalLemma(value, source);
  }
  const shardCache = new Map<string, readonly string[]>();
  return (value: string): string | undefined => {
    if (value.length === 0) {
      return undefined;
    }
    const key = value[0].toLowerCase();
    let shard = shardCache.get(key);
    if (shard === undefined) {
      const row = source.get(key);
      if (row === undefined) {
        shard = [];
      } else {
        const parsed: unknown = JSON.parse(
          zlib.gunzipSync(row.gzip).toString("utf8")
        );
        shard = Array.isArray(parsed) ? parsed : [];
      }
      shardCache.set(key, shard);
    }
    return resolveCanonicalLemma(value, shard);
  };
}

let cachedCanonicalLemma: ((value: string) => string | undefined) | null = null;

/**
 * Resolves `value` against the built corpus lemma shards (exact match first,
 * then unique case-insensitive match), or returns `undefined` if the corpus
 * isn't built or `value` is unknown/ambiguous.
 */
export function canonicalCorpusLemma(value: string): string | undefined {
  if (cachedCanonicalLemma === null) {
    cachedCanonicalLemma = createLemmaCanonicalizer(openCorpusLemmaStore());
  }
  return cachedCanonicalLemma(value);
}
