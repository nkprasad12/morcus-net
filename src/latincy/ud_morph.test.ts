import { wordInflectionDataToUd } from "@/latincy/ud_morph";
import {
  compareGrammaticalData,
  convertUpos,
} from "@/morceus/inflection_data_utils";
import {
  LatinCase,
  LatinDegree,
  LatinGender,
  LatinMood,
  LatinNumber,
  LatinPerson,
  LatinTense,
  LatinVoice,
  type WordInflectionData,
} from "@/morceus/types";

describe("wordInflectionDataToUd", () => {
  it("returns an empty string for empty data", () => {
    expect(wordInflectionDataToUd({})).toBe("");
  });

  it("emits features in alphabetical key order", () => {
    expect(
      wordInflectionDataToUd({
        voice: LatinVoice.Active,
        tense: LatinTense.Imperfect,
        mood: LatinMood.Indicative,
        person: LatinPerson.THIRD,
        number: LatinNumber.Singular,
      })
    ).toBe("Aspect=Imp|Mood=Ind|Number=Sing|Person=3|Tense=Past|Voice=Act");
  });

  it("uses the first value of multi-valued fields", () => {
    expect(
      wordInflectionDataToUd({
        case: [LatinCase.Ablative, LatinCase.Dative],
        gender: [LatinGender.Feminine, LatinGender.Masculine],
        number: LatinNumber.Plural,
      })
    ).toBe("Case=Abl|Gender=Fem|Number=Plur");
  });

  const roundTrips: WordInflectionData[] = [
    { case: LatinCase.Nominative, number: LatinNumber.Singular },
    {
      case: LatinCase.Accusative,
      number: LatinNumber.Plural,
      gender: LatinGender.Masculine,
    },
    { case: LatinCase.Genitive, gender: LatinGender.Feminine },
    { case: LatinCase.Dative, gender: LatinGender.Neuter },
    { case: LatinCase.Ablative, degree: LatinDegree.Comparative },
    { case: LatinCase.Vocative, degree: LatinDegree.Superlative },
    { case: LatinCase.Locative, degree: LatinDegree.Positive },
    {
      person: LatinPerson.FIRST,
      number: LatinNumber.Singular,
      tense: LatinTense.Present,
      mood: LatinMood.Indicative,
      voice: LatinVoice.Active,
    },
    {
      person: LatinPerson.SECOND,
      number: LatinNumber.Plural,
      tense: LatinTense.Imperfect,
      mood: LatinMood.Subjunctive,
      voice: LatinVoice.Passive,
    },
    {
      person: LatinPerson.THIRD,
      tense: LatinTense.Pluperfect,
      mood: LatinMood.Indicative,
    },
    { tense: LatinTense.Future, mood: LatinMood.Imperative },
    {
      tense: LatinTense.Present,
      mood: LatinMood.Participle,
      case: LatinCase.Nominative,
    },
    { mood: LatinMood.Gerundive, case: LatinCase.Accusative },
    { mood: LatinMood.Infinitive, voice: LatinVoice.Passive },
    { mood: LatinMood.Supine, case: LatinCase.Ablative },
  ];

  it.each(roundTrips)("round-trips through convertUpos: %o", (data) => {
    expect(convertUpos(wordInflectionDataToUd(data))).toEqual(data);
  });

  it.each([
    [{ tense: LatinTense.Perfect, mood: LatinMood.Indicative }],
    [{ tense: LatinTense.FuturePerfect, voice: LatinVoice.Active }],
    [{ gender: LatinGender.Adverbial, degree: LatinDegree.Positive }],
  ])(
    "drops values convertUpos can't express without contradicting them: %o",
    (data: WordInflectionData) => {
      const parsed = convertUpos(wordInflectionDataToUd(data));
      expect(compareGrammaticalData(parsed, data)).toBe(-1);
    }
  );
});
