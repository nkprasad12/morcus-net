import { assert, assertEqual } from "@/common/assert";
import { PackedNumbers, unpackIntegers } from "@/common/bytedata/packing";
import type {
  PackedBitMask,
  PackedIndexData,
} from "@/common/library/corpus/corpus_common";

/**
 * Computes the bitwise AND of two bitmasks with an offset for the second mask.
 *
 * @param first The first bitmask as a Uint8Array.
 * @param second The second bitmask as a Uint8Array. Must have the same length as `first`.
 * @param offset The bit offset to apply to the second bitmask (right shift).
 *
 * @returns A new Uint8Array with the result of the operation. Result[i] = a[i] & b[i + k] for each bit i.
 */
export function applyAndWithBitmasks(
  first: Uint32Array,
  second: Uint32Array,
  offset: number
): Uint32Array {
  assertEqual(first.length, second.length);
  assert(offset >= 0, "Offset must be non-negative.");
  const len = first.length;

  const wordOffset = Math.floor(offset / 32);
  const bitOffset = offset % 32;
  const result = new Uint32Array(len);

  // We have separate paths for byte-aligned offsets and non-byte-aligned offsets.
  // This really only matters for the 0 case, as we likely won't do queries with a
  // 32+ offset.
  if (bitOffset === 0) {
    for (let i = wordOffset; i < len; i++) {
      // i - wordOffset is always >= 0
      result[i] = first[i] & second[i - wordOffset];
    }
    return result;
  }

  const leftShift = 32 - bitOffset;
  // The first few words are 0 or would require range checks
  // to do safely, so handle them outside of the loop and then start
  // with `let i = wordOffset + 1`.
  result[wordOffset] = first[wordOffset] & (second[0] >>> bitOffset);
  for (let i = wordOffset + 1; i < len; i++) {
    const j = i - wordOffset;
    // Suppose we have (with 4 bit words for brevity):
    // 1st: 0110 1010
    // 2nd: 1101 0110
    // For the example below, we will work on the second word (so i = 1)
    // and assume wordOffset is 0 and bitOffset is 2.

    // Get the right `wordSize - bitOffset` bits and move them to the left:
    let mask = second[j] >>> bitOffset;
    //      = 0110 >>> 2 = 0001
    // mask |= second[j] >>> bitOffset;

    // Then get the remaining bits from the previous word:
    mask |= second[j - 1] << leftShift;
    // second[j - 1] << leftShift
    // = 1100 << 2 = 0100
    // Finally, combine them with a bitwise OR:
    // mask |= second[j - 1] << leftShift
    // = 0001 | 0100 = 0101, as expected.

    // NOTE: When assembling the mask, the order seems to matter slightly for performance.
    // Getting the bits from the current word first and then the previous word seems
    // to be ~5% faster than the other way around.
    // This is counterintuitive because it makes the access pattern:
    // - second[0], second[-1], second[1], second[0], ...
    // instead of:
    // - second[-1], second[0], second[0], second[1],
    // but it seems to be faster in practice.
    result[i] = first[i] & mask;
  }
  return result;
}

/**
 * Computes the bitwise AND of two indices with an offset for the second index.
 *
 * @param bitmask The first index as a bitmask.
 * @param indices The second index as an array of tokenIds.
 * @param offset The offset to apply to the second index.
 *
 * @returns A packed array for the result.
 */
export function applyAndWithBitmaskAndArray(
  bitmask: Uint32Array,
  indices: number[],
  offset: number
): number[] {
  const results: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i] + offset;
    if (index < 0 || index >= bitmask.length * 32) {
      continue;
    }
    const byteIndex = index >> 5; // index / 32
    const bitIndex = index & 31; // index % 32
    if ((bitmask[byteIndex] & (1 << (31 - bitIndex))) !== 0) {
      results.push(index);
    }
  }
  return results;
}

