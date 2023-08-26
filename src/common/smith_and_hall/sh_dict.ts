import { checkPresent } from "@/common/assert";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  ShLinkResolver,
  displayShEntry,
} from "@/common/smith_and_hall/sh_display";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";
import { getOutline } from "@/common/smith_and_hall/sh_outline";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";

export function shListToRaw(entries: ShEntry[]) {
  const resolver = new ShLinkResolver(entries);
  return entries.map((entry, i) => {
    const displayEntry = displayShEntry(entry, i, resolver);
    const processedEntry = {
      entry: XmlNodeSerialization.DEFAULT.serialize(displayEntry),
      outline: getOutline(entry, i),
    };
    return {
      keys: entry.keys.join("@"),
      entry: JSON.stringify(processedEntry),
    };
  });
}

export class SmithAndHall extends SqlDict {
  constructor(dbPath: string = checkPresent(process.env.SH_PROCESSED_PATH)) {
    super(
      dbPath,
      LatinDict.SmithAndHall,
      (entryStrings) =>
        entryStrings
          .map((x) => JSON.parse(x))
          .map((storedEntry) => ({
            entry: XmlNodeSerialization.DEFAULT.deserialize(storedEntry.entry),
            outline: storedEntry.outline,
          })),
      (input) => input.split("@")
    );
  }
}
