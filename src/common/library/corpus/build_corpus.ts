import { assert } from "@/common/assert";
import {
  writeCorpusToFile,
  type CorpusInputWork,
  type LatinCorpusIndex,
} from "@/common/library/corpus/corpus_common";
import { processTokens } from "@/common/text_cleaning";

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
  startId: number
): number {
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
      if (!corpus.reverseIndex.has(normalized)) {
        corpus.reverseIndex.set(normalized, []);
      }
      corpus.reverseIndex.get(normalized)!.push(currentId);
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
  const startTime = Date.now();
  let tokenId = 0;
  const corpus: LatinCorpusIndex = {
    workIds: [],
    workRowRanges: [],
    reverseIndex: new Map(),
    stats: { totalWords: 0, totalWorks: 0, uniqueWords: 0 },
  };
  for (const work of iterableWorks) {
    tokenId = absorbWork(work, corpus, tokenId);
    // Avoid accidentally finding matches from the end of one work
    // and the start of another.
    tokenId += 100;
  }
  corpus.stats.uniqueWords = corpus.reverseIndex.size;
  writeCorpusToFile(corpus);
  console.log(`Corpus stats:`, corpus.stats);
  console.log(`Corpus indexing runtime: ${Date.now() - startTime}ms`);
}
