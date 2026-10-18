import fs from "fs";
import { envVar } from "@/common/env_vars";
import type {
  CompletionsFusedRequest,
  CompletionsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { ReadOnlyDb } from "@/common/sql_helper";
import { removeDiacritics } from "@/common/text_cleaning";
import {
  openPrecompressedJsonDb,
  savePrecompressedJsonDb,
  type PrecompressedJsonStore,
} from "@/web/v2/core/server/precompressed_json.server";
import { getExpandedPrefixes } from "@/web/v2/dict/search/dict_clustering.common";
import { cleanCompletionQuery } from "@/web/v2/dict/search/dict_completions.common";
import {
  getV2DictChunks,
  type CompletionsProvider,
} from "@/web/v2/dict/search/dict_completions.server";
import { hasGreek } from "@/web/v2/dict/search/dict_greek.common";

const DICT_DB_VARS: ReadonlyArray<{ key: string; envName: string }> = [
  { key: LatinDict.LewisAndShort.key, envName: "LS_PROCESSED_PATH" },
  { key: LatinDict.SmithAndHall.key, envName: "SH_PROCESSED_PATH" },
  { key: LatinDict.RiddleArnold.key, envName: "RA_PROCESSED_PATH" },
  { key: LatinDict.Gaffiot.key, envName: "GAFFIOT_PROCESSED_PATH" },
  { key: LatinDict.Georges.key, envName: "GEORGES_PROCESSED_PATH" },
  { key: LatinDict.Gesner.key, envName: "GESNER_PROCESSED_PATH" },
  { key: LatinDict.Forcellini.key, envName: "FORC_PROCESSED_PATH" },
  { key: LatinDict.Pozo.key, envName: "POZO_PROCESSED_PATH" },
];

function addWordToPrefixMap(
  map: Map<string, string[]>,
  prefix: string,
  orth: string
): void {
  const list = map.get(prefix);
  if (list === undefined) {
    map.set(prefix, [orth]);
  } else {
    list.push(orth);
  }
}

function collectCandidatePrefixes(
  orth: string,
  cleanOrth: string,
  prefixIndex: Map<string, string[]>,
  out: Set<string>
): void {
  if (cleanOrth.length >= 2) {
    const base = cleanOrth.slice(0, 2);
    addWordToPrefixMap(prefixIndex, base, orth);
    for (const expanded of getExpandedPrefixes(base, "La")) {
      if (expanded.length === 2) {
        out.add(expanded);
      }
    }
    if (cleanOrth.startsWith("ss") && cleanOrth.length >= 3) {
      addWordToPrefixMap(prefixIndex, cleanOrth.slice(0, 3), orth);
      out.add(`ß${cleanOrth[2]}`);
    }
    if (cleanOrth.slice(1, 3) === "ss") {
      addWordToPrefixMap(prefixIndex, cleanOrth.slice(0, 3), orth);
      out.add(`${cleanOrth[0]}ß`);
    }
  }
  const rawClean = removeDiacritics(orth).toLowerCase();
  if (rawClean.length >= 2) {
    out.add(rawClean.slice(0, 2));
  }
}

/**
 * Pre-computes and pre-compresses (`br -10` + `gzip -9`) every 2-letter
 * unscoped dictionary completion chunk across the built dictionary databases
 * into a single SQLite file (`build/dbs/completions.db`).
 */
export async function buildCompletionsDb(
  destination: string = envVar("COMPLETIONS_DB_PATH"),
  dictDbPaths?: ReadonlyMap<string, string>
): Promise<void> {
  const dictPrefixIndices = new Map<string, Map<string, string[]>>();
  const candidatePrefixes = new Set<string>();

  const entries: ReadonlyArray<[string, string]> =
    dictDbPaths !== undefined
      ? Array.from(dictDbPaths.entries())
      : DICT_DB_VARS.map(({ key, envName }) => [key, envVar(envName)]);

  for (const [key, dbPath] of entries) {
    if (!fs.existsSync(dbPath)) {
      continue;
    }
    const db = ReadOnlyDb.getDatabase(dbPath);
    try {
      const backing = sqliteBacking(db);
      const prefixIndex = new Map<string, string[]>();
      dictPrefixIndices.set(key, prefixIndex);
      for (const { orth, cleanOrth } of backing.allEntryNames()) {
        collectCandidatePrefixes(
          orth,
          cleanOrth,
          prefixIndex,
          candidatePrefixes
        );
      }
    } finally {
      db.close();
    }
  }

  const provider: CompletionsProvider = {
    getCompletions(
      req: CompletionsFusedRequest
    ): Promise<CompletionsFusedResponse> {
      const cleanPrefix = removeDiacritics(req.query).toLowerCase();
      const res: CompletionsFusedResponse = {};
      for (const dictKey of req.dicts) {
        const words = dictPrefixIndices.get(dictKey)?.get(cleanPrefix);
        if (words !== undefined) {
          res[dictKey] = words;
        }
      }
      return Promise.resolve(res);
    },
  };

  const sortedPrefixes = Array.from(candidatePrefixes)
    .filter(
      (p) =>
        p.length === 2 &&
        !p.startsWith("-") &&
        !hasGreek(p) &&
        cleanCompletionQuery(p).query === p
    )
    .sort();

  const chunks = new Map<string, string>();
  for (const prefix of sortedPrefixes) {
    const chunk = await getV2DictChunks(provider, { rawPrefix: prefix });
    if (Object.keys(chunk).length > 0) {
      chunks.set(prefix, JSON.stringify(chunk));
    }
  }

  savePrecompressedJsonDb(destination, chunks);
}

/**
 * Opens the pre-compressed 2-letter completions SQLite database, or returns
 * `undefined` if it has not been built.
 */
export function openCompletionsDb(
  dbPath: string = envVar("COMPLETIONS_DB_PATH")
): PrecompressedJsonStore | undefined {
  return openPrecompressedJsonDb(dbPath);
}
