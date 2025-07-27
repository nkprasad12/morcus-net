import type { LatinCorpusIndex } from "@/common/library/corpus/corpus_common";

export class CorpusQueryEngine {
  corpus: LatinCorpusIndex;
  constructor(corpus: LatinCorpusIndex) {
    this.corpus = corpus;
  }

  resolveWorkAndRow(tokenId: number): [string, string] {
    const workRanges = this.corpus.workRowRanges;

    // Binary search for the work.
    let low = 0;
    let high = workRanges.length - 1;
    let workIdx = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const [, rowData] = workRanges[mid];
      const workStartTokenId = rowData[0][1];
      const workEndTokenId = rowData[rowData.length - 1][2];
      if (tokenId >= workStartTokenId && tokenId < workEndTokenId) {
        workIdx = workRanges[mid][0];
        break;
      } else if (tokenId < workStartTokenId) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    if (workIdx === -1) {
      throw new Error(`TokenId ${tokenId} not found in any work.`);
    }

    const [, rowData] = workRanges[workIdx];

    // Binary search for the row within the found work.
    low = 0;
    high = rowData.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const [, startTokenId, endTokenId] = rowData[mid];

      if (tokenId >= startTokenId && tokenId < endTokenId) {
        const [workId, rowIds] = this.corpus.workLookup[workIdx];
        const rowIdx = rowData[mid][0];
        return [workId, rowIds[rowIdx]];
      } else if (tokenId < startTokenId) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    throw new Error(
      `TokenId ${tokenId} not found in any row for work index ${workIdx}.`
    );
  }

  searchWord(word: string) {
    const matches = this.corpus.indices.word.get(word.toLowerCase());
    if (matches === undefined) {
      return;
    }
    for (const tokenId of matches) {
      const [workId, section] = this.resolveWorkAndRow(tokenId);
      console.log(`work ${workId} at section ${section}`);
    }
  }

  searchLemma(lemma: string) {
    const matches = this.corpus.indices.lemma.get(lemma);
    if (matches === undefined) {
      return;
    }
    for (const tokenId of matches) {
      const [workId, section] = this.resolveWorkAndRow(tokenId);
      console.log(`work ${workId} at section ${section}`);
    }
  }
}