/**
 * Returns the numbers that are present in both input arrays, applying an offset to the second array.
 *
 * For example, if the first array is [3, 8, 9], the second array is [1, 8], and the offset is 2,
 * the result will be [3] because 3 is in the first array, and 1 + 2 is in the second array.
 * Note that 8 is not included because 8 + 2 = 10, which is not in the first array.
 *
 * This implementation assumes that both input arrays are sorted in ascending order.
 *
 * @param first The first array of numbers.
 * @param second The second array of numbers.
 * @param offset The offset to apply to the second array.
 *
 * @returns A new array with the "common" elements.
 */
export function applyAndWithArrays(
  first: number[],
  second: number[],
  offset: number
): number[] {
  const result: number[] = [];
  let i = 0;
  let j = 0;

  while (i < first.length && j < second.length) {
    const firstVal = first[i];
    const secondVal = second[j] + offset;
    if (firstVal < secondVal) {
      i++;
    } else if (firstVal > secondVal) {
      j++;
    } else {
      result.push(firstVal);
      i++;
      j++;
    }
  }
  return result;
}

/**
 * Applies an `and` to determine the intersection between two indices.
 * The indices can be either packed arrays or bitmasks.
 *
 * @param first The candidate indices to filter.
 * @param firstPosition The position of the candidates.
 * @param second The filter data to apply.
 * @param secondPosition The position of the filter data.
 *
 * @returns A tuple containing the filtered indices and their position.
 */
export function applyAndToIndices(
  first: PackedIndexData,
  firstPosition: number,
  second: PackedIndexData,
  secondPosition: number
): [PackedBitMask | number[], number] {
  const offset = firstPosition - secondPosition;

  if (!("format" in second)) {
    const unpackedFilterData = unpackIntegers(second);
    if (!("format" in first)) {
      // We have two packed arrays.
      const unpackedCandidates = unpackIntegers(first);
      const overlaps = applyAndWithArrays(
        unpackedCandidates,
        unpackedFilterData,
        offset
      );
      return [overlaps, firstPosition];
    }
    // The candidates are a bitmask, the filter data is a packed array.
    // Notice we negate the offset because in this case the bitmask is
    // what really needs the offset, so the negative offset is equivalent.
    const overlaps = applyAndWithBitmaskAndArray(
      first.data,
      unpackedFilterData,
      offset
    );
    return [overlaps, firstPosition];
  }

  assertEqual(second.format, "bitmask");
  if (!("format" in first)) {
    // The filter data is a bitmask.
    // The candidates are a packed array.
    const unpacked = unpackIntegers(first);
    const overlaps = applyAndWithBitmaskAndArray(
      second.data,
      unpacked,
      -offset
    );
    return [overlaps, secondPosition];
  }
  // We have two bitmasks.
  assertEqual(first.format, "bitmask");
  return [
    {
      format: "bitmask",
      data: applyAndWithBitmasks(
        offset >= 0 ? first.data : second.data,
        offset < 0 ? first.data : second.data,
        offset >= 0 ? offset : -offset
      ),
    },
    offset >= 0 ? firstPosition : secondPosition,
  ];
}

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
  for (let i = 0; i < bitmask.length * 32; i++) {
    const leftShift = 31 - (i & 31); // 31 - (i % 32)
    if ((bitmask[i >> 5] & (1 << leftShift)) !== 0) {
      result.push(i);
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

/**
 * Checks if the given packed index data has any values in the specified range.
 *
 * @param packedData The packed index data to check.
 * @param range The range to check.
 * @returns True if the range contains any values for the packed data, false otherwise.
 */
export function hasValueInRange(
  packedData: PackedIndexData | undefined,
  range: [number, number]
): boolean {
  if (range[0] > range[1]) {
    return false;
  }
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

/**
 * Returns the maximum number of elements that could be in the packed index.
 *
 * @param packedData
 * @returns
 */
export function maxElementsIn(packedData: PackedIndexData | undefined): number {
  if (packedData === undefined) {
    return 0;
  }
  if (!("format" in packedData)) {
    return PackedNumbers.numElements(packedData);
  }
  assertEqual(packedData.format, "bitmask");
  return packedData.numSet ?? packedData.data.length * 32;
}
