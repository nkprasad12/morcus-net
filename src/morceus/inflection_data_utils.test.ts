import { convertUpos } from "@/morceus/inflection_data_utils";
import {
  LatinCase,
  LatinDegree,
  LatinGender,
  LatinMood,
  LatinNumber,
  LatinPerson,
  LatinTense,
  LatinVoice,
} from "@/morceus/types";

describe("convertUpos", () => {
  it("should convert a simple UPOS tag", () => {
    const result = convertUpos("Case=Nom|Number=Sing");
    expect(result).toEqual({
      case: LatinCase.Nominative,
      number: LatinNumber.Singular,
    });
  });

  it("should handle multiple grammatical features", () => {
    const result = convertUpos(
      "Case=Acc|Number=Plur|Gender=Masc|Person=3|Voice=Pass|Mood=Ind"
    );
    expect(result).toEqual({
      case: LatinCase.Accusative,
      number: LatinNumber.Plural,
      gender: LatinGender.Masculine,
      person: LatinPerson.THIRD,
      voice: LatinVoice.Passive,
      mood: LatinMood.Indicative,
    });
  });

  it("should handle error for unknown values", () => {
    expect(() => convertUpos("Number=Dual")).toThrow();
    expect(() => convertUpos("Person=4")).toThrow();
    expect(() => convertUpos("Voice=Med")).toThrow();
    expect(() => convertUpos("Case=Adl")).toThrow();
    expect(() => convertUpos("Tense=WoahDude")).toThrow();
    expect(() => convertUpos("Degree=Inf")).toThrow();
  });

  it("should accept gerundive from either verb form or mood", () => {
    expect(convertUpos("VerbForm=Gdv").mood).toEqual(LatinMood.Gerundive);
    expect(convertUpos("Mood=Gdv").mood).toEqual(LatinMood.Gerundive);
  });

  it("should handle tense correctly", () => {
    expect(convertUpos("Tense=Pres|Mood=Ind").tense).toBe(LatinTense.Present);
    expect(convertUpos("Tense=Imp|Mood=Ind").tense).toBe(undefined);
  });

  it("should handle verb forms correctly", () => {
    expect(convertUpos("VerbForm=Part").mood).toBe(LatinMood.Participle);
    expect(convertUpos("VerbForm=Fin")).toStrictEqual({});
  });

  it("should handle different degrees", () => {
    const positive = convertUpos("Degree=Pos");
    const comparative = convertUpos("Degree=Cmp");
    const superlative = convertUpos("Degree=Sup");

    expect(positive.degree).toBe(LatinDegree.Positive);
    expect(comparative.degree).toBe(LatinDegree.Comparative);
    expect(superlative.degree).toBe(LatinDegree.Superlative);
  });

  it("should handle empty or whitespace input", () => {
    expect(convertUpos("")).toEqual({});
    expect(convertUpos("  ")).toEqual({});
  });

  it("should ignore malformed tag parts without key-value structure", () => {
    const result = convertUpos("Case=Nom|BadPart|Number=Sing");
    expect(result).toEqual({
      case: LatinCase.Nominative,
      number: LatinNumber.Singular,
    });
  });

  it("pipes cases as expected", () => {
    expect(convertUpos("Case=Nom").case).toEqual(LatinCase.Nominative);
    expect(convertUpos("Case=Voc").case).toEqual(LatinCase.Vocative);
    expect(convertUpos("Case=Acc").case).toEqual(LatinCase.Accusative);
    expect(convertUpos("Case=Gen").case).toEqual(LatinCase.Genitive);
    expect(convertUpos("Case=Dat").case).toEqual(LatinCase.Dative);
    expect(convertUpos("Case=Abl").case).toEqual(LatinCase.Ablative);
    expect(convertUpos("Case=Loc").case).toEqual(LatinCase.Locative);
  });

  it("pipes numbers as expected", () => {
    expect(convertUpos("Number=Sing").number).toEqual(LatinNumber.Singular);
    expect(convertUpos("Number=Plur").number).toEqual(LatinNumber.Plural);
  });

  it("pipes person  as expected", () => {
    expect(convertUpos("Person=1").person).toEqual(LatinPerson.FIRST);
    expect(convertUpos("Person=2").person).toEqual(LatinPerson.SECOND);
    expect(convertUpos("Person=3").person).toEqual(LatinPerson.THIRD);
  });

  it("pipes voice as expected", () => {
    expect(convertUpos("Voice=Act").voice).toEqual(LatinVoice.Active);
    expect(convertUpos("Voice=Pass").voice).toEqual(LatinVoice.Passive);
  });

  it("pipes mood as expected", () => {
    expect(convertUpos("Mood=Ind").mood).toEqual(LatinMood.Indicative);
    expect(convertUpos("Mood=Sub").mood).toEqual(LatinMood.Subjunctive);
    expect(convertUpos("Mood=Imp").mood).toEqual(LatinMood.Imperative);
  });

  it("pipes tense as expected", () => {
    expect(convertUpos("Tense=Pres").tense).toEqual(LatinTense.Present);
    expect(convertUpos("Tense=Fut").tense).toEqual(LatinTense.Future);
    expect(convertUpos("Tense=Pqp").tense).toEqual(LatinTense.Pluperfect);

    // These aspectual ones should be covered by aspect. Need to see how
    // LatinCy handles these.
    expect(convertUpos("Tense=Ftp").tense).toBeUndefined();
    expect(convertUpos("Tense=Imp").tense).toBeUndefined();
    expect(convertUpos("Tense=Perf").tense).toBeUndefined();
  });

  it("pipes verb form as expected", () => {
    expect(convertUpos("VerbForm=Inf").mood).toBe(LatinMood.Infinitive);
    expect(convertUpos("VerbForm=Part").mood).toEqual(LatinMood.Participle);
    expect(convertUpos("VerbForm=Sup").mood).toEqual(LatinMood.Supine);
  });

  it("should throw error for unrecognized keys", () => {
    expect(() => convertUpos("UnknownKey=Value")).toThrow(/Unrecognized key/);
  });

  it("should throw error for unrecognized values in known keys", () => {
    expect(() => convertUpos("Case=Unknown")).toThrow(
      /Unrecognized value.*for key "Case"/
    );
    expect(() => convertUpos("Mood=Unknown")).toThrow(
      /Unrecognized value.*for key "Mood"/
    );
    expect(() => convertUpos("Gender=Unknown")).toThrow(
      /Unrecognized value.*for key "Gender"/
    );
  });

  it("should trim input strings", () => {
    const result = convertUpos("  Case=Nom| Number=Sing  ");
    expect(result).toEqual({
      case: LatinCase.Nominative,
      number: LatinNumber.Singular,
    });
  });
});
