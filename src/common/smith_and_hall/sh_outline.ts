import { OutlineSection } from "@/common/dictionaries/dict_result";
import { EntryOutline } from "@/common/dictionaries/dict_result";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";

export function getOutline(entry: ShEntry, id: number): EntryOutline {
  const senses: OutlineSection[] = entry.senses.map((sense, j) => ({
    level: sense.level,
    ordinal: sense.bullet,
    text: sense.text.substring(0, 50),
    sectionId: `sh${id}.${j}`,
  }));
  return {
    mainKey: entry.keys[0],
    mainSection: {
      level: 0,
      ordinal: "0",
      text: entry.blurb.substring(0, 100),
      sectionId: `sh${id}`,
    },
    senses: senses,
  };
}
