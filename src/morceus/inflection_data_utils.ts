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

const SEMANTIC_TAGS = new Set([
  "abbrev",
  "adverb",
  "archaic",
  "conj", // Is this conjunction or conjugation?
  "contr",
  "dep",
  "early",
  "late",
  "old",
  "orth",
  "exclam",
  "poetic",
  "rare",
  "syncop",
  "prep",
  "pers_name",
  "is_ethnic",
  "ethnic",
  "geog_name",
  "is_group",
  "group_name",
  "is_month",
  "place_name",
  "town",
  "syncope",
  "group",
  "is_festival",
  "pname",
  "poet",
  "interrog",
  // This should be a case
  "locative",
  "variant",
  "greek",
  "disputed",
  "card", //cardinal numeral
  "ord", //ordinal numeral
  "distr", //distributive numeral
  "advnum", //adverbial numeral
  "multipl", //multiplicative numeral
  "proport", //proportional numeral
  "tempnum", //temporal numeral
  "partnum", //partitive numeral
  "othernum", //other numeral
  "enclitic",
]);

export const INTERNAL_TAGS = new Set<string>([
  "are_vb",
  "comp_only",
  "conj1",
  "conj2",
  "conj3",
  "demonstr",
  "has_redupl",
  "indecl",
  "indef",
  "ire_vb",
  "irreg_adj2",
  "irreg_adj3",
  "irreg_decl3",
  "irreg_comp",
  "irreg_nom2",
  "irreg_nom3",
  "irreg_pp1",
  "irreg_pp2",
  "irreg_superl",
  "no_comp",
  "no_fut",
  "no_fut_part",
  "numeral",
  "perfstem",
  "pp4",
  "pron",
  "pron1",
  "pron2",
  "pron3",
  "relative",
  "rel_pron",
]);

function isSemanticTag(tag: string): boolean {
  if (SEMANTIC_TAGS.has(tag)) {
    return true;
  }
  return tag.match(/^arabic\d+$/) !== null;
}

/** Grammatical inflection data and context on usage. */
export interface InflectionContext {
  /** The grammatical categories - case, number, and so on. */
  grammaticalData: WordInflectionData;
  /** Tags indicating usage notes about the inflection. */
  tags?: string[];
  /** Tags only for internal (inflection-engine) use. */
  internalTags?: string[];
}

export namespace InflectionContext {
  export function toStringArray(context: InflectionContext): string[] {
    return (context.internalTags || [])
      .concat(wordInflectionDataToArray(context.grammaticalData))
      .concat(context.tags || []);
  }

