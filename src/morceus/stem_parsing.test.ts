import { toInflectionData } from "@/morceus/inflection_data_utils";
import {
  parseNounStemFile,
  parseVerbStemFile,
  type Lemma,
} from "@/morceus/stem_parsing";

describe("parseNounStemFile", () => {
  const nom01 = parseNounStemFile("src/morceus/stems/nom.01");

  it("has expected lemmata", () => expect(nom01).toHaveLength(30));

  it("parses two row lemma", () => {
    const nullus = nom01.find((s) => s.lemma === "nullus");
    expect(nullus).toEqual({
      lemma: "nullus",

      stems: [
        {
          stem: "nu_ll",
          code: "aj",
          inflection: "us_ius_adj",
          ...toInflectionData([]),
        },
      ],
    });
  });

  it("parses multi row lemma", () => {
    const bonus = nom01.find((s) => s.lemma === "bonus");
    expect(bonus).toEqual({
      lemma: "bonus",
      stems: [
        {
          stem: "bon",
          inflection: "us_a_um",
          code: "aj",
          ...toInflectionData("no_comp".split(" ")),
        },
        {
          stem: "mel",
          code: "aj",
          inflection: "ior_ius_comp",
          ...toInflectionData([]),
        },
        {
          stem: "optim",
          code: "aj",
          inflection: "us_a_um",
          ...toInflectionData("irreg_superl".split(" ")),
        },
      ],
    });
  });
});

describe("parseVerbStemFile", () => {
  const verbs = parseVerbStemFile(
    "src/morceus/testdata/stemlib/Latin/stemsrc/vbs.latin"
  );

  it("has expected lemmata", () => expect(verbs).toHaveLength(6));

  it("parses line split lemma", () => {
    const acclamo = verbs.find((s) => s.lemma === "acclamo");
    expect(acclamo).toEqual<Lemma>({
      lemma: "acclamo",
      isVerb: true,
      stems: [
        {
          stem: "ac-cla_m",
          code: "de",
          inflection: "are_vb",
          ...toInflectionData([]),
        },
      ],
    });
  });

  it("parses vb lemma", () => {
    const caveo = verbs.find((s) => s.lemma === "caveo");
    expect(caveo).toEqual<Lemma>({
      lemma: "caveo",
      isVerb: true,
      stems: [
        {
          stem: "ca^v",
          inflection: "conj2",
          code: "vs",
          ...toInflectionData([]),
        },
      ],
      irregularForms: [
        {
          form: "ca^ve^",
          code: "vb",
          ...toInflectionData("2nd sg pres imperat act irreg_pp1".split(" ")),
        },
      ],
    });
  });
});
