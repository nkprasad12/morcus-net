import type {
  GenericReverseIndex,
  PackedIndexData,
} from "@/common/library/corpus/corpus_common";

export class PackedReverseIndex<T> implements GenericReverseIndex<T> {
  constructor(private readonly packedMap: Map<T, PackedIndexData>) {}

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
