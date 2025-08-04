import { assertEqual } from "@/common/assert";
import { PackedNumbers } from "@/common/bytedata/packing";
import type {
  FilterOptions,
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
    return bitmask.length * 32;
  }

  hasValueInRange(key: T, range: [number, number]): boolean {
    if (range[0] > range[1]) {
      return false;
    }
    const packedData = this.packedMap.get(key);
    if (packedData === undefined) {
      return false;
    }

    if (!("format" in packedData)) {
      return PackedNumbers.hasValueInRange(packedData, range);
    }
    assertEqual(packedData.format, "bitmask");
    const bitmask = packedData.data;
    for (let i = range[0]; i <= range[1]; i++) {
      const byteIndex = i >> 5; // i / 32
      const bitIndex = 31 - (i & 31); // i % 32
      if ((bitmask[byteIndex] & (1 << bitIndex)) !== 0) {
        return true;
      }
    }
    return false;
  }

  filterCandidates(
    key: T,
    candidates: number[],
    options: FilterOptions
  ): number[] {
    const packedData = this.packedMap.get(key);
    if (packedData === undefined) {
      return [];
    }

    const offset = options?.offset ?? 0;
    const maybeNegate = (b: boolean) => (options?.keepMisses ? !b : b);
    if (!("format" in packedData)) {
      // The packed integers are sorted. We can perform a binary search for each
      // candidate without fully unpacking the array.
      return candidates.filter((candidate) => {
        const relativeId = candidate - offset;
        return maybeNegate(
          PackedNumbers.hasValueInRange(packedData, [relativeId])
        );
      });
    }
    assertEqual(packedData.format, "bitmask");
    const bitmask = packedData.data;
    const maxRelativeId = bitmask.length * 32;
    return candidates.filter((candidate) => {
      const relativeId = candidate - offset;
      if (relativeId < 0 || relativeId >= maxRelativeId) {
        return false;
      }
      const byteIndex = relativeId >> 5;
      const bitIndex = 31 - (relativeId & 31);
      return maybeNegate((bitmask[byteIndex] & (1 << bitIndex)) !== 0);
    });
  }

  formatOf(key: T): "bitmask" | undefined {
    const packedData = this.packedMap.get(key);
    if (packedData === undefined || !("format" in packedData)) {
      return undefined;
    }
    return packedData.format;
  }

  get(key: T): PackedIndexData | undefined {
    return this.packedMap.get(key);
  }

  keys(): Iterable<T> {
    return this.packedMap.keys();
  }
}
