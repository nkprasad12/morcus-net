import { EntryOutline, EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import { DictOptions, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { decodeMessage } from "@/web/utils/rpc/parsing";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";
import {
  findEntriesForQuery,
  type InflectionProvider,
} from "@/common/dictionaries/latin_dict_fetching";

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
  function validator(t: unknown): t is StoredEntryData {
    // This is only used to restore from the SQL data so we don't need to check.
    return true;
  }

  export function fromEncoded(message: string): StoredEntryData {
    return decodeMessage(message, validator, REGISTRY);
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
    return findEntriesForQuery(rawInput, {
      extras,
      options,
      storage: this.storage,
      inflectionProvider: this.inflectionProvider,
      reviver: StoredEntryData.fromEncoded,
      toEntryResult: StoredEntryData.toEntryResult,
      disambiguator: (dictResult, inflectionResult) =>
        dictResult.n === inflectionResult[1],
    });
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
