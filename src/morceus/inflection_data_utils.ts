import { assertEqual, checkSatisfies } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
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

export const SEMANTIC_TAGS = new Set([
  "contr",
  "early",
  "late",
  "old",
  "orth",
  "poetic",
  "rare",
]);
export const INTERNAL_TAGS = new Set<string>([
  "adverb",
  "are_vb",
  "conj", // Is this conjunction or conjugation?
  "demonstr",
  "indecl",
  "indef",
  "interrog",
  "ire_vb",
  "irreg_adj2",
  "irreg_adj3",
  "irreg_comp",
  "irreg_nom2",
  "irreg_nom3",
  "irreg_superl",
  "numeral",
  "pp4",
  "pron1",
  "pron2",
  "pron3",
  "relative",
  "rel_pron",
]);

/** Grammatical inflection data and context on usage. */
export interface InflectionContext {
  /** The grammatical categories - case, number, and so on. */
  grammaticalData: WordInflectionData;
  /** Tags indicating usage notes about the inflection. */
  tags?: string[];
  /** Tags only for internal (inflection-engine) use. */
  internalTags?: string[];
}

/** An entry in an inflection table that shows an ending and when to use it. */
export interface InflectionEnding extends InflectionContext {
  /** The ending corresponding to the given `grammaticalData`. */
  ending: string;
}

function mergeCompatible<T>(
  first?: T | T[],
  second?: T | T[]
): T | T[] | undefined | null {
  if (first === undefined) {
    return second;
  }
  if (second === undefined) {
    return first;
  }

  const firstAsArr = Array.isArray(first) ? first : [first];
  const secondAsArr = Array.isArray(second) ? second : [second];
  const intersection = firstAsArr.filter((x) => secondAsArr.includes(x));
  if (intersection.length === 0) {
    return null;
  }
  return intersection.length === 1 ? intersection[0] : intersection;
}

function mergeCompatibleDegree(
  first?: LatinDegree | LatinDegree[],
  second?: LatinDegree | LatinDegree[]
): LatinDegree | undefined {
  if (Array.isArray(first) || Array.isArray(second)) {
    return undefined;
  }
  if (first === undefined) {
    return second;
  }
  if (second === undefined) {
    return first;
  }
  return first === second ? first : undefined;
}

function updateInflectionData<T extends LatinCase | LatinGender>(
  previousValue: T | T[] | undefined,
  newValue: T
) {
  if (previousValue === undefined) {
    return newValue;
  } else if (Array.isArray(previousValue)) {
    return [...previousValue, newValue];
  } else {
    return [previousValue, newValue];
  }
}

