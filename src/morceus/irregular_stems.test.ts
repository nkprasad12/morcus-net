import {
  parseEntries,
  processNomEntry,
  processNomIrregEntries,
  processVerbEntry,
} from "@/morceus/irregular_stems";
import type { Lemma } from "@/morceus/stem_parsing";
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

describe("processVerbEntry", () => {
  it("handles template", () => {
    const lemma = processVerbEntry(AIO.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "aio",
      stems: [
        {
          pos: "vb",
          stem: "ajo_",
          inflection: "N/A",
          other: "irreg_pp1 1st sg pres ind act",
        },
        {
          pos: "vs",
          stem: "aje_",
          inflection: "imperf",
          other: "irreg_pp1 ind act imperf",
        },
      ],
    });
  });

  it("handles multiple verb stems", () => {
    const lemma = processVerbEntry(EO1.split("\n"));
    expect(lemma).toEqual<Lemma>({
      lemma: "eo#1",
      stems: [
        {
          pos: "vs",
          stem: "i_v",
          inflection: "perfstem",
        },
        {
          pos: "vs",
          stem: "it",
          inflection: "pp4",
          other: "supine",
        },
      ],
    });
  });

  it("handles explicit vb", () => {
    const lemma = processVerbEntry(DO.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "do",
      stems: [
        {
          pos: "vb",
          stem: "da^ri_",
          inflection: "N/A",
          other: "irreg_pp1 pres inf pass",
        },
        {
          pos: "vs",
          stem: "dui",
          inflection: "basvb2",
          other: "irreg_pp1 pres subj act early",
        },
        {
          pos: "vs",
          stem: "de^d",
          inflection: "perfstem",
          other: "no_comp",
        },
      ],
    });
  });
});

describe("processNomEntry", () => {
  it("handles adverb", () => {
    const lemma = processNomEntry(DEHINC.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "dehinc",
      stems: [
        {
          pos: "wd",
          stem: "dehinc",
          inflection: "N/A",
          other: "adverb",
        },
      ],
    });
  });

  it("handles :no: entry", () => {
    const lemma = processNomEntry(FALX.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "falx",
      stems: [
        {
          pos: "no",
          stem: "fal",
          inflection: "x_cis",
          other: "fem",
        },
      ],
    });
  });

  it("handles templates plus word", () => {
    const lemma = processNomEntry(CERES.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "Ceres",
      stems: [
        {
          pos: "wd",
          stem: "Cere_s",
          inflection: "N/A",
          other: "irreg_nom3 fem nom sg",
        },
        {
          pos: "no",
          stem: "Cere^r",
          inflection: "decl3",
          other: "irreg_nom3 fem sg",
        },
      ],
    });
  });

  it("handles mixed marked and unmarked word", () => {
    const lemma = processNomEntry(COR.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "cor",
      stems: [
        {
          pos: "wd",
          stem: "cor",
          inflection: "N/A",
          other: "neut nom voc acc sg irreg_nom3",
        },
        {
          pos: "no",
          stem: "cord",
          inflection: "decl3",
          other: "irreg_nom3 neut",
        },
        {
          pos: "wd",
          stem: "cordium",
          inflection: "N/A",
          other: "irreg_nom3 neut gen pl",
        },
      ],
    });
  });

  it("handles adjective without :adj:", () => {
    const lemma = processNomEntry(MATURUS.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "maturus",
      stems: [
        {
          pos: "aj",
          stem: "ma_tu_rrim",
          inflection: "us_a_um",
          other: "irreg_superl",
        },
      ],
    });
  });

  it("handles adjective with tab", () => {
    const lemma = processNomEntry(MATURUS.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "maturus",
      stems: [
        {
          pos: "aj",
          stem: "ma_tu_rrim",
          inflection: "us_a_um",
          other: "irreg_superl",
        },
      ],
    });
  });

  it("handles adjective without tab", () => {
    const lemma = processNomEntry(MULTUS.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "multus",
      stems: [
        {
          pos: "wd",
          stem: "plu_s",
          inflection: "N/A",
          other: "irreg_adj3 nom/acc sg irreg_comp",
        },
        {
          pos: "aj",
          stem: "plu_r",
          inflection: "decl3",
          other: "irreg_adj3 neut gen sg irreg_comp",
        },
      ],
    });
  });

  it("handles alius2 edge case", () => {
    const lemma = processNomEntry(ALIUS2.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "alius#2",
      stems: [
        {
          pos: "wd",
          stem: "alius",
          inflection: "N/A",
          other: "irreg_nom2 masc nom sg",
        },
        {
          pos: "wd",
          stem: "aliud",
          inflection: "N/A",
          other: "irreg_nom2 neut nom acc sg",
        },
        {
          pos: "wd",
          stem: "ali_us",
          inflection: "N/A",
          other: "irreg_nom2 masc fem neut gen sg",
        },
        {
          pos: "no",
          stem: "ali",
          inflection: "ille",
          other: "irreg_nom2",
        },
      ],
    });
  });

  it("handles interrog edge case", () => {
    const lemma = processNomEntry(INTERROG.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "ecquis",
      stems: [
        {
          pos: "wd",
          stem: "ecquis",
          inflection: "N/A",
          other: "interrog masc fem nom sg",
        },
        {
          pos: "interrog",
          stem: "ec",
          inflection: "quis",
          other: "interrog",
        },
      ],
    });
  });

  it("handles extra tabs", () => {
    const lemma = processNomEntry(MOS.split("\n"));
    expect(lemma).toStrictEqual<Lemma>({
      lemma: "mos",
      stems: [
        {
          pos: "wd",
          stem: "mo_s",
          inflection: "N/A",
          other: "irreg_nom3 masc nom voc sg",
        },
        {
          pos: "no",
          stem: "mo_r",
          inflection: "decl3",
          other: "irreg_nom3 masc",
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
    const lemmata = processNomIrregEntries(TEMP_FILE);

    expect(lemmata).toHaveLength(4);
    expect(lemmata[0].lemma).toEqual("dehinc");
    expect(lemmata[1].lemma).toEqual("mos");
    expect(lemmata[2].lemma).toEqual("falx");
    expect(lemmata[3].lemma).toEqual("multus");
  });
});
