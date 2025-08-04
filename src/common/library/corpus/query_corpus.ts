import { assert, assertEqual, checkPresent } from "@/common/assert";
import { packIntegers } from "@/common/bytedata/packing";
import {
  applyAndToIndices,
  hasValueInRange,
  unpackPackedIndexData,
} from "@/common/library/corpus/corpus_byte_utils";
import type {
  CorpusQuery,
  CorpusQueryAtom,
  CorpusQueryResult,
  LatinCorpusIndex,
  PackedBitMask,
  PackedIndexData,
} from "@/common/library/corpus/corpus_common";
import { exhaustiveGuard } from "@/common/misc_utils";
import { ReadOnlyDb } from "@/common/sql_helper";
import { SqliteDb } from "@/common/sqlite/sql_db";

interface InternalQueryAtom {
  atom: CorpusQueryAtom;
  sizeUpperBound: number;
}
interface InternalComposedQuery {
  composition: "only";
  atoms: InternalQueryAtom[];
  sizeUpperBound: number;
  position: number;
}
type InternalQuery = InternalComposedQuery[];

interface IntermediateResult<T = PackedIndexData> {
  data: T;
  position: number;
}

const MAX_QUERY_PARTS = 8;
const MAX_QUERY_ATOMS = 8;

function toPackedIndexData(data: PackedBitMask | number[]): PackedIndexData {
  if (!Array.isArray(data)) {
    return data;
  }
  return packIntegers(data[data.length - 1] + 1, data);
}

function checkQueryComplexity(query: CorpusQuery): void {
  assert(
    query.parts.length <= MAX_QUERY_PARTS,
    `Query length ${query.parts.length} exceeds maximum of ${MAX_QUERY_PARTS}.`
  );
  for (const part of query.parts) {
    if (!("atoms" in part)) {
      continue;
    }
    assert(
      part.atoms.length <= MAX_QUERY_ATOMS,
      `Query part length ${part.atoms.length} exceeds maximum of ${MAX_QUERY_ATOMS}.`
    );
  }
}

export class CorpusQueryEngine {
  private readonly tokenDb: SqliteDb;

  constructor(private readonly corpus: LatinCorpusIndex) {
    this.tokenDb = ReadOnlyDb.getDatabase(this.corpus.rawTextDb);
  }

  private resolveResult(
    tokenId: number,
    queryLength: number
  ): CorpusQueryResult {
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

        // @ts-expect-error
        const rows: { token: string; break: string }[] = this.tokenDb
          .prepare(`SELECT * FROM raw_text WHERE rowid >= ? LIMIT ?`)
          .all(tokenId, queryLength);
        const result: string[] = [];
        for (let i = 0; i < queryLength; i++) {
          result.push(rows[i].token);
          if (i < queryLength - 1) {
            result.push(rows[i].break);
          }
        }
        return {
          workId,
          section: rowIds[rowIdx].join("."),
          offset: tokenId - startTokenId,
          text: result.join(""),
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

  private getAllMatchesFor(part: CorpusQueryAtom): PackedIndexData | undefined {
    if ("word" in part) {
      return this.corpus.indices.word.get(part.word.toLowerCase());
    } else if ("lemma" in part) {
      return this.corpus.indices.lemma.get(part.lemma);
    } else if ("category" in part) {
      const index = checkPresent(this.corpus.indices[part.category]);
      // @ts-ignore
      return index.get(part.value);
    }
    exhaustiveGuard(part);
  }

  private filterCandidatesOn(
    candidates: IntermediateResult,
    query: CorpusQueryAtom,
    queryPartPosition: number
  ): IntermediateResult | undefined {
    const filterData = this.getAllMatchesFor(query);
    if (filterData === undefined) {
      return undefined;
    }
    const intersection = applyAndToIndices(
      candidates.data,
      candidates.position,
      filterData,
      queryPartPosition
    );

    return {
      data: toPackedIndexData(intersection[0]),
      position: intersection[1],
    };
  }

  private getUpperSizeBoundForAtom(atom: CorpusQueryAtom): number {
    if ("word" in atom) {
      return this.corpus.indices.word.sizeUpperBoundFor(
        atom.word.toLowerCase()
      );
    } else if ("lemma" in atom) {
      return this.corpus.indices.lemma.sizeUpperBoundFor(atom.lemma);
    } else if ("category" in atom) {
      const index = checkPresent(this.corpus.indices[atom.category]);
      // @ts-expect-error
      return index.sizeUpperBoundFor(atom.value);
    }
    exhaustiveGuard(atom);
  }

  private convertQueryAtom(atom: CorpusQueryAtom): InternalQueryAtom {
    const sizeUpperBound = this.getUpperSizeBoundForAtom(atom);
    return { atom, sizeUpperBound };
  }

  private convertQuery(query: CorpusQuery): InternalQuery {
    const convertedQuery: InternalQuery = [];
    for (let i = 0; i < query.parts.length; i++) {
      const part = query.parts[i];
      if (!("atoms" in part)) {
        convertedQuery.push({
          atoms: [this.convertQueryAtom(part)],
          composition: "only",
          sizeUpperBound: this.getUpperSizeBoundForAtom(part),
          position: i,
        });
        continue;
      }
      if (part.composition === "and") {
        for (const atom of part.atoms) {
          convertedQuery.push({
            atoms: [this.convertQueryAtom(atom)],
            composition: "only",
            sizeUpperBound: this.getUpperSizeBoundForAtom(atom),
            position: i,
          });
        }
        continue;
      }
      exhaustiveGuard(part.composition);
    }
    return convertedQuery;
  }

  private executeInitialPart(
    part: InternalComposedQuery
  ): IntermediateResult | undefined {
    if (part.composition === "only") {
      assert(part.atoms.length === 1);
      const data = this.getAllMatchesFor(part.atoms[0].atom);
      if (data === undefined) {
        return undefined;
      }
      return { data, position: part.position };
    }
    exhaustiveGuard(part.composition);
  }

  queryCorpus(query: CorpusQuery): CorpusQueryResult[] {
    if (query.parts.length === 0) {
      return [];
    }
    checkQueryComplexity(query);

    const sortedQuery = this.convertQuery(query).sort(
      (a, b) => a.sizeUpperBound - b.sizeUpperBound
    );
    let candidates = this.executeInitialPart(sortedQuery[0]);
    if (candidates === undefined) {
      return [];
    }
    for (let i = 1; i < sortedQuery.length; i++) {
      const part = sortedQuery[i];
      if (part.composition === "only") {
        assertEqual(part.atoms.length, 1);
        candidates = this.filterCandidatesOn(
          candidates,
          part.atoms[0].atom,
          part.position
        );
        if (candidates === undefined) {
          return [];
        }
        continue;
      }
      exhaustiveGuard(part.composition);
    }
    const hardBreaks = checkPresent(this.corpus.indices.breaks.get("hard"));
    const results: CorpusQueryResult[] = [];
    for (const tokenId of unpackPackedIndexData(candidates.data)) {
      const trueId = tokenId - candidates.position;
      if (trueId < 0 || trueId >= this.corpus.stats.totalWords) {
        continue;
      }
      if (query.parts.length > 1) {
        // -2 because a hard break after the last token isn't counted
        // (the first -1) and the second -1 is because the range is inclusive.
        const range: [number, number] = [
          tokenId,
          tokenId + query.parts.length - 2,
        ];
        if (hasValueInRange(hardBreaks, range)) {
          continue;
        }
      }
      results.push(this.resolveResult(trueId, query.parts.length));
    }
    return results;
  }
}
