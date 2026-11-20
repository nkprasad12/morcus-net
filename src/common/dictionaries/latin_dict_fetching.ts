import { assertEqual } from "@/common/assert";
import { haveCompatibleVowelLength } from "@/common/character_utils";
import type {
  EntryResult,
  DictSubsectionResult,
  InflectionData,
} from "@/common/dictionaries/dict_result";
import type {
  StoredDict,
  StoredEntryAndMetadata,
} from "@/common/dictionaries/dict_storage";
import type { DictOptions } from "@/common/dictionaries/dictionaries";
import type { DeepReadonly } from "@/common/misc_utils";
import {
  foldLatinLigaturesAndNumerals,
  removeDiacritics,
} from "@/common/text_cleaning";
import { type LatinWordAnalysis } from "@/morceus/cruncher_types";
import { wordInflectionDataToArray } from "@/morceus/inflection_data_utils";
import type { ServerExtras } from "@/web/utils/rpc/server_rpc";

const REPLACED_CHARS = new Map<string, string>([["ſ", "s"]]);

/**
 * Finds analyses for the diacritic-free input.
 *
 * Results may be shared between callers (for example, if the provider is
 * memoized), so they are readonly.
 */
export type InflectionProvider = (
  cleanInput: string
) =>
  | DeepReadonly<LatinWordAnalysis[]>
  | Promise<DeepReadonly<LatinWordAnalysis[]>>;

export interface FindEntriesForQueryArgs<T extends EntryResult = EntryResult> {
  extras?: ServerExtras;
  options?: DictOptions;
  storage: StoredDict;
  inflectionProvider: InflectionProvider;
  reviver: (raw: string) => T;
  toEntryResult: (data: T) => EntryResult;
  disambiguator: (dictResult: T, inflectionResult: [string, string]) => boolean;
}

