import type { EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import type { Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import type { ServerExtras } from "@/web/utils/rpc/server_rpc";

function normalize(input: string): string {
  return input.replaceAll("ß", "ss");
}

export class GeorgesDict implements Dictionary {
  readonly info = LatinDict.Georges;

  private readonly storage: StoredDict;

  constructor(backing: StoredDictBacking<any>) {
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
    extras?: ServerExtras | undefined
  ): Promise<EntryResult[]> {
    const rawEntries = await this.storage.getRawEntry(
      normalize(input),
      this.info.languages.from,
      extras
    );
    return rawEntries.map(({ entry }) => this.processRaw(entry));
  }

  async getCompletions(input: string): Promise<string[]> {
    return this.storage.getCompletions(normalize(input));
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    const rawResult = await this.storage.getById(id);
    return rawResult === undefined ? rawResult : this.processRaw(rawResult);
  }
}
