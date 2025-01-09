import type { EntryResult } from "@/common/dictionaries/dict_result";
import type { DictInfo, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";

export class RiddleArnoldDict implements Dictionary {
  readonly info: DictInfo = LatinDict.RiddleArnold;

  async getEntry(input: string): Promise<EntryResult[]> {
    console.log("[RA] " + input);
    return [];
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    return undefined;
  }

  async getCompletions(_input: string): Promise<string[]> {
    // For now, don't handle autocompletions.
    return [];
  }
}
