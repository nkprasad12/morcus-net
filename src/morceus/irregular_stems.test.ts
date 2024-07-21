import {
  parseEntries,
  processIrregEntry,
  processNomIrregEntries2,
} from "@/morceus/irregular_stems";
import type { IrregularLemma } from "@/morceus/stem_parsing";
import {
  LatinCase,
  LatinGender,
  LatinMood,
  LatinNumber,
  LatinPerson,
  LatinTense,
  LatinVoice,
} from "@/morceus/types";
import fs from "fs";

console.debug = jest.fn();
console.log = jest.fn();

const TEMP_FILE = "irregular_stems.test.ts.tmp.txt";

const SAMPLE_NOM_FILE = `:le:dehinc
:wd:dehinc	adverb

#:le:unus
#:wd:u_nusquisque	us_a_um	masc nom sg
#:wd:u_naquaeque	us_a_um	fem nom sg

:le:mos
mo_s		irreg_nom3	masc nom voc sg
#Really hoc_ine
mo_r@decl3	irreg_nom3	masc


:le:falx
:no:fal		x_cis fem
:le:multus
plu_s	irreg_adj3 nom/acc sg irreg_comp
plu_r@decl3 irreg_adj3 neut gen sg irreg_comp

`;

const DEHINC = `:le:dehinc
:wd:dehinc	adverb`;

const FALX = `:le:falx
:no:fal		x_cis fem`;

const CERES = `:le:Ceres
Cere_s		irreg_nom3 fem nom sg
Cere^r@decl3	irreg_nom3 fem sg`;

const COR = `:le:cor
cor	neut nom voc acc sg irreg_nom3
cord@decl3	irreg_nom3 neut	
:wd:cordium	irreg_nom3 neut gen pl`;

const MATURUS = `:le:maturus
:aj:ma_tu_rrim	us_a_um irreg_superl`;

const ALIUS2 = `:le:alius#2
:wd:alius irreg_nom2 masc nom sg
:wd:aliud irreg_nom2 neut nom acc sg
:wd:ali_us irreg_nom2 masc fem neut gen sg
ali@ille irreg_nom2`;

const INTERROG = `:le:ecquis
:wd:ecquis	interrog masc fem nom sg
ec@quis	interrog`;

const MOS = `:le:mos
mo_s		irreg_nom3	masc nom voc sg
mo_r@decl3	irreg_nom3	masc`;

const MULTUS = `:le:multus
plu_s	irreg_adj3 nom/acc sg irreg_comp
plu_r@decl3 irreg_adj3 neut gen sg irreg_comp`;

const AIO = `:le:aio
ajo_	irreg_pp1 1st sg pres ind act
aje_@imperf	irreg_pp1 ind act imperf`;

const EO1 = `:le:eo#1
:vs:i_v		perfstem
:vs:it		pp4 supine`;

const DO = `:le:do
:vb:da^ri_	irreg_pp1 pres inf pass
dui@basvb2	irreg_pp1 pres subj act early
:vs:de^d perfstem no_comp`;

describe("processIrregEntry on verb file", () => {
  it("handles template", () => {
    const lemma = processIrregEntry(AIO.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "aio",
      regularForms: [
        {
          stem: "aje_",
          template: "imperf",
          grammaticalData: {
            mood: LatinMood.Indicative,
            voice: LatinVoice.Active,
            tense: LatinTense.Imperfect,
          },
          internalTags: ["irreg_pp1"],
        },
      ],
      irregularForms: [
        {
          form: "ajo_",
          grammaticalData: {
            mood: LatinMood.Indicative,
            voice: LatinVoice.Active,
            tense: LatinTense.Present,
            person: LatinPerson.FIRST,
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_pp1"],
        },
      ],
    });
  });

  it("handles multiple verb stems", () => {
    const lemma = processIrregEntry(EO1.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "eo#1",
      regularForms: [
        {
          code: "vs",
          stem: "i_v",
          template: "perfstem",
          grammaticalData: {},
        },
        {
          code: "vs",
          stem: "it",
          template: "pp4",
          grammaticalData: {
            mood: LatinMood.Supine,
          },
        },
      ],
    });
  });

  it("handles explicit vb", () => {
    const lemma = processIrregEntry(DO.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "do",
      regularForms: [
        {
          stem: "dui",
          template: "basvb2",
          grammaticalData: {
            tense: LatinTense.Present,
            mood: LatinMood.Subjunctive,
            voice: LatinVoice.Active,
          },
          internalTags: ["irreg_pp1"],
          tags: ["early"],
        },
        {
          code: "vs",
          stem: "de^d",
          template: "perfstem",
          grammaticalData: {},
          internalTags: ["no_comp"],
        },
      ],
      irregularForms: [
        {
          code: "vb",
          form: "da^ri_",
          grammaticalData: {
            tense: LatinTense.Present,
            mood: LatinMood.Infinitive,
            voice: LatinVoice.Passive,
          },
          internalTags: ["irreg_pp1"],
        },
      ],
    });
  });
});

