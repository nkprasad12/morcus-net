import { assert, assertEqual, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  InflectionContext,
  wordInflectionDataToArray,
} from "@/morceus/inflection_data_utils";
import {
  allNounStems,
  allVerbStems,
  type Lemma,
  type Stem,
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
  stem: Stem;
}
interface InflectedFormData {
  inflection: string;
  usageNote?: string;
}
interface LatinWordAnalysis {
  lemma: string;
  inflectedForms: {
    form: string;
    inflectionData: InflectedFormData[];
  }[];
}

export interface CruncherOptions {
  vowelLength?: "strict" | "relaxed";
}
export type Cruncher = (
  word: string,
  options?: CruncherOptions
) => LatinWordAnalysis[];

export function makeStemsMap(lemmata: Lemma[]): Map<string, [Stem, string][]> {
  const stemMap = arrayMap<string, [Stem, string]>();
  for (const lemma of lemmata) {
    for (const stem of lemma.stems || []) {
      stemMap.add(
        stem.stem.replaceAll("^", "").replaceAll("_", "").replaceAll("-", ""),
        [stem, lemma.lemma]
      );
    }

    // TODO: Handle the irregulars.
  }
  return stemMap.map;
}

export function makeEndsMap(endings: EndIndexRow[]): Map<string, string[]> {
  return new Map<string, string[]>(
    endings.map((e) => [e.ending, e.tableNames])
  );
}

export function crunchWord(
  endsMap: Map<string, string[]>,
  stemMap: Map<string, [Stem, string][]>,
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
    const indeclinables =
      maybeEnd === "*" ? candidates.filter((s) => s[0].code === "wd") : [];
    if (possibleEnds === undefined && indeclinables.length === 0) {
      continue;
    }
    for (const [candidate, lemma] of candidates) {
      if (
        (candidate.code === "wd" || candidate.code === "vb") &&
        maybeEnd === "*"
      ) {
        results.push({ lemma, stem: candidate, ending: maybeEnd });
      } else if (possibleEnds && possibleEnds.includes(candidate.inflection)) {
        results.push({
          lemma,
          stem: candidate,
          ending: maybeEnd,
        });
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
    // Special cases
    endTables.set(
      "adverb",
      new Map([
        ["*", [{ grammaticalData: {}, ending: "*", internalTags: ["adverb"] }]],
      ])
    );
    endTables.set(
      "N/A",
      new Map([["*", [{ grammaticalData: {}, ending: "*" }]]])
    );
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
      const byForm = arrayMap<string, InflectedFormData>();
      for (const result of results) {
        const inflectionEndings = checkPresent(
          inflectionLookup.get(result.stem.inflection)?.get(result.ending)
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
          // TODO: We should probably de-dedupe here and maybe more???
          const grammaticalData = wordInflectionDataToArray(
            inflection.grammaticalData
          ).concat(InflectionContext.toStringArray(result.stem));
          const ending = inflection.ending === "*" ? "" : inflection.ending;
          const form = result.stem.stem + ending;
          byForm.add(form, {
            inflection: grammaticalData.join(" "),
            usageNote: inflection.tags?.join(" "),
          });
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

// const options: CruncherOptions = { vowelLength: "relaxed" };
// const cruncher = MorceusCruncher.make();
// const start = performance.now();
// const result = cruncher("ite", options);
// console.log(`${performance.now() - start} ms`);
// console.log(JSON.stringify(result, undefined, 2));
