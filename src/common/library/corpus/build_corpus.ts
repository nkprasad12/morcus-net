import { assert } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  writeCorpusToFile,
  type CorpusInputWork,
  type LatinCorpusIndex,
} from "@/common/library/corpus/corpus_common";
import { processTokens } from "@/common/text_cleaning";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  CruncherOptions,
  type LatinWordAnalysis,
} from "@/morceus/cruncher_types";

/**
 * Absorbs the given work in the corpus.
 *
 * @param work The processed work to absorb.
 * @param corpus The corpus to absorb the work into.
 * @param startId The last ID used in the corpus (not used here, but kept
 */
function absorbWork(
  work: CorpusInputWork,
  corpus: LatinCorpusIndex,
  getInflections: (word: string) => LatinWordAnalysis[],
  startId: number
): number {
  const wordIndex = arrayMap(corpus.indices.word);
  const lemmaIndex = arrayMap(corpus.indices.lemma);
  corpus.workRowRanges.push([corpus.workIds.length, []]);
  corpus.workIds.push(work.id);
  let wordsInWork = 0;
  let currentId = startId;

  assert(work.rows.length > 0, "Work must have at least one row.");
  work.rows.forEach((rowText, rowIdx) => {
    const rowStartId = currentId;
    for (const [token, isWord] of processTokens(rowText)) {
      if (!isWord) {
        currentId += 1;
        continue;
      }
      const normalized = token.toLowerCase();
      wordIndex.add(normalized, currentId);
      const lemmata = getInflections(normalized).map((d) => d.lemma);
      for (const lemma of Array.from(new Set(lemmata))) {
        lemmaIndex.add(lemma, currentId);
      }
      wordsInWork += 1;
      currentId += 1;
    }
    corpus.workRowRanges[corpus.workRowRanges.length - 1][1].push([
      rowIdx,
      rowStartId,
      currentId,
    ]);
  });
  corpus.stats.totalWords += wordsInWork;
  corpus.stats.totalWorks += 1;
  return currentId;
}

export function buildCorpus(iterableWorks: Iterable<CorpusInputWork>) {
  const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
  const startTime = Date.now();
  const getInflections = (word: string) =>
    cruncher(word, CruncherOptions.DEFAULT);
  let tokenId = 0;
  const corpus: LatinCorpusIndex = {
    workIds: [],
    workRowRanges: [],
    indices: {
      word: new Map<string, number[]>(),
      lemma: new Map<string, number[]>(),
    },
    stats: { totalWords: 0, totalWorks: 0, uniqueWords: 0, uniqueLemmata: 0 },
  };
  for (const work of iterableWorks) {
    tokenId = absorbWork(work, corpus, getInflections, tokenId);
    // Avoid accidentally finding matches from the end of one work
    // and the start of another.
    tokenId += 100;
  }
  corpus.stats.uniqueWords = corpus.indices.word.size;
  corpus.stats.uniqueLemmata = corpus.indices.lemma.size;

  writeCorpusToFile(corpus);
  console.log(`Corpus stats:`, corpus.stats);
  console.log(`Corpus indexing runtime: ${Date.now() - startTime}ms`);
}
