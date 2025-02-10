import { EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import type { Dictionary } from "@/common/dictionaries/dictionaries";
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

  constructor(backing: StoredDictBacking<any>) {
    this.storage = new StoredDict(backing);
  }

  async getEntry(input: string, extras?: ServerExtras): Promise<EntryResult[]> {
    const rawEntries = await this.storage.getRawEntry(input, extras);
    return rawEntries.map(({ entry }) => revive(entry));
  }

  async getCompletions(input: string): Promise<string[]> {
    return this.storage.getCompletions(input);
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    const rawResult = await this.storage.getById(id);
    return rawResult === undefined ? rawResult : revive(rawResult);
  }
}
