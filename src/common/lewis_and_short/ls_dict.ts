import { assertEqual } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { Vowels } from "@/common/character_utils";
import { EntryOutline, EntryResult } from "@/common/dictionaries/dict_result";
import { RawDictEntry, SqlDict } from "@/common/dictionaries/dict_storage";
import { DictOptions, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { LatinWords } from "@/common/lexica/latin_words";
import { removeDiacritics } from "@/common/text_cleaning";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { decodeMessage, encodeMessage } from "@/web/utils/rpc/parsing";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { wordInflectionDataToArray } from "@/morceus/inflection_data_utils";

const REPLACED_CHARS = new Map<string, string>([
  ["ſ", "s"],
  ["æ", "ae"],
  ["Æ", "Ae"],
  ["œ", "oe"],
  ["Œ", "Oe"],
]);

const REGISTRY = [XmlNodeSerialization.DEFAULT];

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

  export function toRawDictEntry(
    id: string,
    keys: string[],
    entry: StoredEntryData
  ): RawDictEntry {
    return {
      keys: keys,
      entry: encodeMessage(entry, REGISTRY),
      id,
    };
  }

  export function toEntryResult(entry: StoredEntryData): EntryResult {
    return { outline: entry.outline, entry: entry.entry };
  }
}

export class LewisAndShort implements Dictionary {
  readonly info = LatinDict.LewisAndShort;

  private readonly sqlDict: SqlDict;

  constructor(dbFile: string = envVar("LS_PROCESSED_PATH")) {
    this.sqlDict = new SqlDict(dbFile);
  }

  async getEntryById(
    id: string,
    extras?: ServerExtras
  ): Promise<EntryResult | undefined> {
    const raw = this.sqlDict.getById(id);
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
    const exactMatches: StoredEntryData[] = this.sqlDict
      .getRawEntry(input, extras)
      .map(StoredEntryData.fromEncoded);
    if (options?.handleInflections !== true) {
      return exactMatches.map(StoredEntryData.toEntryResult);
    }

    const cleanInput = removeDiacritics(input)
      .replaceAll("\u0304", "")
      .replaceAll("\u0306", "");
    const analyses = LatinWords.analysesFor(cleanInput)
      .map((inflection) => ({
        ...inflection,
        inflectedForms: inflection.inflectedForms.filter((form) =>
          Vowels.haveCompatibleLength(input, form.form)
        ),
      }))
      .filter((inflection) => inflection.inflectedForms.length > 0);
    extras?.log("inflectionAnalysis");
    const inflectedResults: EntryResult[] = [];
    const exactResults: EntryResult[] = [];
    for (const analysis of analyses) {
      const lemmaChunks = analysis.lemma.split("#");
      const lemmaBase = lemmaChunks[0];

      const rawResults = this.sqlDict.getRawEntry(lemmaBase, extras);
      const results: EntryResult[] = rawResults
        .map(StoredEntryData.fromEncoded)
        .filter((data) => {
          if (lemmaChunks.length === 1) {
            return true;
          }
          assertEqual(lemmaChunks.length, 2);
          return data.n === lemmaChunks[1];
        })
        .map((data) => ({
          ...StoredEntryData.toEntryResult(data),
          inflections: analysis.inflectedForms.flatMap((inflData) =>
            inflData.inflectionData.map((info) => ({
              lemma: analysis.lemma,
              form: inflData.form,
              data: wordInflectionDataToArray(info.grammaticalData).join(" "),
              usageNote: info.tags?.join(" "),
            }))
          ),
        }));
      extras?.log("inflectionResultComputed");
      // TODO: Currently, getRawEntry will ignore case, i.e
      // canis will also return inputs for Canis. Ignore this for
      // now but we should fix it later and handle case difference explicitly.
      if (lemmaBase === removeDiacritics(input)) {
        exactResults.push(...results);
      } else {
        inflectedResults.push(...results);
      }
    }

    const results: EntryResult[] = [];
    const idsSoFar = new Set<string>();
    for (const candidate of exactResults
      .concat(exactMatches)
      .concat(inflectedResults)) {
      const id = candidate.entry.getAttr("id")!;
      if (idsSoFar.has(id)) {
        continue;
      }
      idsSoFar.add(id);
      results.push(candidate);
    }
    extras?.log("resultsFiltered");
    return results;
  }

  async getCompletions(
    input: string,
    _extras?: ServerExtras | undefined
  ): Promise<string[]> {
    return this.sqlDict.getCompletions(input);
  }
}

export namespace LewisAndShort {
  export function create(
    processedFile: string = envVar("LS_PROCESSED_PATH")
  ): LewisAndShort {
    const start = performance.now();
    const result = new LewisAndShort(processedFile);
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`LewisAndShort init: ${elapsed} ms`);
    return result;
  }
}
