import { assertEqual } from "@/common/assert";
import { unpackIntegers } from "@/common/bytedata/packing";
import type {
  GenericReverseIndex,
  PackedIndexData,
} from "@/common/library/corpus/corpus_common";

export class PackedReverseIndex<T> implements GenericReverseIndex<T> {
  constructor(
    private readonly packedMap: Map<T, PackedIndexData>,
    private readonly maxToken: number
  ) {}

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
      return unpackIntegers(this.maxToken, packedData);
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