export async function findEntriesForQuery<T extends EntryResult>(
  rawInput: string,
  args: FindEntriesForQueryArgs<T>
): Promise<EntryResult[]> {
  const { extras, options, storage, inflectionProvider } = args;
  const input = foldLatinLigaturesAndNumerals(rawInput)
    .split("")
    .map((c) => REPLACED_CHARS.get(c) || c)
    .join("");
  // Sub-entries, case-variant lemmas (e.g. `varius`/`Varius`), and homonym
  // analyses (e.g. `qui#1`/`qui#2`, or an input that is itself a lemma like
  // `ut`) can request the same raw lemma or entry ID multiple times within a
  // single query. Cache raw SQLite lookups (by case-folded query string), raw
  // entry blobs (by entry ID across sub-entries), and decoded XML trees (by
  // entry ID) across the query.
  const rawEntryBlobCache = new Map<string, string>();
  const rawEntryCache = new Map<string, Promise<StoredEntryAndMetadata[]>>();
  const getRawCached = (
    queryKey: string
  ): Promise<StoredEntryAndMetadata[]> => {
    const cacheKey = queryKey.toLowerCase();
    const cached = rawEntryCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const pending = storage.getRawEntry(
      queryKey,
      "La",
      extras,
      rawEntryBlobCache
    );
    rawEntryCache.set(cacheKey, pending);
    return pending;
  };
  const decodedEntries = new Map<string, T>();
  const decodeStored = (data: StoredEntryAndMetadata): Readonly<T> => {
    const cached = decodedEntries.get(data.id);
    if (cached !== undefined) {
      return cached;
    }
    const decoded = args.reviver(data.entry);
    decodedEntries.set(data.id, decoded);
    return decoded;
  };
  type DecodedStoredEntryAndMetadata = Omit<StoredEntryAndMetadata, "entry"> &
    T &
    Pick<EntryResult, "inflections"> &
    Pick<EntryResult, "subsections">;

  const rawEntries = await getRawCached(input);
  const exactMatches: DecodedStoredEntryAndMetadata[] = rawEntries.map(
    (entryAndMetadata) => ({
      ...entryAndMetadata,
      ...decodeStored(entryAndMetadata),
    })
  );
  if (options?.handleInflections !== true) {
    return exactMatches.map(args.toEntryResult);
  }

  const cleanInput = removeDiacritics(input)
    .replaceAll("\u0304", "")
    .replaceAll("\u0306", "");
  const inflectedResults: DecodedStoredEntryAndMetadata[] = [];
  const exactResults: DecodedStoredEntryAndMetadata[] = [];
  // Get inflected results that may match the input.
  const analyses = await inflectionProvider(cleanInput);
  extras?.log("inflectionAnalysis");
  for (const analysis of analyses) {
    const inflectedForms = analysis.inflectedForms.filter((form) => {
      // Only bother checking the first one. Since the form is the same
      // and the input is the same, they will all have the same enclitic.
      const enclitic = form.inflectionData[0].enclitic ?? "";
      const fullForm = form.form + enclitic;
      // We should enforce vowel correctness on the enclitic, too.
      // https://github.com/nkprasad12/morcus-net/issues/175
      return haveCompatibleVowelLength(input, fullForm);
    });
    if (inflectedForms.length === 0) {
      continue;
    }

    // Get the base lemma - for example, for `occido#2` -> `occido`.
    const lemmaChunks = analysis.lemma.split("#");
    const lemmaBase = lemmaChunks[0];

    const results = (await getRawCached(lemmaBase))
      .map((entryAndMetadata) => ({
        ...entryAndMetadata,
        ...decodeStored(entryAndMetadata),
      }))
      .filter((entryData) => {
        if (lemmaChunks.length === 1) {
          return true;
        }
        assertEqual(lemmaChunks.length, 2);
        return args.disambiguator(entryData, [lemmaChunks[0], lemmaChunks[1]]);
      })
      .map((entryData) => {
        const subsectionIds = entryData.subsections?.map((s) => s.id);
        const inflections: readonly InflectionData[] = inflectedForms.flatMap(
          (inflData) =>
            inflData.inflectionData.map((info) => ({
              lemma: analysis.lemma,
              form:
                // We use | instead of + as the seprator since Morpheus tables use
                // + to signal diareses.
                inflData.form + (info.enclitic ? ` | ${info.enclitic}` : ""),
              data: wordInflectionDataToArray(info.grammaticalData).join(" "),
              usageNote: info.tags?.join(" "),
            }))
        );
        const result: DecodedStoredEntryAndMetadata = { ...entryData };
        if (entryData.includeMain) {
          result.inflections = inflections;
        }
        result.subsections = entryData.subsections?.map(
          (subsection): DictSubsectionResult => {
            if (subsectionIds?.includes(subsection.id)) {
              return { ...subsection, inflections: inflections };
            }
            return subsection;
          }
        );
        return result;
      });
    // TODO: Currently, getRawEntry will ignore case, i.e
    // canis will also return inputs for Canis. Ignore this for
    // now but we should fix it later and handle case difference explicitly.
    if (lemmaBase === removeDiacritics(input)) {
      exactResults.push(...results);
    } else {
      inflectedResults.push(...results);
    }
  }

  const mergedResults = new Map<string, EntryResult>();
  for (const toMerge of exactResults
    .concat(exactMatches)
    .concat(inflectedResults)) {
    const id = toMerge.id;
    const merged = mergedResults.get(id);
    if (merged === undefined) {
      mergedResults.set(id, {
        ...toMerge,
        inflections: toMerge.inflections?.slice(),
        subsections: toMerge.subsections?.map((s) => ({ ...s })),
      });
      continue;
    }
    mergedResults.set(id, {
      ...merged,
      inflections: mergeInflections(merged.inflections, toMerge.inflections),
      subsections: mergeSubsections(merged.subsections, toMerge.subsections),
    });
  }
  extras?.log("resultsFiltered");
  return Array.from(mergedResults.values());
}

function mergeInflections(
  existing: readonly InflectionData[] | undefined,
  incoming: readonly InflectionData[] | undefined
): readonly InflectionData[] | undefined {
  if (incoming === undefined) {
    return existing;
  }
  return existing === undefined ? [...incoming] : [...existing, ...incoming];
}

function mergeSubsections(
  existing: readonly DictSubsectionResult[] | undefined,
  incoming: readonly DictSubsectionResult[] | undefined
): readonly DictSubsectionResult[] | undefined {
  if (incoming === undefined) {
    return existing;
  }
  const merged = (existing ?? []).map((s) => ({ ...s }));
  for (const pending of incoming) {
    const idx = merged.findIndex((s) => s.id === pending.id);
    if (idx === -1) {
      merged.push({ ...pending });
      continue;
    }
    merged[idx] = {
      ...merged[idx],
      inflections: mergeInflections(
        merged[idx].inflections,
        pending.inflections
      ),
    };
  }
  return merged;
}
