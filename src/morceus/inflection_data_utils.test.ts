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
