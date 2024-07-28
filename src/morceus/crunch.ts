import { assert, assertEqual, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { InflectionContext } from "@/morceus/inflection_data_utils";
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

export interface CrunchResult {
  lemma: string;
  ending: string;
  stemOrForm: Stem | IrregularForm;
}

interface LatinWordAnalysis {
  lemma: string;
  inflectedForms: {
    form: string;
    inflectionData: InflectionContext[];
  }[];
}

type StemMap = Map<string, [Stem | IrregularForm, string][]>;

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
  endsMap: Map<string, string[]>,
  stemMap: StemMap,
  word: string
): CrunchResult[] {
  const results: CrunchResult[] = [];
  for (let i = 1; i <= word.length; i++) {
    const maybeStem = word.slice(0, i);
    const candidates = stemMap.get(maybeStem);
    if (candidates === undefined) {
      continue;
    }
    const maybeEnd = word.slice(i) || "*";
    const possibleEnds = endsMap.get(maybeEnd);
    for (const [candidate, lemma] of candidates) {
      const indeclinableCode = hasIndeclinableCode(candidate);
      if ("form" in candidate) {
        assert(indeclinableCode);
        // If it's indeclinable, then we skip if it the expected ending is not empty
        // (since there's no inflected ending to bridge the gap).
        if (maybeEnd !== "*") {
          continue;
        }
      } else {
        assert(!indeclinableCode);
        // If it's inflected, make sure there's a candidate inflection that matches.
        if (!possibleEnds?.includes(candidate.inflection)) {
          continue;
        }
      }
      results.push({ lemma, stemOrForm: candidate, ending: maybeEnd });
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

export namespace MorceusCruncher {
  export function make(config?: CruncherConfig): Cruncher {
    const [endIndices, endTables] =
      config?.existing?.endsResult ??
      makeEndIndex(
        ["src/morceus/tables/lat/core/target"],
        ["src/morceus/tables/lat/core/dependency"]
      );
    const cachedLemmata =
      config?.existing?.lemmata ??
      allNounStems(config?.generate?.nomStemFiles).concat(
        allVerbStems(config?.generate?.verbStemFiles)
      );
    // // Special cases
    // endTables.set(
    //   "adverb",
    //   new Map([
    //     ["*", [{ grammaticalData: {}, ending: "*", internalTags: ["adverb"] }]],
    //   ])
    // );
    // endTables.set(
    //   "N/A",
    //   new Map([["*", [{ grammaticalData: {}, ending: "*" }]]])
    // );
    const endsMap = makeEndsMap(endIndices);
    const stemsMap = makeStemsMap(cachedLemmata);
    return (word, options) =>
      convert(crunchWord(endsMap, stemsMap, word), endTables, options);
  }

  function convert(
    crunchResults: CrunchResult[],
    inflectionLookup: InflectionLookup,
    options?: CruncherOptions
  ): LatinWordAnalysis[] {
    const strictLengths = options?.vowelLength !== "relaxed";
    const byLemma = arrayMap<string, CrunchResult>();
    for (const result of crunchResults) {
      byLemma.add(result.lemma, result);
    }
    const analyses: LatinWordAnalysis[] = [];
    for (const [lemma, results] of byLemma.map.entries()) {
      const byForm = arrayMap<string, InflectionContext>();
      for (const result of results) {
        if ("form" in result.stemOrForm) {
          byForm.add(result.stemOrForm.form, result.stemOrForm);
          continue;
        }
        const stem = result.stemOrForm;
        const inflectionEndings = checkPresent(
          inflectionLookup.get(stem.inflection)?.get(result.ending)
        );
        for (const inflection of inflectionEndings) {
          // We can still differ here based on vowel length
          if (inflection.ending !== result.ending && strictLengths) {
            continue;
          }
          // We should probably replace this check later under a debug flag.
          assertEqual(
            inflection.ending.replaceAll("_", "").replaceAll("^", ""),
            result.ending.replaceAll("_", "").replaceAll("^", "")
          );
          const mergedData = InflectionContext.merge(inflection, stem);
          if (mergedData === null) {
            continue;
          }
          const ending = inflection.ending === "*" ? "" : inflection.ending;
          const form = stem.stem + ending;
          byForm.add(form, mergedData);
        }
      }
      const inflectedForms = [...byForm.map.entries()];
      // This should only be if there was a vowel length mismatch
      if (inflectedForms.length === 0) {
        assert(strictLengths);
        continue;
      }
      analyses.push({
        lemma,
        inflectedForms: inflectedForms.map(([form, inflectionData]) => ({
          form,
          inflectionData,
        })),
      });
    }
    return analyses;
  }
}

function printWordAnalysis(input: LatinWordAnalysis) {
  console.log(`lemma: ${input.lemma}`);
  for (const form of input.inflectedForms) {
    console.log(`  - ${form.form}: `);
    for (const data of form.inflectionData) {
      console.log(`    - ${InflectionContext.toString(data)}`);
    }
  }
}

const options: CruncherOptions = { vowelLength: "relaxed" };
const cruncher = MorceusCruncher.make();
const start = performance.now();
const result = cruncher("itura", options);
console.log(`${performance.now() - start} ms`);
result.forEach(printWordAnalysis);
