import { assertEqual } from "@/common/assert";
import { Vowels } from "@/common/character_utils";
import {
  EntryOutline,
  EntryResult,
  type DictSubsectionResult,
} from "@/common/dictionaries/dict_result";
import {
  StoredDict,
  type StoredEntryAndMetadata,
} from "@/common/dictionaries/dict_storage";
import { DictOptions, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { removeDiacritics } from "@/common/text_cleaning";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { decodeMessage } from "@/web/utils/rpc/parsing";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { wordInflectionDataToArray } from "@/morceus/inflection_data_utils";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";
import type { LatinWordAnalysis } from "@/morceus/cruncher_types";

const REPLACED_CHARS = new Map<string, string>([
  ["ſ", "s"],
  ["æ", "ae"],
  ["Æ", "Ae"],
  ["œ", "oe"],
  ["Œ", "Oe"],
]);

const REGISTRY = [XmlNodeSerialization.DEFAULT];

/** Finds analyses for the diacritic-free input. */
type InflectionProvider = (
  cleanInput: string
) => LatinWordAnalysis[] | Promise<LatinWordAnalysis[]>;

export interface StoredEntryData {
  /** The disambiguation number for this entry, if applicable. */
  n?: string;
  /** The outline for this entry. */
  outline: EntryOutline;
  /** The root node for a marked up entry. */
  entry: XmlNode;
}

/** Exported only for unit tests. */
export namespace StoredEntryData {
  export function validator(t: unknown): t is StoredEntryData {
    // This is only used to restore from the SQL data so we don't need to check.
    return true;
  }

  export function fromEncoded(message: string): StoredEntryData {
    return decodeMessage(message, StoredEntryData.validator, REGISTRY);
  }

  export function toEntryResult(entry: StoredEntryData): EntryResult {
    return { outline: entry.outline, entry: entry.entry };
  }
}

export class LewisAndShort implements Dictionary {
  readonly info = LatinDict.LewisAndShort;

  private readonly storage: StoredDict;

  constructor(
    backing: StoredDictBacking<any>,
    private readonly inflectionProvider: InflectionProvider
  ) {
    this.storage = new StoredDict(backing);
  }

  async getEntryById(
    id: string,
    extras?: ServerExtras
  ): Promise<EntryResult | undefined> {
    const raw = await this.storage.getById(id);
    extras?.log("getById_sqlLookup");
    if (raw === undefined) {
      return undefined;
    }
    const result = StoredEntryData.toEntryResult(
      StoredEntryData.fromEncoded(raw)
    );
    extras?.log("getById_resultConversion");
    return result;
  }

  async getEntry(
    rawInput: string,
    extras?: ServerExtras,
    options?: DictOptions
  ): Promise<EntryResult[]> {
    const input = rawInput
      .split("")
      .map((c) => REPLACED_CHARS.get(c) || c)
      .join("");
    // Sub-entries have the same dictionary data as an entry,
    // so ensure we're not doing the same work twice. This is still suboptimal
    // because it requires reading the same potentially long data twice for
    // multiple entries in the database, but we can live with this for now.
    const decodedEntries = new Map<string, StoredEntryData>();
    const decodeStored = (
      data: StoredEntryAndMetadata
    ): Readonly<StoredEntryData> => {
      const cached = decodedEntries.get(data.id);
      if (cached !== undefined) {
        return cached;
      }
      const decoded = StoredEntryData.fromEncoded(data.entry);
      decodedEntries.set(data.id, decoded);
      return decoded;
    };
    type DecodedStoredEntryAndMetadata = Omit<StoredEntryAndMetadata, "entry"> &
      StoredEntryData &
      Pick<EntryResult, "inflections"> &
      Pick<EntryResult, "subsections">;

    const rawEntries = await this.storage.getRawEntry(input, extras);
    const exactMatches: DecodedStoredEntryAndMetadata[] = rawEntries.map(
      (entryAndMetadata) => ({
        ...entryAndMetadata,
        ...decodeStored(entryAndMetadata),
      })
    );
    if (options?.handleInflections !== true) {
      return exactMatches.map(StoredEntryData.toEntryResult);
    }

    const cleanInput = removeDiacritics(input)
      .replaceAll("\u0304", "")
      .replaceAll("\u0306", "");
    const inflectedResults: DecodedStoredEntryAndMetadata[] = [];
    const exactResults: DecodedStoredEntryAndMetadata[] = [];
    // Get inflected results that may match the input.
    const analyses = await this.inflectionProvider(cleanInput);
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

      const results = (await this.storage.getRawEntry(lemmaBase, extras))
        .map((entryAndMetadata) => ({
          ...entryAndMetadata,
          ...decodeStored(entryAndMetadata),
        }))
        .filter((entryData) => {
          if (lemmaChunks.length === 1) {
            return true;
          }
          assertEqual(lemmaChunks.length, 2);
          return entryData.n === lemmaChunks[1];
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

  async getCompletions(
    input: string,
    _extras?: ServerExtras | undefined
  ): Promise<string[]> {
    return this.storage.getCompletions(input);
  }
}

export namespace LewisAndShort {
  export function create(
    backing: StoredDictBacking<any>,
    inflectionProvider: InflectionProvider
  ): LewisAndShort {
    const start = performance.now();
    const result = new LewisAndShort(backing, inflectionProvider);
    const elapsed = (performance.now() - start).toFixed(2);
    console.debug(`LewisAndShort init: ${elapsed} ms`);
    return result;
  }
}
