import { MorceusCruncher, crunchWord } from "@/morceus/crunch";
import type { Lemma, Stem } from "@/morceus/stem_parsing";
import type { EndIndexRow, InflectionLookup } from "@/morceus/tables/indices";

describe("crunchWord", () => {
  it("should be able to crunch simple words", () => {
    const stem: Stem = { pos: "no", stem: "morc", inflection: "us" };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "morcus", stems: [stem] }];

    const result = crunchWord(endings, lemmata, "morco");

    expect(result).toStrictEqual([{ lemma: "morcus", ending: "o", stem }]);
  });
});

describe("MorceusCruncher", () => {
  it("handles simple case with one option", () => {
    const stem: Stem = { pos: "no", stem: "morc", inflection: "us" };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "morcus", stems: [stem] }];
    const lookup: InflectionLookup = new Map([
      [
        "us",
        new Map([
          [
            "o",
            [{ ending: "o", grammaticalData: ["ablative"], tags: ["archaic"] }],
          ],
        ]),
      ],
    ]);

    const cruncher = MorceusCruncher.make([endings, lookup], lemmata);
    const result = cruncher("morco");

    expect(result).toStrictEqual([
      {
        lemma: "morcus",
        inflectedForms: [
          {
            form: "morco",
            inflectionData: [{ inflection: "ablative", usageNote: "archaic" }],
          },
        ],
      },
    ]);
  });
});
