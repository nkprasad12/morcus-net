import { assertEqual, checkPresent } from "@/common/assert";
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
  for (let i = 1; i <= word.length; i++) {
    const maybeStem = word.slice(0, i);
    const candidates = stemMap.get(maybeStem);
    if (candidates === undefined) {
      continue;
    }
    const maybeEnd = word.slice(i) || "*";
    const possibleEnds = endsMap.get(maybeEnd);
    const indeclinables =
      maybeEnd === "*" ? candidates.filter((s) => s[0].pos === "wd") : [];
    if (possibleEnds === undefined && indeclinables.length === 0) {
      continue;
    }
    for (const [candidate, lemma] of candidates) {
      if (candidate.pos === "wd" && maybeEnd === "*") {
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

export namespace MorceusCruncher {
  export function make(endsResult?: EndsResult, lemmata?: Lemma[]): Cruncher {
    const [endIndices, endTables] =
      endsResult ??
      makeEndIndex(
        ["src/morceus/tables/lat/core/target"],
        ["src/morceus/tables/lat/core/dependency"]
      );
    const cachedLemmata = lemmata ?? allStems();
    // Special cases
    endTables.set(
      "adverb",
      new Map([["*", [{ grammaticalData: ["adverb"], ending: "*" }]]])
    );
    endTables.set(
      "N/A",
      new Map([["*", [{ grammaticalData: [], ending: "*" }]]])
    );
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
        const ending = result.ending === "*" ? "" : result.ending;
        const form = result.stem.stem + ending;
        const inflectionEndings = checkPresent(
          inflectionLookup.get(result.stem.inflection)?.get(result.ending)
        );
        for (const inflection of inflectionEndings) {
          assertEqual(inflection.ending, result.ending);
          const grammaticalData = inflection.grammaticalData.concat(
            result.stem.other ?? []
          );
          byForm.add(form, {
            inflection: grammaticalData.join(" "),
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

// console.log(JSON.stringify(MorceusCruncher.make()("illic"), undefined, 2));
