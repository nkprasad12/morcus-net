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
} from "@/web/ui/core/server/precompressed_json.server";

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

/** How a user-typed `@lemma:` value resolves against the corpus lemmata. */
export type LemmaResolution =
  | { readonly kind: "found"; readonly lemma: string }
  | { readonly kind: "ambiguous"; readonly options: readonly string[] }
  | { readonly kind: "unknown" };

/**
 * Resolves a user-typed `@lemma:` value, or returns `undefined` when the lemma
 * list isn't available (the value then goes to the engine as typed).
 */
export type LemmaResolver = (value: string) => LemmaResolution | undefined;

/** `edo#1` → `["edo", "1"]`; `edo1` → `["edo", "1"]`; `edo` → `["edo"]`. */
function splitHomographSuffix(value: string): [string, string?] {
  const match = /^(.*[^\d#])#?(\d+)$/.exec(value);
  return match === null ? [value] : [match[1], match[2]];
}

/**
 * Resolves `value` against `lemmata`.
 *
 * - An exact match wins (`Magnus` and `magnus` are both lemmata).
 * - Otherwise the candidates are the case-insensitive matches plus, for a bare
 *   value, its numbered homographs (`edo` → `edo#1`, `edo#2`, ...), or, for a
 *   numbered value, the homograph with that number (`edo1` → `edo#1`).
 * - One candidate resolves; several are ambiguous. A numbered value with no
 *   candidate lists the base's homographs instead (`edo#9` → `edo#1`, ...).
 */
export function resolveLemma(
  value: string,
  lemmata: readonly string[]
): LemmaResolution {
  if (lemmata.includes(value)) {
    return { kind: "found", lemma: value };
  }
  const lower = value.toLowerCase();
  const [base, number] = splitHomographSuffix(lower);
  const homographsOfBase = (lemma: string) => {
    const [lemmaBase, lemmaNumber] = splitHomographSuffix(lemma.toLowerCase());
    return lemmaNumber !== undefined &&
      lemma.includes("#") &&
      lemmaBase === base
      ? lemmaNumber
      : undefined;
  };
  const candidates = lemmata.filter((lemma) => {
    if (lemma.toLowerCase() === lower) return true;
    const lemmaNumber = homographsOfBase(lemma);
    return (
      lemmaNumber !== undefined &&
      (number === undefined || Number(lemmaNumber) === Number(number))
    );
  });
  if (candidates.length === 1) {
    return { kind: "found", lemma: candidates[0] };
  }
  if (candidates.length > 1) {
    return { kind: "ambiguous", options: [...candidates].sort() };
  }
  if (number !== undefined) {
    const options = lemmata.filter((l) => homographsOfBase(l) !== undefined);
    if (options.length > 0) {
      return { kind: "ambiguous", options: [...options].sort() };
    }
  }
  return { kind: "unknown" };
}

function isReadonlyStringArray(
  source: PrecompressedJsonStore | readonly string[]
): source is readonly string[] {
  return Array.isArray(source);
}

/**
 * Builds a {@link LemmaResolver} from a `PrecompressedJsonStore` of
 * first-letter shards (decoding each shard at most once) or an in-memory
 * lemma list. With no source, every value is left as typed.
 */
export function createLemmaResolver(
  source: PrecompressedJsonStore | readonly string[] | undefined
): LemmaResolver {
  if (source === undefined) {
    return () => undefined;
  }
  if (isReadonlyStringArray(source)) {
    return (value: string) =>
      value.length === 0 ? undefined : resolveLemma(value, source);
  }
  const shardCache = new Map<string, readonly string[]>();
  return (value: string): LemmaResolution | undefined => {
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
    return resolveLemma(value, shard);
  };
}

let cachedCorpusLemmaResolver: LemmaResolver | null = null;

/**
 * Resolves `value` against the built corpus lemma shards (see
 * {@link resolveLemma}), or returns `undefined` if the corpus isn't built.
 */
export function resolveCorpusLemma(value: string): LemmaResolution | undefined {
  if (cachedCorpusLemmaResolver === null) {
    cachedCorpusLemmaResolver = createLemmaResolver(openCorpusLemmaStore());
  }
  return cachedCorpusLemmaResolver(value);
}
