import type { AdjectiveInflection, VerbInflection } from "@/morceus/types";
import { LatinCase, LatinNumber } from "@/morceus/types";

type LatinInflectionData = Partial<AdjectiveInflection & VerbInflection>;

function definedButNotEqual<T>(first?: T, second?: T) {
  if (first === undefined || second === undefined) {
    return false;
  }
  return first !== second;
}

export function toInflectionData(
  grammaticalData: string[]
): LatinInflectionData {
  const result: LatinInflectionData = {};
  for (const data of grammaticalData) {
    if (data === "nom") {
      result.case = LatinCase.Nominative;
    }
    if (data === "acc") {
      result.case = LatinCase.Accusative;
    }
    if (data === "abl") {
      result.case = LatinCase.Ablative;
    }
    if (data === "gen") {
      result.case = LatinCase.Genitive;
    }
    if (data === "dat") {
      result.case = LatinCase.Dative;
    }
    if (data === "voc") {
      result.case = LatinCase.Vocative;
    }
    if (data === "nom") {
      result.case = LatinCase.Nominative;
    }
    if (data === "acc") {
      result.case = LatinCase.Accusative;
    }
    if (data === "abl") {
      result.case = LatinCase.Ablative;
    }
    if (data === "sg") {
      result.number = LatinNumber.Singular;
    }
    if (data === "pl") {
      result.number = LatinNumber.Plural;
    }
  }
  return result;
}

// TODO: Handle the case where we have multiple options on one side,
// for example when one inflection is used for nom / acc / voc and so on.
export function areCompatible(
  first: LatinInflectionData,
  second: LatinInflectionData
) {
  if (definedButNotEqual(first.mood, second.mood)) {
    return false;
  }
  // TODO: Voice here
  if (definedButNotEqual(first.tense, second.tense)) {
    return false;
  }
  // TODO: Gender here
  // TODO: Case here
  if (definedButNotEqual(first.case, second.case)) {
    return false;
  }
  if (definedButNotEqual(first.person, second.person)) {
    return false;
  }
  if (definedButNotEqual(first.number, second.number)) {
    return false;
  }
  return true;
}
