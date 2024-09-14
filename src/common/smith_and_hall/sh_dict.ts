import { envVar } from "@/common/env_vars";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import { Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";

export class SmithAndHall implements Dictionary {
  readonly info = LatinDict.SmithAndHall;

  private readonly sqlDict: StoredDict;

  constructor(dbPath: string = envVar("SH_PROCESSED_PATH")) {
    this.sqlDict = new StoredDict(sqliteBacking(dbPath));
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
    const rawEntries = await this.sqlDict.getRawEntry(input, extras);
    return rawEntries.map(this.reviveRaw, this);
  }

  async getCompletions(input: string): Promise<string[]> {
    return this.sqlDict.getCompletions(input);
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    const rawResult = await this.sqlDict.getById(id);
    return rawResult === undefined ? rawResult : this.reviveRaw(rawResult);
  }
}
