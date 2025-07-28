import { unpackIntegers } from "@/common/bytedata/packing";

export class PackedReverseIndex<T = any> {
  constructor(
    private readonly packedMap: Map<T, Uint8Array>,
    private readonly maxToken: number
  ) {}

  get(key: T): number[] | undefined {
    const packedData = this.packedMap.get(key);
    if (packedData === undefined) {
      return undefined;
    }
    return unpackIntegers(this.maxToken, packedData);
  }
}