export function toInflectionData(grammaticalData: string[]): InflectionContext {
  const result: WordInflectionData = {};
  const tags: string[] = [];
  const internalTags: string[] = [];
  for (const data of grammaticalData) {
    // Cases
    if (data === "nom") {
      result.case = updateInflectionData(result.case, LatinCase.Nominative);
    } else if (data === "acc") {
      result.case = updateInflectionData(result.case, LatinCase.Accusative);
    } else if (data === "abl") {
      result.case = updateInflectionData(result.case, LatinCase.Ablative);
    } else if (data === "gen") {
      assertEqual(result.case, undefined);
      result.case = LatinCase.Genitive;
    } else if (data === "dat") {
      result.case = updateInflectionData(result.case, LatinCase.Dative);
    } else if (data === "voc") {
      result.case = updateInflectionData(result.case, LatinCase.Vocative);
    } else if (data === "abl/dat") {
      assertEqual(result.case, undefined);
      result.case = [LatinCase.Ablative, LatinCase.Dative];
    } else if (data === "dat/abl") {
      assertEqual(result.case, undefined);
      result.case = [LatinCase.Dative, LatinCase.Ablative];
    } else if (data === "nom/voc") {
      result.case = updateInflectionData(result.case, LatinCase.Nominative);
      result.case = updateInflectionData(result.case, LatinCase.Vocative);
    } else if (data === "nom/acc") {
      assertEqual(result.case, undefined);
      result.case = [LatinCase.Nominative, LatinCase.Accusative];
    } else if (data === "nom/voc/acc") {
      assertEqual(result.case, undefined);
      result.case = [
        LatinCase.Nominative,
        LatinCase.Vocative,
        LatinCase.Accusative,
      ];
    }

    // Persons
    else if (data === "1st") {
      assertEqual(result.person, undefined);
      result.person = LatinPerson.FIRST;
    } else if (data === "2nd") {
      assertEqual(result.person, undefined);
      result.person = LatinPerson.SECOND;
    } else if (data === "3rd") {
      assertEqual(result.person, undefined);
      result.person = LatinPerson.THIRD;
    }

    // Numbers
    else if (data === "sg") {
      assertEqual(result.number, undefined);
      result.number = LatinNumber.Singular;
    } else if (data === "pl") {
      assertEqual(result.number, undefined);
      result.number = LatinNumber.Plural;
    }

    // Voices
    else if (data === "act") {
      assertEqual(result.voice, undefined);
      result.voice = LatinVoice.Active;
    } else if (data === "pass") {
      assertEqual(result.voice, undefined);
      result.voice = LatinVoice.Passive;
    }

    // Genders
    else if (data === "masc") {
      result.gender = updateInflectionData(
        result.gender,
        LatinGender.Masculine
      );
    } else if (data === "fem") {
      result.gender = updateInflectionData(result.gender, LatinGender.Feminine);
    } else if (data === "neut") {
      result.gender = updateInflectionData(result.gender, LatinGender.Neuter);
    } else if (data === "masc/neut") {
      assertEqual(result.gender, undefined);
      result.gender = [LatinGender.Masculine, LatinGender.Neuter];
    } else if (data === "masc/fem") {
      assertEqual(result.gender, undefined);
      result.gender = [LatinGender.Masculine, LatinGender.Feminine];
    } else if (data === "adverbial") {
      assertEqual(result.gender, undefined);
      result.gender = LatinGender.Adverbial;
    } else if (data === "masc/fem/neut") {
      assertEqual(result.gender, undefined);
      result.gender = [
        LatinGender.Masculine,
        LatinGender.Feminine,
        LatinGender.Neuter,
      ];
    }

    // Degrees
    else if (data === "superl") {
      assertEqual(result.degree, undefined);
      result.degree = LatinDegree.Superlative;
    } else if (data === "comp") {
      assertEqual(result.degree, undefined);
      result.degree = LatinDegree.Comparative;
    }

    // Tenses
    else if (data === "imperf") {
      assertEqual(result.tense, undefined);
      result.tense = LatinTense.Imperfect;
    } else if (data === "fut") {
      assertEqual(result.tense, undefined);
      result.tense = LatinTense.Future;
    } else if (data === "pres") {
      assertEqual(result.tense, undefined);
      result.tense = LatinTense.Present;
    } else if (data === "perf") {
      assertEqual(result.tense, undefined);
      result.tense = LatinTense.Perfect;
    } else if (data === "plup") {
      assertEqual(result.tense, undefined);
      result.tense = LatinTense.Pluperfect;
    } else if (data === "futperf") {
      assertEqual(result.tense, undefined);
      result.tense = LatinTense.FuturePerfect;
    }

    // Moods
    else if (data === "ind") {
      assertEqual(result.mood, undefined);
      result.mood = LatinMood.Indicative;
    } else if (data === "subj") {
      assertEqual(result.mood, undefined);
      result.mood = LatinMood.Subjunctive;
    } else if (data === "part") {
      assertEqual(result.mood, undefined);
      result.mood = LatinMood.Participle;
    } else if (data === "gerundive") {
      assertEqual(result.mood, undefined);
      result.mood = LatinMood.Gerundive;
    } else if (data === "imperat") {
      assertEqual(result.mood, undefined);
      result.mood = LatinMood.Imperative;
    } else if (data === "inf") {
      assertEqual(result.mood, undefined);
      result.mood = LatinMood.Infinitive;
    } else if (data === "supine") {
      assertEqual(result.mood, undefined);
      result.mood = LatinMood.Supine;
    }

    // Other data
    else if (SEMANTIC_TAGS.has(data)) {
      tags.push(data);
    } else if (INTERNAL_TAGS.has(data)) {
      internalTags.push(data);
    } else {
      throw new Error(`Unexpected: ${data} from [${grammaticalData}]`);
    }
  }
  return {
    grammaticalData: result,
    tags: tags.length === 0 ? undefined : tags,
    internalTags: internalTags.length === 0 ? undefined : internalTags,
  };
}

/**
 * Merges inflection data when computed templated tables.
 *
 * @param template
 * @param modifier
 * @returns The merged inflection data, or `null` if they are not compatible.
 */
export function mergeInflectionData(
  template: WordInflectionData,
  modifier: WordInflectionData
): WordInflectionData | null {
  const mergedMood = mergeCompatible(template.mood, modifier.mood);
  if (mergedMood === null) {
    return null;
  }
  const mergedVoice = mergeCompatible(template.voice, modifier.voice);
  if (mergedVoice === null) {
    return null;
  }
  const mergedTense = mergeCompatible(template.tense, modifier.tense);
  if (mergedTense === null) {
    return null;
  }
  const mergedGender = mergeCompatible(template.gender, modifier.gender);
  if (mergedGender === null) {
    return null;
  }
  const mergedCase = mergeCompatible(template.case, modifier.case);
  if (mergedCase === null) {
    return null;
  }
  const mergedPerson = mergeCompatible(template.person, modifier.person);
  if (mergedPerson === null) {
    return null;
  }
  const mergedNumber = mergeCompatible(template.number, modifier.number);
  if (mergedNumber === null) {
    return null;
  }
  const mergedDegree = mergeCompatibleDegree(template.degree, modifier.degree);
  if (mergedDegree === null) {
    return null;
  }

  return {
    mood: mergedMood,
    voice: mergedVoice,
    tense: mergedTense,
    gender: mergedGender,
    case: mergedCase,
    person: mergedPerson,
    number: mergedNumber,
    degree: mergedDegree,
  };
}

