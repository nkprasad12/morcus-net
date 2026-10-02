/**
 * @fileoverview Serializes inflection data as UD-style morphological features.
 * This is the inverse of `convertUpos` in `src/morceus/inflection_data_utils.ts`;
 * the round-trip test in `ud_morph.test.ts` keeps the two in sync.
 */

import {
  LatinCase,
  LatinDegree,
  LatinGender,
  LatinMood,
  LatinNumber,
  LatinTense,
  LatinVoice,
  type WordInflectionData,
} from "@/morceus/types";

function firstValue<T>(field: T | T[] | undefined): T | undefined {
  return Array.isArray(field) ? field[0] : field;
}

const UD_CASES: Record<LatinCase, string> = {
  [LatinCase.Nominative]: "Nom",
  [LatinCase.Accusative]: "Acc",
  [LatinCase.Dative]: "Dat",
  [LatinCase.Genitive]: "Gen",
  [LatinCase.Ablative]: "Abl",
  [LatinCase.Vocative]: "Voc",
  [LatinCase.Locative]: "Loc",
};

const UD_DEGREES: Record<LatinDegree, string> = {
  [LatinDegree.Positive]: "Pos",
  [LatinDegree.Comparative]: "Cmp",
  [LatinDegree.Superlative]: "Sup",
};

const UD_GENDERS: Partial<Record<LatinGender, string>> = {
  [LatinGender.Masculine]: "Masc",
  [LatinGender.Feminine]: "Fem",
  [LatinGender.Neuter]: "Neut",
};

/** UD `[Aspect, Tense]` for each tense; either part may be absent. */
const UD_TENSES: Record<LatinTense, [string | undefined, string | undefined]> =
  {
    [LatinTense.Present]: [undefined, "Pres"],
    [LatinTense.Imperfect]: ["Imp", "Past"],
    [LatinTense.Pluperfect]: ["Perf", "Pqp"],
    [LatinTense.Future]: [undefined, "Fut"],
    // `convertUpos` can't express these two: it reads `Tense=Past|Aspect=Perf`
    // as pluperfect and `Tense=Fut|Aspect=Perf` as future. Emitting only the
    // aspect leaves the tense unspecified, which still matches the right forms.
    [LatinTense.Perfect]: ["Perf", undefined],
    [LatinTense.FuturePerfect]: ["Perf", undefined],
  };

/** UD `[Mood, VerbForm]` for each mood. */
const UD_MOODS: Record<LatinMood, [string | undefined, string | undefined]> = {
  [LatinMood.Indicative]: ["Ind", undefined],
  [LatinMood.Imperative]: ["Imp", undefined],
  [LatinMood.Subjunctive]: ["Sub", undefined],
  [LatinMood.Participle]: [undefined, "Part"],
  [LatinMood.Gerundive]: [undefined, "Gdv"],
  [LatinMood.Infinitive]: [undefined, "Inf"],
  [LatinMood.Supine]: [undefined, "Sup"],
};

/**
 * Serializes inflection data as UD-style morphological features
 * (`Key=Value|...`, keys in alphabetical order), in the form that
 * `convertUpos` parses back.
 *
 * Fields with several values contribute only their first value. Values with
 * no UD equivalent that `convertUpos` understands (the adverbial gender, and
 * the perfect and future perfect tenses, which become just `Aspect=Perf`) are
 * left out, so the round trip may be less specific but never contradicts the
 * input.
 */
export function wordInflectionDataToUd(data: WordInflectionData): string {
  const tense = firstValue(data.tense);
  const mood = firstValue(data.mood);
  const [aspectValue, tenseValue] =
    tense === undefined ? [undefined, undefined] : UD_TENSES[tense];
  const [moodValue, verbFormValue] =
    mood === undefined ? [undefined, undefined] : UD_MOODS[mood];
  const caseValue = firstValue(data.case);
  const degree = firstValue(data.degree);
  const gender = firstValue(data.gender);
  const number = firstValue(data.number);
  const person = firstValue(data.person);
  const voice = firstValue(data.voice);
  const features: [string, string | undefined][] = [
    ["Aspect", aspectValue],
    ["Case", caseValue === undefined ? undefined : UD_CASES[caseValue]],
    ["Degree", degree === undefined ? undefined : UD_DEGREES[degree]],
    ["Gender", gender === undefined ? undefined : UD_GENDERS[gender]],
    ["Mood", moodValue],
    [
      "Number",
      number === undefined
        ? undefined
        : number === LatinNumber.Singular
        ? "Sing"
        : "Plur",
    ],
    ["Person", person === undefined ? undefined : `${person}`],
    ["Tense", tenseValue],
    ["VerbForm", verbFormValue],
    [
      "Voice",
      voice === undefined
        ? undefined
        : voice === LatinVoice.Active
        ? "Act"
        : "Pass",
    ],
  ];
  return features
    .filter((feature): feature is [string, string] => feature[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}