describe("processIrregEntry on nominals", () => {
  it("handles adverb", () => {
    const lemma = processIrregEntry(DEHINC.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "dehinc",
      irregularForms: [
        {
          code: "wd",
          form: "dehinc",
          grammaticalData: {},
          internalTags: ["adverb"],
        },
      ],
    });
  });

  it("handles :no: entry", () => {
    const lemma = processIrregEntry(FALX.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "falx",
      regularForms: [
        {
          code: "no",
          stem: "fal",
          template: "x_cis",
          grammaticalData: { gender: LatinGender.Feminine },
        },
      ],
    });
  });

  it("handles templates plus word", () => {
    const lemma = processIrregEntry(CERES.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "Ceres",
      irregularForms: [
        {
          form: "Cere_s",
          grammaticalData: {
            case: LatinCase.Nominative,
            gender: LatinGender.Feminine,
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_nom3"],
        },
      ],
      regularForms: [
        {
          stem: "Cere^r",
          template: "decl3",
          grammaticalData: {
            gender: LatinGender.Feminine,
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_nom3"],
        },
      ],
    });
  });

  it("handles mixed marked and unmarked word", () => {
    const lemma = processIrregEntry(COR.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "cor",
      irregularForms: [
        {
          form: "cor",
          grammaticalData: {
            case: [
              LatinCase.Nominative,
              LatinCase.Vocative,
              LatinCase.Accusative,
            ],
            gender: LatinGender.Neuter,
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_nom3"],
        },
        {
          code: "wd",
          form: "cordium",
          grammaticalData: {
            case: LatinCase.Genitive,
            gender: LatinGender.Neuter,
            number: LatinNumber.Plural,
          },
          internalTags: ["irreg_nom3"],
        },
      ],
      regularForms: [
        {
          stem: "cord",
          template: "decl3",
          grammaticalData: {
            gender: LatinGender.Neuter,
          },
          internalTags: ["irreg_nom3"],
        },
      ],
    });
  });

  it("handles adjective with tab", () => {
    const lemma = processIrregEntry(MATURUS.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "maturus",
      regularForms: [
        {
          code: "aj",
          stem: "ma_tu_rrim",
          template: "us_a_um",
          grammaticalData: {},
          internalTags: ["irreg_superl"],
        },
      ],
    });
  });

  it("handles adjective without tab", () => {
    const lemma = processIrregEntry(MULTUS.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "multus",
      irregularForms: [
        {
          form: "plu_s",
          grammaticalData: {
            case: [LatinCase.Nominative, LatinCase.Accusative],
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_adj3", "irreg_comp"],
        },
      ],
      regularForms: [
        {
          stem: "plu_r",
          template: "decl3",
          grammaticalData: {
            case: LatinCase.Genitive,
            number: LatinNumber.Singular,
            gender: LatinGender.Neuter,
          },
          internalTags: ["irreg_adj3", "irreg_comp"],
        },
      ],
    });
  });

  // TODO: Re-enable this once migration is fixed.
  it("handles alius2 edge case", () => {
    const lemma = processIrregEntry(ALIUS2.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "alius#2",
      irregularForms: [
        {
          code: "wd",
          form: "alius",
          grammaticalData: {
            gender: LatinGender.Masculine,
            case: LatinCase.Nominative,
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_nom2"],
        },
        {
          code: "wd",
          form: "aliud",
          grammaticalData: {
            gender: LatinGender.Neuter,
            case: [LatinCase.Nominative, LatinCase.Accusative],
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_nom2"],
        },
        {
          code: "wd",
          form: "ali_us",
          grammaticalData: {
            gender: [
              LatinGender.Masculine,
              LatinGender.Feminine,
              LatinGender.Neuter,
            ],
            case: LatinCase.Genitive,
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_nom2"],
        },
      ],
      regularForms: [
        {
          stem: "ali",
          template: "ille",
          grammaticalData: {},
          internalTags: ["irreg_nom2"],
        },
      ],
    });
  });

  it("handles interrog edge case", () => {
    const lemma = processIrregEntry(INTERROG.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "ecquis",
      irregularForms: [
        {
          code: "wd",
          form: "ecquis",
          grammaticalData: {
            gender: [LatinGender.Masculine, LatinGender.Feminine],
            case: LatinCase.Nominative,
            number: LatinNumber.Singular,
          },
          tags: ["interrog"],
        },
      ],
      regularForms: [
        {
          stem: "ec",
          template: "quis",
          grammaticalData: {},
          tags: ["interrog"],
        },
      ],
    });
  });

  it("handles extra tabs", () => {
    const lemma = processIrregEntry(MOS.split("\n"));
    expect(lemma).toEqual<IrregularLemma>({
      lemma: "mos",
      irregularForms: [
        {
          form: "mo_s",
          grammaticalData: {
            gender: LatinGender.Masculine,
            case: [LatinCase.Nominative, LatinCase.Vocative],
            number: LatinNumber.Singular,
          },
          internalTags: ["irreg_nom3"],
        },
      ],
      regularForms: [
        {
          stem: "mo_r",
          template: "decl3",
          grammaticalData: {
            gender: LatinGender.Masculine,
          },
          internalTags: ["irreg_nom3"],
        },
      ],
    });
  });
});

describe("parsing", () => {
  beforeEach(() => {
    fs.writeFileSync(TEMP_FILE, SAMPLE_NOM_FILE);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(TEMP_FILE);
    } catch {}
  });

  it("handles parsing edge cases", () => {
    const entries = parseEntries(TEMP_FILE);

    // We shouldn't see the commented out entry
    expect(entries).toHaveLength(4);
    // We handle the happy path
    expect(entries[0]).toEqual(DEHINC.split("\n"));
    // We handle comments within a lemma
    expect(entries[1]).toEqual(MOS.split("\n"));
    // We handle two lines between lemmata
    expect(entries[2]).toEqual(FALX.split("\n"));
    // We handle two lemmata next to each other without an empty line
    expect(entries[3]).toEqual(MULTUS.split("\n"));
  });

  it("handles processing and parsing", () => {
    const lemmata = processNomIrregEntries2(TEMP_FILE);

    expect(lemmata).toHaveLength(4);
    expect(lemmata[0].lemma).toEqual("dehinc");
    expect(lemmata[1].lemma).toEqual("mos");
    expect(lemmata[2].lemma).toEqual("falx");
    expect(lemmata[3].lemma).toEqual("multus");
  });
});
