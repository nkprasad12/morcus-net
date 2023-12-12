import { envVar } from "@/common/assert";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { RawDictEntry, SqlDict } from "@/common/dictionaries/dict_storage";
import { Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  ShLinkResolver,
  displayShEntry,
} from "@/common/smith_and_hall/sh_display";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";
import { getOutline } from "@/common/smith_and_hall/sh_outline";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";

export function shListToRaw(entries: ShEntry[]): RawDictEntry[] {
  const resolver = new ShLinkResolver(entries);
  return entries.map((entry, i) => {
    const displayEntry = displayShEntry(entry, i, resolver);
    const processedEntry = {
      entry: XmlNodeSerialization.DEFAULT.serialize(displayEntry),
      outline: getOutline(entry, i),
    };
    return {
      id: `sh${i}`,
      keys: entry.keys.join("@"),
      entry: JSON.stringify(processedEntry),
    };
  });
}

export class SmithAndHall implements Dictionary {
  readonly info = LatinDict.SmithAndHall;

  private readonly sqlDict: SqlDict;

  constructor(dbPath: string = envVar("SH_PROCESSED_PATH")) {
    this.sqlDict = new SqlDict(dbPath, "@");
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
