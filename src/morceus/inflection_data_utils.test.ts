import {
  convertUpos,
  packWordInflectionData,
  unpackWordInflectionData,
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

describe("packWordInflectionData and unpackWordInflectionData", () => {
  it("should be inverses for empty data", () => {
    const data = {};
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });

  it("should be inverses for single-valued fields", () => {
    const data = {
      number: LatinNumber.Singular,
      person: LatinPerson.FIRST,
      voice: LatinVoice.Active,
      degree: LatinDegree.Positive,
      tense: LatinTense.Present,
      mood: LatinMood.Indicative,
    };
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });

  it("should be inverses for single case", () => {
    const data = {
      case: LatinCase.Nominative,
      number: LatinNumber.Singular,
    };
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });

  it("should be inverses for multiple cases", () => {
    const data = {
      case: [LatinCase.Nominative, LatinCase.Accusative, LatinCase.Vocative],
      number: LatinNumber.Plural,
    };
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });

  it("should be inverses for single gender", () => {
    const data = {
      gender: LatinGender.Masculine,
      case: LatinCase.Genitive,
    };
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });

  it("should be inverses for multiple genders", () => {
    const data = {
      gender: [LatinGender.Masculine, LatinGender.Feminine],
      number: LatinNumber.Singular,
    };
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });

  it("should be inverses for all fields populated", () => {
    const data = {
      case: [LatinCase.Dative, LatinCase.Ablative],
      gender: [LatinGender.Masculine, LatinGender.Neuter],
      number: LatinNumber.Plural,
      person: LatinPerson.THIRD,
      voice: LatinVoice.Passive,
      degree: LatinDegree.Comparative,
      tense: LatinTense.Imperfect,
      mood: LatinMood.Subjunctive,
    };
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });

  it("should be inverses for all tense values", () => {
    const tenses = [
      LatinTense.Present,
      LatinTense.Imperfect,
      LatinTense.Future,
      LatinTense.Perfect,
      LatinTense.Pluperfect,
      LatinTense.FuturePerfect,
    ];
    for (const tense of tenses) {
      const data = { tense };
      const packed = packWordInflectionData(data);
      const unpacked = unpackWordInflectionData(packed);
      expect(unpacked).toEqual(data);
    }
  });

  it("should be inverses for all mood values", () => {
    const moods = [
      LatinMood.Indicative,
      LatinMood.Subjunctive,
      LatinMood.Imperative,
      LatinMood.Infinitive,
      LatinMood.Participle,
      LatinMood.Gerundive,
      LatinMood.Supine,
    ];
    for (const mood of moods) {
      const data = { mood };
      const packed = packWordInflectionData(data);
      const unpacked = unpackWordInflectionData(packed);
      expect(unpacked).toEqual(data);
    }
  });

  it("should be inverses for all case combinations", () => {
    const cases = [
      LatinCase.Nominative,
      LatinCase.Vocative,
      LatinCase.Accusative,
      LatinCase.Genitive,
      LatinCase.Dative,
      LatinCase.Ablative,
      LatinCase.Locative,
    ];
    for (const c of cases) {
      const data = { case: c };
      const packed = packWordInflectionData(data);
      const unpacked = unpackWordInflectionData(packed);
      expect(unpacked).toEqual(data);
    }
  });

  it("should be inverses for all gender combinations", () => {
    const genders = [
      LatinGender.Masculine,
      LatinGender.Feminine,
      LatinGender.Neuter,
      LatinGender.Adverbial,
    ];
    for (const g of genders) {
      const data = { gender: g };
      const packed = packWordInflectionData(data);
      const unpacked = unpackWordInflectionData(packed);
      expect(unpacked).toEqual(data);
    }
  });

  it("should produce valid 32-bit unsigned integers", () => {
    const data = {
      case: [LatinCase.Nominative, LatinCase.Accusative],
      gender: [LatinGender.Masculine, LatinGender.Feminine, LatinGender.Neuter],
      number: LatinNumber.Plural,
      person: LatinPerson.SECOND,
      voice: LatinVoice.Active,
      tense: LatinTense.Perfect,
      mood: LatinMood.Participle,
    };
    const packed = packWordInflectionData(data);
    expect(Number.isInteger(packed)).toBe(true);
    expect(packed).toBeGreaterThanOrEqual(0);
    expect(packed).toBeLessThanOrEqual(0xffffffff);
  });

  it("should throw error when trying to pack multi-valued non-repeated fields", () => {
    expect(() => {
      packWordInflectionData({
        number: [LatinNumber.Singular, LatinNumber.Plural],
      });
    }).toThrow(/Expected single value but got array/);

    expect(() => {
      packWordInflectionData({
        person: [LatinPerson.FIRST, LatinPerson.SECOND],
      });
    }).toThrow(/Expected single value but got array/);
  });

  it("should handle participle with all gender/case combinations", () => {
    const data = {
      mood: LatinMood.Participle,
      tense: LatinTense.Present,
      voice: LatinVoice.Active,
      case: [LatinCase.Nominative, LatinCase.Vocative],
      gender: [LatinGender.Masculine, LatinGender.Feminine],
      number: LatinNumber.Singular,
    };
    const packed = packWordInflectionData(data);
    const unpacked = unpackWordInflectionData(packed);
    expect(unpacked).toEqual(data);
  });
});
