import { assertEqual } from "@/common/assert";
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
    return bitmask.length * 32;
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
