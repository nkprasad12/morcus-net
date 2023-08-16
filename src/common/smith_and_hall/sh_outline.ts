import { EntryOutline } from "@/common/dictionaries/dict_result";
import { ShEntry } from "@/common/smith_and_hall/sh_process";

export function getOutline(entry: ShEntry, id: number): EntryOutline {
  return {
    mainOrth: entry.keys[0],
    mainSection: {
      level: 0,
      ordinal: "0",
      text: entry.blurb,
      sectionId: `sh${id}`,
    },
  };
}
