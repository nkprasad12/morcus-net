import type { EntryResult } from "@/common/dictionaries/dict_result";
import type { DictInfo, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRomanNumeral } from "@/morceus/numerals/roman_numerals";

export function buildEntryFor(input: number): EntryResult {
  const key = `num${input}`;
  const resultXml = new XmlNode("div", [["id", key]], [`Arabic: ${input}`]);
  return {
    entry: resultXml,
    outline: {
      mainKey: key,
      mainSection: {
        text: `Arabic: ${input}`,
        level: 1,
        ordinal: "A",
        sectionId: key,
      },
    },
  };
}

function resolveNumeral(input: string): number | undefined {
  if (/^\d+$/.test(input)) {
    return parseInt(input);
  }
  const parsedRoman = parseRomanNumeral(input);
  if (parsedRoman !== undefined) {
    return parsedRoman;
  }
}

export class NumeralDict implements Dictionary {
  readonly info: DictInfo = LatinDict.Numeral;

  async getEntry(input: string): Promise<EntryResult[]> {
    const numeral = resolveNumeral(input);
    if (numeral === undefined) {
      return [];
    }
    return [buildEntryFor(numeral)];
  }

  async getEntryById(id: string): Promise<EntryResult | undefined> {
    if (!/^num\d+$/.test(id)) {
      return undefined;
    }
    return buildEntryFor(parseInt(id.substring(3)));
  }

  async getCompletions(_input: string): Promise<string[]> {
    // For now, don't handle autocompletions.
    return [];
  }
}
