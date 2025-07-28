import type {
  CorpusQuery,
  CorpusQueryPart,
  CorpusQueryResult,
  LatinCorpusIndex,
} from "@/common/library/corpus/corpus_common";
import { exhaustiveGuard } from "@/common/misc_utils";

export class CorpusQueryEngine {
  constructor(private readonly corpus: LatinCorpusIndex<number[]>) {}

  resolveToken(tokenId: number): CorpusQueryResult {
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
        return {
          workId,
          section: rowIds[rowIdx],
          offset: tokenId - startTokenId,
        };
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

  private resolveQueryPart(part: CorpusQueryPart): number[] {
    if ("word" in part) {
      return this.corpus.indices.word.get(part.word.toLowerCase()) ?? [];
    } else if ("lemma" in part) {
      return this.corpus.indices.lemma.get(part.lemma) ?? [];
    }
    exhaustiveGuard(part);
  }

  queryCorpus(query: CorpusQuery): CorpusQueryResult[] {
    if (query.parts.length === 0) {
      return [];
    }
    let matches = this.resolveQueryPart(query.parts[0]);
    for (let i = 1; i < query.parts.length; i++) {
      const partMatches = new Set(
        this.resolveQueryPart(query.parts[i]).map((t) => t - 2 * i)
      );
      matches = matches.filter((tokenId) => partMatches.has(tokenId));
    }
    return matches.map((tokenId) => this.resolveToken(tokenId));
  }
}
