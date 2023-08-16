import { checkPresent } from "@/common/assert";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { displayShEntry } from "@/common/smith_and_hall/sh_display";
import { getOutline } from "@/common/smith_and_hall/sh_outline";
import { ShEntry } from "@/common/smith_and_hall/sh_process";

function toGenericDict(processed: ShEntry[]): EntryResult[] {
  return processed.map((article, i) => {
    return {
      entry: displayShEntry(article, i),
      outline: getOutline(article, i),
    };
  });
}

export class SmithAndHall extends SqlDict {
  constructor(dbPath: string = checkPresent(process.env.SH_PROCESSED_PATH)) {
    super(
      dbPath,
      LatinDict.SmithAndHall,
      (entryStrings) => {
        const processedEntries = entryStrings.map((x) => JSON.parse(x));
        return toGenericDict(processedEntries);
      },
      (input) => input.split("@")
    );
  }
}
