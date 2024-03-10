import { arrayMap } from "@/common/data_structures/collect_map";
import { allStems, type Lemma, type Stem } from "@/morceus/stem_parsing";
import { makeEndIndex, type EndIndexRow } from "@/morceus/tables/indices";

export interface CrunchResult {
  lemma: string;
  ending: string;
  stem: Stem;
}

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

export function crunch(word: string) {
  const endings = makeEndIndex(
    ["src/morceus/tables/lat/core/target"],
    ["src/morceus/tables/lat/core/dependency"]
  );
  const lemmata = allStems();
  return crunchWord(endings, lemmata, word);
}
