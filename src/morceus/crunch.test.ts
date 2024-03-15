import { crunchWord } from "@/morceus/crunch";
import type { Lemma, Stem } from "@/morceus/stem_parsing";
import type { EndIndexRow } from "@/morceus/tables/indices";

describe("crunch", () => {
  it("should be able to crunch simple words", () => {
    const stem: Stem = { pos: "no", stem: "morc", inflection: "us" };
    const endings: EndIndexRow[] = [{ ending: "o", tableNames: ["us"] }];
    const lemmata: Lemma[] = [{ lemma: "morcus", stems: [stem] }];

    const result = crunchWord(endings, lemmata, "morco");

    expect(result).toStrictEqual([{ lemma: "morcus", ending: "o", stem }]);
  });
});
