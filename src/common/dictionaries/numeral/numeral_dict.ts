import { assertEqual, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import type { EntryResult } from "@/common/dictionaries/dict_result";
import type { DictInfo, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { XmlNode } from "@/common/xml/xml_node";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { parseRomanNumeral } from "@/morceus/numerals/roman_numerals";
import type { IrregularForm, Lemma, Stem } from "@/morceus/stem_parsing";

interface Numeral {
  arabic: number;
  ordinal?: string;
  cardinal?: string;
}
const ARABIC: keyof Numeral = "arabic";

type NumeralTypeTag =
  | "card"
  | "ord"
  | "distr"
  | "advnum"
  | "multipl"
  | "tempnum"
  | "partnum"
  | "othernum"
  | "proport";
const NUMERAL_TYPE_TAGS: Set<unknown> = new Set<NumeralTypeTag>([
  "card",
  "ord",
  "distr",
  "advnum",
  "multipl",
  "tempnum",
  "partnum",
  "othernum",
  "proport",
]);

function isNumeralTypeTag(tag: unknown): tag is NumeralTypeTag {
  return NUMERAL_TYPE_TAGS.has(tag);
}

function* allForms(lemma: Lemma): Generator<Stem | IrregularForm> {
  for (const form of lemma.stems ?? []) {
    yield form;
  }
  for (const form of lemma.irregularForms ?? []) {
    yield form;
  }
}

function numeralMatches(input: number, lemma: Lemma): boolean {
  const numeralTags = new Set(
    Array.from(allForms(lemma))
      .flatMap((form) => form?.tags ?? [])
      .filter((tag) => tag.startsWith("arabic"))
  );
  const target = `arabic${input}`;
  if (!numeralTags.has(target)) {
    return false;
  }

  // Check that every form has matches the expected numeral, and check that
  // there are no other numeral tags.
  assertEqual(numeralTags.size, 1);
  for (const form of allForms(lemma)) {
    assertEqual(form.tags?.includes(target), true);
  }
  return true;
}

function maybeFindNumeralData(input: number): Numeral {
  const lemmata = MorceusTables.CACHED.get().numerals;
  const matches = lemmata.filter((lemma) => numeralMatches(input, lemma));
  const lemmaByType = arrayMap<NumeralTypeTag, string>();
  for (const match of matches) {
    for (const form of allForms(match)) {
      const typeTags = form.tags?.filter(isNumeralTypeTag) ?? [];
      assertEqual(typeTags.length, 1, JSON.stringify(form.tags));
      const typeTag = typeTags[0];
      lemmaByType.add(typeTag, match.lemma);
    }
  }
  return {
    arabic: input,
    cardinal: checkPresent(lemmaByType.get("card")?.[0]),
    ordinal: checkPresent(lemmaByType.get("ord")?.[0]),
  };
}

function findNumeralData(input: number): Numeral {
  try {
    return maybeFindNumeralData(input);
  } catch {
    return { arabic: input };
  }
}

function entryContent(input: number): XmlNode {
  const data = findNumeralData(input);

  // @ts-ignore
  const rawKeys: (keyof Numeral)[] = Object.keys(data);
  const keys: (keyof Numeral)[] = [ARABIC].concat(
    rawKeys.filter((key) => key !== ARABIC).sort()
  );

  const rows: XmlNode[] = [];
  for (const key of keys) {
    const value = data[key];
    if (value === undefined) {
      continue;
    }
    const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
    rows.push(
      new XmlNode(
        "tr",
        [],
        [
          new XmlNode("td", [["class", "text md light"]], [displayKey]),
          new XmlNode("td", [], [value.toString()]),
        ]
      )
    );
  }

  return new XmlNode("table", [["class", "numeralTable"]], rows);
}

export function buildEntryFor(input: number): EntryResult {
  const key = `num${input}`;
  const content = entryContent(input);
  const resultXml = new XmlNode("div", [["id", key]], [content]);
  return {
    entry: resultXml,
    outline: {
      mainKey: input.toString(),
      mainSection: {
        text: `Numeral: ${input}`,
        level: 0,
        ordinal: "0",
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
