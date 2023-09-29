import { OutlineSection } from "@/common/dictionaries/dict_result";
import { EntryOutline } from "@/common/dictionaries/dict_result";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";

export function getOutline(entry: ShEntry, id: number): EntryOutline {
  const senses: OutlineSection[] = entry.senses.map((sense, j) => ({
    level: sense.level,
    ordinal: sense.bullet,
    text: chooseOutlineText(sense.text, 50),
    sectionId: `sh${id}.${j}`,
  }));
  return {
    mainKey: entry.keys[0],
    mainLabel: findShLabelText(entry.keys[0], entry.blurb),
    mainSection: {
      level: 0,
      ordinal: "0",
      text: chooseOutlineText(entry.blurb, 100),
      sectionId: `sh${id}`,
    },
    senses: senses,
  };
}

export function findShLabelText(
  key: string,
  blurb: string
): string | undefined {
  const keyMarkup = `<b>${key}</b>`;
  let i = blurb.indexOf(keyMarkup);
  if (i === -1) {
    return undefined;
  }
  i += keyMarkup.length;
  while (i < blurb.length && blurb[i] === " ") {
    i++;
  }

  if (blurb[i] !== "(") {
    return undefined;
  }
  let j = blurb.indexOf(")", i);
  if (j === -1 || j - i > 18) {
    j = i + 18;
  }
  return `${key} ${blurb.substring(i, j + 1)}`;
}

function chooseOutlineText(input: string, _suggestedChars: number): string {
  return input.split(":")[0];
}
