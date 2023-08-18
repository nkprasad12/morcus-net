import { checkPresent } from "@/common/assert";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { displayShEntry } from "@/common/smith_and_hall/sh_display";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";
import { getOutline } from "@/common/smith_and_hall/sh_outline";

export function shToRaw(entry: ShEntry) {
  return {
    keys: entry.keys.join("@"),
    entry: JSON.stringify(entry),
  };
}

export class SmithAndHall extends SqlDict {
  constructor(dbPath: string = checkPresent(process.env.SH_PROCESSED_PATH)) {
    super(
      dbPath,
      LatinDict.SmithAndHall,
      (entryStrings) =>
        entryStrings
          .map((x) => JSON.parse(x))
          .map((article, i) => ({
            entry: displayShEntry(article, i),
            outline: getOutline(article, i),
          })),
      (input) => input.split("@")
    );
  }
}