  export function toString(context: InflectionContext): string {
    return toStringArray(context).join(" ");
  }
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

export function subsetOf<T>(first?: T | T[], second?: T | T[]): boolean {
  const firstArr =
    first === undefined ? [] : Array.isArray(first) ? first : [first];
  const secondArr =
    second === undefined ? [] : Array.isArray(second) ? second : [second];
  for (const item of firstArr) {
    if (!secondArr.includes(item)) {
      return false;
    }
  }
  return true;
}

export function compareField<T>(
  first?: T | T[],
  second?: T | T[]
): -1 | 0 | 1 | undefined {
  const isSubset = subsetOf(first, second);
  const isSuperset = subsetOf(second, first);
  return isSubset ? (isSuperset ? 0 : -1) : isSuperset ? 1 : undefined;
}

/**
 * Compares the two input grammatical data and returns the result.
 *
 * @param first The first data.
 * @param second The second data.
 *
 * @returns 0 if they are exactly equal, -1 if the first is a strict
 * subset of the second, 1 if the first is a strict superset of the second,
 * and undefined if none of the above are true.
 */
export function compareGrammaticalData(
  first: WordInflectionData,
  second: WordInflectionData
): -1 | 0 | 1 | undefined {
  const comparisons = new Set([
    compareField(first.case, second.case),
    compareField(first.degree, second.degree),
    compareField(first.gender, second.gender),
    compareField(first.mood, second.mood),
    compareField(first.number, second.number),
    compareField(first.person, second.person),
    compareField(first.tense, second.tense),
    compareField(first.voice, second.voice),
  ]);
  if (comparisons.has(undefined)) {
    return undefined;
  }
  if (comparisons.has(1) && comparisons.has(-1)) {
    return undefined;
  }
  if (comparisons.has(0) && comparisons.size === 1) {
    return 0;
  }
  return comparisons.has(-1) ? -1 : 1;
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
    else if (data === "ind" || data === "indic") {
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
    else if (isSemanticTag(data)) {
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
 * Merges inflection data when computing templated tables.
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

export function convertUpos(upos: string): WordInflectionData {
  const result: WordInflectionData = {};
  const parts = upos.trim().split("|");

  for (const part of parts) {
    if (!part) continue;

    const [key, value] = part.split("=").map((x) => x.trim());
    if (!key || !value) continue;

    switch (key) {
      case "Case":
        switch (value) {
          case "Nom":
            result.case = LatinCase.Nominative;
            break;
          case "Acc":
            result.case = LatinCase.Accusative;
            break;
          case "Gen":
            result.case = LatinCase.Genitive;
            break;
          case "Dat":
            result.case = LatinCase.Dative;
            break;
          case "Abl":
            result.case = LatinCase.Ablative;
            break;
          case "Voc":
            result.case = LatinCase.Vocative;
            break;
          case "Loc":
            result.case = LatinCase.Locative;
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Case" in UPOS tag: ${part}`
            );
        }
        break;

      case "Number":
        switch (value) {
          case "Sing":
            result.number = LatinNumber.Singular;
            break;
          case "Plur":
          case "Plural":
            result.number = LatinNumber.Plural;
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Number" in UPOS tag: ${part}`
            );
        }
        break;

      case "Gender":
        switch (value) {
          case "Masc":
            result.gender = LatinGender.Masculine;
            break;
          case "Fem":
            result.gender = LatinGender.Feminine;
            break;
          case "Neut":
            result.gender = LatinGender.Neuter;
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Gender" in UPOS tag: ${part}`
            );
        }
        break;

      case "Person":
        switch (value) {
          case "1":
            result.person = LatinPerson.FIRST;
            break;
          case "2":
            result.person = LatinPerson.SECOND;
            break;
          case "3":
            result.person = LatinPerson.THIRD;
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Person" in UPOS tag: ${part}`
            );
        }
        break;

      case "Voice":
        switch (value) {
          case "Act":
            result.voice = LatinVoice.Active;
            break;
          case "Pass":
            result.voice = LatinVoice.Passive;
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Voice" in UPOS tag: ${part}`
            );
        }
        break;

      case "VerbForm":
        switch (value) {
          case "Part":
            result.mood = LatinMood.Participle;
            break;
          case "Gdv":
            result.mood = LatinMood.Gerundive;
            break;
          case "Inf":
            result.mood = LatinMood.Infinitive;
            break;
          case "Sup":
            result.mood = LatinMood.Supine;
            break;
          case "Fin":
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "VerbForm" in UPOS tag: ${part}`
            );
        }
        break;

      case "Mood":
        switch (value) {
          case "Ind":
            result.mood = LatinMood.Indicative;
            break;
          case "Imp":
            result.mood = LatinMood.Imperative;
            break;
          case "Sub":
            result.mood = LatinMood.Subjunctive;
            break;
          // LatinCy does this even though it's not technically legal.
          case "Gdv":
            result.mood = LatinMood.Gerundive;
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Mood" in UPOS tag: ${part}`
            );
        }
        break;

      case "Tense":
        switch (value) {
          // TODO: UPOS has Aspect which should also be used in this computation.
          // Perfective / Imperfective are Aspects in UPOS.
          case "Pres":
            result.tense = LatinTense.Present;
            break;
          case "Imp":
            // result.tense = LatinTense.Imperfect;
            break;
          case "Perf":
            // result.tense = LatinTense.Perfect;
            break;
          case "Fut":
            result.tense = LatinTense.Future;
            break;
          case "Pqp":
            result.tense = LatinTense.Pluperfect;
            break;
          case "Ftp":
            // result.tense = LatinTense.FuturePerfect;
            break;
          case "Past":
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Tense" in UPOS tag: ${part}`
            );
        }
        break;

      case "Degree":
        switch (value) {
          case "Pos":
            result.degree = LatinDegree.Positive;
            break;
          case "Cmp":
            result.degree = LatinDegree.Comparative;
            break;
          case "Sup":
            result.degree = LatinDegree.Superlative;
            break;
          default:
            throw new Error(
              `Unrecognized value "${value}" for key "Degree" in UPOS tag: ${part}`
            );
        }
        break;

      // Add a default case to catch unrecognized keys
      default:
        throw new Error(
          `Unrecognized key "${key}" in UPOS tag: ${part} (from full tag: ${upos})`
        );
    }
  }

  return result;
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
