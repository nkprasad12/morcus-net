import { assertEqual } from "@/common/assert";
import { unpackIntegers } from "@/common/bytedata/packing";
import type { PackedIndexData } from "@/common/library/corpus/corpus_common";

export function unpackPackedIndexData(
  packedData: PackedIndexData | undefined
): number[] {
  if (packedData === undefined) {
    return [];
  }
  // The default format is a packed array of tokenIds.
  if (!("format" in packedData)) {
    return unpackIntegers(packedData);
  }
  assertEqual(packedData.format, "bitmask");
  // If it's a bitmask, we need to convert it to an array of token IDs.
  const bitmask = packedData.data;
  const result: number[] = [];
  for (let i = 0; i < bitmask.length; i++) {
    const word = bitmask[i];
    if (word === 0) {
      continue; // Skip empty words as an optimization.
    }
    const wordOffset = i * 32;
    for (let j = 0; j < 32; j++) {
      if ((word & (1 << (31 - j))) !== 0) {
        result.push(wordOffset + j);
      }
    }
  }
  return result;
}

export function toBitMask(values: number[], numTokens: number): Uint32Array {
  const bitMask = new Uint32Array(Math.ceil(numTokens / 32));
  for (const value of values) {
    if (value < 0 || value >= numTokens) {
      throw new Error(`Value ${value} out of bounds (numTokens: ${numTokens})`);
    }
    const byteIndex = value >> 5; // value / 32
    const bitIndex = value % 32;
    bitMask[byteIndex] |= 1 << (31 - bitIndex);
  }
  return bitMask;
}