function coerceToArray<T>(input: T | T[] | undefined): T[] {
  if (input === undefined) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  return [input];
}

function toMorpheusGender(data: LatinGender): string {
  switch (data) {
    case LatinGender.Adverbial:
      return "adverbial";
    case LatinGender.Feminine:
      return "fem";
    case LatinGender.Masculine:
      return "masc";
    case LatinGender.Neuter:
      return "neut";
    default:
      exhaustiveGuard(data);
  }
}

function toMorpheusCase(data: LatinCase): string {
  switch (data) {
    case LatinCase.Ablative:
      return "abl";
    case LatinCase.Accusative:
      return "acc";
    case LatinCase.Dative:
      return "dat";
    case LatinCase.Genitive:
      return "gen";
    case LatinCase.Locative:
      return "loc";
    case LatinCase.Nominative:
      return "nom";
    case LatinCase.Vocative:
      return "voc";
    default:
      exhaustiveGuard(data);
  }
}

function toMorpheusNumber(data: LatinNumber): string {
  switch (data) {
    case LatinNumber.Singular:
      return "sg";
    case LatinNumber.Plural:
      return "pl";
    default:
      exhaustiveGuard(data);
  }
}

function toMorpheusPerson(data: LatinPerson): string {
  switch (data) {
    case LatinPerson.FIRST:
      return "1st";
    case LatinPerson.SECOND:
      return "2nd";
    case LatinPerson.THIRD:
      return "3rd";
    default:
      exhaustiveGuard(data);
  }
}

function toMorpheusVoice(data: LatinVoice): string {
  switch (data) {
    case LatinVoice.Active:
      return "act";
    case LatinVoice.Passive:
      return "pass";
    default:
      exhaustiveGuard(data);
  }
}

function toMorpheusDegree(data: LatinDegree): string | undefined {
  switch (data) {
    case LatinDegree.Comparative:
      return "comp";
    case LatinDegree.Positive:
      return undefined;
    case LatinDegree.Superlative:
      return "superl";
    default:
      exhaustiveGuard(data);
  }
}

function toMorpheusTense(data: LatinTense): string {
  switch (data) {
    case LatinTense.Future:
      return "fut";
    case LatinTense.FuturePerfect:
      return "futperf";
    case LatinTense.Imperfect:
      return "imperf";
    case LatinTense.Perfect:
      return "perf";
    case LatinTense.Pluperfect:
      return "plup";
    case LatinTense.Present:
      return "pres";
    default:
      exhaustiveGuard(data);
  }
}

function toMorpheusMood(data: LatinMood): string {
  switch (data) {
    case LatinMood.Gerundive:
      return "gerundive";
    case LatinMood.Imperative:
      return "imperat";
    case LatinMood.Indicative:
      return "ind";
    case LatinMood.Participle:
      return "part";
    case LatinMood.Subjunctive:
      return "subj";
    case LatinMood.Infinitive:
      return "inf";
    case LatinMood.Supine:
      return "supine";
    default:
      exhaustiveGuard(data);
  }
}

export function wordInflectionDataToArray(data: WordInflectionData): string[] {
  return [
    coerceToArray(data.tense).map(toMorpheusTense),
    coerceToArray(data.mood).map(toMorpheusMood),
    coerceToArray(data.voice).map(toMorpheusVoice),
    coerceToArray(data.person).map(toMorpheusPerson),
    coerceToArray(data.gender).map(toMorpheusGender),
    coerceToArray(data.case).map(toMorpheusCase),
    checkSatisfies(coerceToArray(data.degree).map(toMorpheusDegree), (arr) => {
      const numUndefined = arr.filter((x) => x === undefined).length;
      return numUndefined === 0 || (numUndefined === 1 && arr.length === 1);
    }).filter((x) => x !== undefined),
    coerceToArray(data.number).map(toMorpheusNumber),
  ]
    .map((subArray) => subArray.join("/"))
    .filter((attribute) => attribute.length > 0);
}

export function isWordInflectionDataNonEmpty(
  data: WordInflectionData
): boolean {
  return (
    coerceToArray(data.tense).length > 0 ||
    coerceToArray(data.mood).length > 0 ||
    coerceToArray(data.voice).length > 0 ||
    coerceToArray(data.person).length > 0 ||
    coerceToArray(data.gender).length > 0 ||
    coerceToArray(data.case).length > 0 ||
    coerceToArray(data.degree).length > 0 ||
    coerceToArray(data.number).length > 0
  );
}
