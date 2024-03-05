import { envVar } from "@/common/assert";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";

export class SmithAndHall implements Dictionary {
  readonly info = LatinDict.SmithAndHall;

  private readonly sqlDict: SqlDict;

  constructor(dbPath: string = envVar("SH_PROCESSED_PATH")) {
    this.sqlDict = new SqlDict(dbPath);
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
    return this.sqlDict.getRawEntry(input, extras).map(this.reviveRaw, this);
  }

  async getCompletions(input: string): Promise<string[]> {
    return this.sqlDict.getCompletions(input);
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    const rawResult = this.sqlDict.getById(id);
    return rawResult === undefined ? rawResult : this.reviveRaw(rawResult);
  }
}
