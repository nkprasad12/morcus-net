import type { EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import type {
  Dictionary,
  DictOptions,
} from "@/common/dictionaries/dictionaries";
import {
  findEntriesForQuery,
  type InflectionProvider,
} from "@/common/dictionaries/latin_dict_fetching";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import type { ServerExtras } from "@/web/utils/rpc/server_rpc";

export class GesnerDict implements Dictionary {
  readonly info = LatinDict.Gesner;

  private readonly storage: StoredDict;

  constructor(
    backing: StoredDictBacking<any>,
    private readonly inflectionProvider: InflectionProvider
  ) {
    this.storage = new StoredDict(backing);
  }

  private processRaw(input: string): EntryResult {
    const parsed = JSON.parse(input);
    return {
      entry: XmlNodeSerialization.DEFAULT.deserialize(parsed.entry),
      outline: parsed.outline,
    };
  }

  async getEntry(
    input: string,
    extras?: ServerExtras,
    options?: DictOptions
  ): Promise<EntryResult[]> {
    return findEntriesForQuery(input, {
      extras,
      options,
      storage: this.storage,
      inflectionProvider: this.inflectionProvider,
      reviver: this.processRaw,
      toEntryResult: (data) => data,
      // Gesner numberings for homograms do not correspond to
      // Morpheus numbers (which follow L&S).
      disambiguator: () => true,
    });
  }

  async getCompletions(input: string): Promise<string[]> {
    return this.storage.getCompletions(input);
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    const rawResult = await this.storage.getById(id);
    return rawResult === undefined ? rawResult : this.processRaw(rawResult);
  }
}
