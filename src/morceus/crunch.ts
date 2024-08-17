import { assert, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { singletonOf } from "@/common/misc_utils";
import {
  InflectionContext,
  type InflectionEnding,
} from "@/morceus/inflection_data_utils";
import {
  allNounStems,
  allVerbStems,
  type IrregularForm,
  type Lemma,
  type Stem,
  type StemCode,
} from "@/morceus/stem_parsing";
import {
  makeEndIndex,
  type EndIndexRow,
  type EndsResult,
  type InflectionLookup,
} from "@/morceus/tables/indices";
import { expandSingleEnding } from "@/morceus/tables/templates";
import { LatinDegree, LatinGender } from "@/morceus/types";

export interface CrunchResult extends InflectionContext {
  lemma: string;
  form: string;
  stem?: Stem;
  end?: InflectionEnding;
  relaxedCase?: true;
  relaxedVowelLengths?: true;
}

export interface LatinWordAnalysis {
  lemma: string;
  inflectedForms: {
    form: string;
    inflectionData: CrunchResult[];
  }[];
}

type StemMap = Map<string, [Stem | IrregularForm, string][]>;

export interface CruncherTables {
  endsMap: Map<string, string[]>;
  stemMap: StemMap;
  inflectionLookup: InflectionLookup;
}

export interface CruncherOptions {
  vowelLength?: "strict" | "relaxed";
  relaxCase?: boolean;
}
export type Cruncher = (
  word: string,
  options?: CruncherOptions
) => LatinWordAnalysis[];

function normalizeKey(input: string): string {
  return input.replaceAll("^", "").replaceAll("_", "").replaceAll("-", "");
}

export function makeStemsMap(lemmata: Lemma[]): StemMap {
  const stemMap = arrayMap<string, [Stem | IrregularForm, string]>();
  for (const lemma of lemmata) {
    for (const stem of lemma.stems || []) {
      stemMap.add(normalizeKey(stem.stem), [stem, lemma.lemma]);
    }
    for (const form of lemma.irregularForms || []) {
      stemMap.add(normalizeKey(form.form), [form, lemma.lemma]);
    }
  }
  return stemMap.map;
}

export function makeEndsMap(endings: EndIndexRow[]): Map<string, string[]> {
  return new Map<string, string[]>(
    endings.map((e) => [e.ending, e.tableNames])
  );
}

function hasIndeclinableCode(input: { code?: StemCode }): boolean {
  return input?.code === "vb" || input?.code === "wd";
}

function crunchExactMatch(
  word: string,
  tables: CruncherTables
): CrunchResult[] {
  const results: CrunchResult[] = [];
  for (let i = 1; i <= word.length; i++) {
    const maybeStem = word.slice(0, i);
    const candidates = tables.stemMap.get(maybeStem);
    if (candidates === undefined) {
      continue;
    }
    const observedEnd = word.slice(i) || "*";
    const possibleEnds = tables.endsMap.get(observedEnd);
    for (const [candidate, lemma] of candidates) {
      const indeclinableCode = hasIndeclinableCode(candidate);
      if ("form" in candidate) {
        assert(indeclinableCode || candidate.code === undefined);
        // If it's indeclinable, then we skip if it the expected ending is not empty
        // (since there's no inflected ending to bridge the gap). Otherwise, since it
        // is not inflected, we don't need to do any further compatibility checks
        // like we do between stems and endings.
        if (observedEnd === "*") {
          results.push({ lemma, ...candidate });
        }
        continue;
      }
      assert(!indeclinableCode || candidate.code === undefined);
      // Check to make sure there's a template that could have a match.
      if (!possibleEnds?.includes(candidate.inflection)) {
        continue;
      }
      const possibleEndInflections = checkPresent(
        tables.inflectionLookup.get(candidate.inflection)?.get(observedEnd)
      );
      for (const end of possibleEndInflections) {
        // If there's no inflection code,
        // this means the entire table is intended to be expanded there. Otherwise,
        // check to see whether the ending and stem are actually valid.
        const mergedData =
          candidate.code === undefined
            ? expandSingleEnding(candidate.stem, candidate, end)
            : mergeIfCompatible(candidate, end);
        if (mergedData !== null) {
          results.push({
            lemma,
            form: candidate.stem + end.ending,
            stem: candidate,
            end,
            ...mergedData,
          });
        }
      }
    }
  }
  return results;
}

export function crunchWord(
  word: string,
  tables: CruncherTables,
  options?: CruncherOptions
): CrunchResult[] {
  const results: CrunchResult[] = crunchExactMatch(word, tables);
  if (options?.relaxCase === true) {
    const isUpperCase = word[0].toUpperCase() === word[0];
    const relaxedFirst = isUpperCase
      ? word[0].toLowerCase()
      : word[0].toUpperCase();
    const relaxedWord = relaxedFirst + word.slice(1);
    for (const relaxedResult of crunchExactMatch(relaxedWord, tables)) {
      results.push({ ...relaxedResult, relaxedCase: true });
    }
  }
  return results;
}

export interface CruncherConfig {
  existing?: {
    endsResult: EndsResult;
    lemmata: Lemma[];
  };
  generate?: {
    nomStemFiles: string[];
    verbStemFiles: string[];
  };
}

function subsetOf<T>(first?: T | T[], second?: T | T[]): boolean {
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

function mergeIfCompatible(
  stem: InflectionContext,
  ending: InflectionContext
): InflectionContext | null {
  const stemData = stem.grammaticalData;
  const endData = ending.grammaticalData;
  const isCompatible =
    subsetOf(stemData.case, endData.case) &&
    // For degree, the positive is implied if it is not marked.
    subsetOf(stemData.degree, endData.degree || LatinDegree.Positive) &&
    // If the template doesn't have a gender, it is assumed to be valid for all.
    subsetOf(
      stemData.gender,
      endData.gender || [
        LatinGender.Feminine,
        LatinGender.Masculine,
        LatinGender.Neuter,
      ]
    ) &&
    subsetOf(stemData.mood, endData.mood) &&
    subsetOf(stemData.number, endData.number) &&
    subsetOf(stemData.person, endData.person) &&
    subsetOf(stemData.tense, endData.tense) &&
    subsetOf(stemData.voice, endData.voice);
  if (!isCompatible) {
    return null;
  }

  // For `case` and `gender`, if the stem has provides any narrowing we want to use
  // that instead of the more expansive options on the ending (since the stem info
  // is guaranteed to be a subset of the end options after the above checks).
  // For example, if the stem has `fem` and the ending has `masc / fem`, we
  // only want `fem` for the result.
  //
  // Note that we should theoretically be doing this for all the other dimensions as well,
  // but because no other dimensions (besides `case` and `gender`) can have multiple
  // options, the result is the same as just taking the data from the ending, since in that
  // case either they are both undefined or both equal to the same thing (in which case
  // it doesn't matter if we took the stem or the ending), or the stem is undefined and
  // the ending is not (in which case we would want the ending).
  const resultCase = stemData.case ?? endData.case;
  const resultGender = stemData.gender ?? endData.gender;
  const result: InflectionContext = {
    grammaticalData: { ...endData, gender: resultGender, case: resultCase },
  };
  if (stem.tags !== undefined || ending.tags !== undefined) {
    const tags = (stem.tags || []).concat(ending.tags || []);
    result.tags = [...new Set<string>(tags)];
  }
  if (stem.internalTags !== undefined || ending.internalTags !== undefined) {
    const tags = (stem.internalTags || []).concat(ending.internalTags || []);
    result.internalTags = [...new Set<string>(tags)];
  }
  return result;
}

export namespace MorceusCruncher {
  export function makeTables(config?: CruncherConfig): CruncherTables {
    const [endIndices, endTables] =
      config?.existing?.endsResult ??
      makeEndIndex(
        ["src/morceus/tables/lat/core/target"],
        ["src/morceus/tables/lat/core/dependency"]
      );
    const allLemmata =
      config?.existing?.lemmata ??
      allNounStems(config?.generate?.nomStemFiles).concat(
        allVerbStems(config?.generate?.verbStemFiles)
      );
    const endsMap = makeEndsMap(endIndices);
    const stemMap = makeStemsMap(allLemmata);
    return { endsMap, stemMap, inflectionLookup: endTables };
  }

  export const CACHED_TABLES = singletonOf(makeTables);

  export function make(tables?: CruncherTables): Cruncher {
    return (word, options) =>
      convert(crunchWord(word, tables || makeTables(), options));
  }

  function convert(crunchResults: CrunchResult[]): LatinWordAnalysis[] {
    const byLemma = arrayMap<string, CrunchResult>();
    for (const result of crunchResults) {
      byLemma.add(result.lemma, result);
    }
    const analyses: LatinWordAnalysis[] = [];
    for (const [lemma, results] of byLemma.map.entries()) {
      const byForm = arrayMap<string, CrunchResult>();
      for (const result of results) {
        byForm.add(result.form, result);
      }
      analyses.push({
        lemma: lemma
          .replaceAll("^", "\u0306")
          .replaceAll("_", "\u0304")
          .replaceAll("-", ""),
        inflectedForms: Array.from(
          byForm.map.entries(),
          ([form, inflectionData]) => ({
            form: form
              .replaceAll("^", "\u0306")
              .replaceAll("_", "\u0304")
              .replaceAll("-", ""),
            inflectionData,
          })
        ),
      });
    }
    return analyses;
  }
}

// function printWordAnalysis(input: LatinWordAnalysis) {
//   console.log(`lemma: ${input.lemma}`);
//   for (const form of input.inflectedForms) {
//     console.log(`  - ${form.form}: `);
//     for (const data of form.inflectionData) {
//       console.log(`    - ${InflectionContext.toString(data)}`);
//     }
//   }
// }

// const options: CruncherOptions = { vowelLength: "relaxed" };
// const cruncher = MorceusCruncher.make(MorceusCruncher.makeTables());
// const start = performance.now();
// const result = cruncher(process.argv[2], options);
// console.log(`${performance.now() - start} ms`);
// result.forEach(printWordAnalysis);
