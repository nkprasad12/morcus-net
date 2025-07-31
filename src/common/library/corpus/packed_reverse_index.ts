import { assertEqual } from "@/common/assert";
import { unpackIntegers } from "@/common/bytedata/packing";
import type {
  GenericReverseIndex,
  PackedIndexData,
} from "@/common/library/corpus/corpus_common";

export class PackedReverseIndex<T> implements GenericReverseIndex<T> {
  constructor(
    private readonly packedMap: Map<T, PackedIndexData>,
    /** A strict upper bound on the numbers that can be in the index. */
    private readonly upperBound: number
  ) {}

  sizeUpperBoundFor(key: T): number {
    const packedData = this.packedMap.get(key);
    if (packedData === undefined) {
      return 0;
    }
    if (!("format" in packedData)) {
      const packingSize = Math.ceil(Math.log2(this.upperBound));
      return (packedData.length * 8) / packingSize;
    }
    assertEqual(packedData.format, "bitmask");
    const bitmask = packedData.data;
    return bitmask.length * 8;
  }

  filterCandidates(key: T, candidates: number[], offset: number): number[] {
    const packedData = this.packedMap.get(key);
    if (packedData === undefined) {
      return [];
    }
    if (!("format" in packedData)) {
      const matches = new Set(
        unpackIntegers(this.upperBound, packedData).map((x) => x + offset)
      );
      return candidates.filter((x) => matches.has(x));
    }
    assertEqual(packedData.format, "bitmask");
    const bitmask = packedData.data;
    const maxRelativeId = bitmask.length * 8;
    return candidates.filter((candidate) => {
      const relativeId = candidate - offset;
      if (relativeId < 0 || relativeId >= maxRelativeId) {
        return false;
      }
      const byteIndex = relativeId >> 3;
      const bitIndex = relativeId & 7;
      return (bitmask[byteIndex] & (1 << bitIndex)) !== 0;
    });
  }

  formatOf(key: T): "bitmask" | undefined {
    const packedData = this.packedMap.get(key);
    if (packedData === undefined || !("format" in packedData)) {
      return undefined;
    }
    return packedData.format;
  }

  get(key: T): number[] | undefined {
    const packedData = this.packedMap.get(key);
    if (packedData === undefined) {
      return undefined;
    }
    // The default format is a packed array of tokenIds.
    if (!("format" in packedData)) {
      return unpackIntegers(this.upperBound, packedData);
    }
    assertEqual(packedData.format, "bitmask");
    // If it's a bitmask, we need to convert it to an array of token IDs.
    const bitmask = packedData.data;
    const result: number[] = [];
    for (let i = 0; i < bitmask.length * 8; i++) {
      if ((bitmask[i >> 3] & (1 << (i & 7))) !== 0) {
        result.push(i);
      }
    }
    return result;
  }

  keys(): Iterable<T> {
    return this.packedMap.keys();
  }
}
