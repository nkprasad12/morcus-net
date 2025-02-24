import { EntryResult } from "@/common/dictionaries/dict_result";
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
import { decodeMessage } from "@/web/utils/rpc/parsing";
import type { ServerExtras } from "@/web/utils/rpc/server_rpc";

function revive(raw: string): EntryResult {
  return decodeMessage(raw, EntryResult.isMatch, [
    XmlNodeSerialization.DEFAULT,
  ]);
}

export class GaffiotDict implements Dictionary {
  readonly info = LatinDict.Gaffiot;

  private readonly storage: StoredDict;

  constructor(
    backing: StoredDictBacking<any>,
    private readonly inflectionProvider: InflectionProvider
  ) {
    this.storage = new StoredDict(backing);
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
      reviver: revive,
      toEntryResult: (data) => data,
      // Gaffiot numberings for homographs do not correspond to
      // Morpheus numbers (which follow L&S).
      disambiguator: () => true,
    });
  }

  async getCompletions(input: string): Promise<string[]> {
    return this.storage.getCompletions(input);
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    const rawResult = await this.storage.getById(id);
    return rawResult === undefined ? rawResult : revive(rawResult);
  }
}
