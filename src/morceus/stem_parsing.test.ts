import { parseStemFile } from "@/morceus/stem_parsing";

describe("parseStemFile", () => {
  const nom01 = parseStemFile("src/morceus/stems/nom.01");

  it("has expected lemmata", () => expect(nom01).toHaveLength(30));

  it("parses two row lemma", () => {
    const nullus = nom01.filter((s) => s.lemma === "nullus")[0];
    expect(nullus).toEqual({
      lemma: "nullus",

      stems: [{ stem: "nu_ll", pos: "aj", inflection: "us_ius_adj" }],
    });
  });

  it("parses multi row lemma", () => {
    const bonus = nom01.filter((s) => s.lemma === "bonus")[0];
    expect(bonus).toEqual({
      lemma: "bonus",
      stems: [
        { stem: "bon", inflection: "us_a_um", pos: "aj", other: "no_comp" },
        { stem: "mel", pos: "aj", inflection: "ior_ius_comp" },
        {
          stem: "optim",
          pos: "aj",
          inflection: "us_a_um",
          other: "irreg_superl",
        },
      ],
    });
  });
});
