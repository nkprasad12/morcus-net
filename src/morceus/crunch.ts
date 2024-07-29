import { assert, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
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
import { LatinDegree } from "@/morceus/types";

export interface CrunchResult extends InflectionContext {
  lemma: string;
  form: string;
  stem?: Stem;
  end?: InflectionEnding;
}

interface LatinWordAnalysis {
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

export function crunchWord(
  word: string,
  tables: CruncherTables,
  options?: CruncherOptions
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
        const mergedData = mergeIfCompatible(candidate, end);
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
    subsetOf(
      stemData.degree || LatinDegree.Positive,
      endData.degree || LatinDegree.Positive
    ) &&
    subsetOf(stemData.gender, endData.gender) &&
    subsetOf(stemData.mood, endData.mood) &&
    subsetOf(stemData.number, endData.number) &&
    subsetOf(stemData.person, endData.person) &&
    subsetOf(stemData.tense, endData.tense) &&
    subsetOf(stemData.voice, endData.voice);
  if (!isCompatible) {
    return null;
  }
  const result: InflectionContext = { grammaticalData: endData };
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
        lemma,
        inflectedForms: Array.from(
          byForm.map.entries(),
          ([form, inflectionData]) => ({
            form,
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
