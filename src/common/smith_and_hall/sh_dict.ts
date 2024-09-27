import { EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import { Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";

export class SmithAndHall implements Dictionary {
  readonly info = LatinDict.SmithAndHall;

  private readonly storage: StoredDict;

  constructor(backing: StoredDictBacking<any>) {
    this.storage = new StoredDict(backing);
  }

  private reviveRaw(input: string) {
    const parsed = JSON.parse(input);
    return {
      entry: XmlNodeSerialization.DEFAULT.deserialize(parsed.entry),
      outline: parsed.outline,
    };
  }

  async getEntry(
    input: string,
    extras?: ServerExtras | undefined
  ): Promise<EntryResult[]> {
    const rawEntries = await this.storage.getRawEntry(input, extras);
    return rawEntries.map(this.reviveRaw, this);
  }

  async getCompletions(input: string): Promise<string[]> {
    return this.storage.getCompletions(input);
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    const rawResult = await this.storage.getById(id);
    return rawResult === undefined ? rawResult : this.reviveRaw(rawResult);
  }
}
