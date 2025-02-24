import { assertEqual } from "@/common/assert";
import { Vowels } from "@/common/character_utils";
import type {
  EntryResult,
  DictSubsectionResult,
} from "@/common/dictionaries/dict_result";
import type {
  StoredDict,
  StoredEntryAndMetadata,
} from "@/common/dictionaries/dict_storage";
import type { DictOptions } from "@/common/dictionaries/dictionaries";
import { removeDiacritics } from "@/common/text_cleaning";
import { type LatinWordAnalysis } from "@/morceus/cruncher_types";
import { wordInflectionDataToArray } from "@/morceus/inflection_data_utils";
import type { ServerExtras } from "@/web/utils/rpc/server_rpc";

const REPLACED_CHARS = new Map<string, string>([
  ["ſ", "s"],
  ["æ", "ae"],
  ["Æ", "Ae"],
  ["œ", "oe"],
  ["Œ", "Oe"],
]);

/** Finds analyses for the diacritic-free input. */
export type InflectionProvider = (
  cleanInput: string
) => LatinWordAnalysis[] | Promise<LatinWordAnalysis[]>;

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
  const input = rawInput
    .split("")
    .map((c) => REPLACED_CHARS.get(c) || c)
    .join("");
  // Sub-entries have the same dictionary data as an entry,
  // so ensure we're not doing the same work twice. This is still suboptimal
  // because it requires reading the same potentially long data twice for
  // multiple entries in the database, but we can live with this for now.
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

  const rawEntries = await storage.getRawEntry(input, extras);
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
      return Vowels.haveCompatibleLength(input, fullForm);
    });
    if (inflectedForms.length === 0) {
      continue;
    }

    // Get the base lemma - for example, for `occido#2` -> `occido`.
    const lemmaChunks = analysis.lemma.split("#");
    const lemmaBase = lemmaChunks[0];

    const results = (await storage.getRawEntry(lemmaBase, extras))
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
        const inflections = analysis.inflectedForms.flatMap((inflData) =>
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
      mergedResults.set(id, toMerge);
      continue;
    }
    if (toMerge.inflections) {
      if (merged.inflections === undefined) {
        merged.inflections = [];
      }
      merged.inflections.push(...toMerge.inflections);
    }
    for (const pendingSubsection of toMerge.subsections ?? []) {
      const mergedSubsection = merged.subsections?.filter(
        (s) => s.id === pendingSubsection.id
      )?.[0];
      if (merged.subsections === undefined) {
        merged.subsections = [];
      }
      if (mergedSubsection === undefined) {
        merged.subsections.push({ ...pendingSubsection });
        continue;
      }
      if (pendingSubsection.inflections === undefined) {
        // If we have no inflections, there's nothing to merge.
        continue;
      }
      if (mergedSubsection.inflections === undefined) {
        mergedSubsection.inflections = [];
      }
      mergedSubsection.inflections.push(...pendingSubsection.inflections);
    }
  }
  extras?.log("resultsFiltered");
  return Array.from(mergedResults.values());
}
