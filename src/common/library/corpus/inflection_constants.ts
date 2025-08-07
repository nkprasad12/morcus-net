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

export const LATIN_CASE_MAP: Record<string, LatinCase> = {
  nom: LatinCase.Nominative,
  acc: LatinCase.Accusative,
  dat: LatinCase.Dative,
  gen: LatinCase.Genitive,
  abl: LatinCase.Ablative,
  voc: LatinCase.Vocative,
  loc: LatinCase.Locative,
};

export const LATIN_NUMBER_MAP: Record<string, LatinNumber> = {
  sg: LatinNumber.Singular,
  pl: LatinNumber.Plural,
};

export const LATIN_GENDER_MAP: Record<string, LatinGender> = {
  m: LatinGender.Masculine,
  f: LatinGender.Feminine,
  n: LatinGender.Neuter,
  adv: LatinGender.Adverbial,
};

export const LATIN_PERSON_MAP: Record<string, LatinPerson> = {
  "1": LatinPerson.FIRST,
  "2": LatinPerson.SECOND,
  "3": LatinPerson.THIRD,
};

export const LATIN_MOOD_MAP: Record<string, LatinMood> = {
  ind: LatinMood.Indicative,
  imp: LatinMood.Imperative,
  sub: LatinMood.Subjunctive,
  part: LatinMood.Participle,
  ger: LatinMood.Gerundive,
  inf: LatinMood.Infinitive,
  sup: LatinMood.Supine,
};

export const LATIN_VOICE_MAP: Record<string, LatinVoice> = {
  act: LatinVoice.Active,
  pass: LatinVoice.Passive,
};

export const LATIN_TENSE_MAP: Record<string, LatinTense> = {
  pres: LatinTense.Present,
  imperf: LatinTense.Imperfect,
  perf: LatinTense.Perfect,
  futperf: LatinTense.FuturePerfect,
  fut: LatinTense.Future,
  plup: LatinTense.Pluperfect,
};

export const LATIN_DEGREE_MAP: Record<string, LatinDegree> = {
  pos: LatinDegree.Positive,
  comp: LatinDegree.Comparative,
  sup: LatinDegree.Superlative,
};

export const INFLECTION_MAP: Record<string, Record<string, number>> = {
  case: LATIN_CASE_MAP,
  number: LATIN_NUMBER_MAP,
  gender: LATIN_GENDER_MAP,
  person: LATIN_PERSON_MAP,
  mood: LATIN_MOOD_MAP,
  voice: LATIN_VOICE_MAP,
  tense: LATIN_TENSE_MAP,
  degree: LATIN_DEGREE_MAP,
};
