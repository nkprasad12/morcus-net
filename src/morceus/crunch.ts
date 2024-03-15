import { checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { allStems, type Lemma, type Stem } from "@/morceus/stem_parsing";
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
export type Cruncher = (word: string) => LatinWordAnalysis[];

export function crunchWord(
  endings: EndIndexRow[],
  lemmata: Lemma[],
  word: string
): CrunchResult[] {
  const results: CrunchResult[] = [];
  const stemMap = arrayMap<string, [Stem, string]>();
  for (const lemma of lemmata) {
    for (const stem of lemma.stems) {
      stemMap.add(stem.stem.replaceAll("^", "").replaceAll("_", ""), [
        stem,
        lemma.lemma,
      ]);
    }
  }
  const endsMap = new Map<string, string[]>(
    endings.map((e) => [e.ending, e.tableNames])
  );
  for (let i = 1; i < word.length; i++) {
    const maybeStem = word.slice(0, i);
    const candidates = stemMap.get(maybeStem);
    if (candidates === undefined) {
      continue;
    }
    const maybeEnd = word.slice(i) || "*";
    const possibleEnds = endsMap.get(maybeEnd);
    if (possibleEnds === undefined) {
      continue;
    }
    for (const [candidate, lemma] of candidates) {
      if (possibleEnds.includes(candidate.inflection)) {
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

export namespace MorceusCruncher {
  export function make(endsResult?: EndsResult, lemmata?: Lemma[]): Cruncher {
    const [endIndices, endTables] =
      endsResult ??
      makeEndIndex(
        ["src/morceus/tables/lat/core/target"],
        ["src/morceus/tables/lat/core/dependency"]
      );
    const cachedLemmata = lemmata ?? allStems();
    return (word) =>
      convert(crunchWord(endIndices, cachedLemmata, word), endTables);
  }

  function convert(
    crunchResults: CrunchResult[],
    inflectionLookup: InflectionLookup
  ): LatinWordAnalysis[] {
    const byLemma = arrayMap<string, CrunchResult>();
    for (const result of crunchResults) {
      byLemma.add(result.lemma, result);
    }
    const analyses: LatinWordAnalysis[] = [];
    for (const [lemma, results] of byLemma.map.entries()) {
      const byForm = arrayMap<string, InflectedFormData>();
      for (const result of results) {
        const form = result.stem.stem + result.ending;
        const inflectionEndings = checkPresent(
          inflectionLookup.get(result.stem.inflection)?.get(result.ending)
        );
        for (const inflection of inflectionEndings) {
          byForm.add(form, {
            inflection: inflection.grammaticalData.join(" "),
            usageNote: inflection.tags?.join(" "),
          });
        }
      }
      analyses.push({
        lemma,
        inflectedForms: [...byForm.map.entries()].map(
          ([form, inflectionData]) => ({ form, inflectionData })
        ),
      });
    }
    return analyses;
  }
}
