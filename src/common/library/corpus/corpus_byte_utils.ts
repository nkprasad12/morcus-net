import { assert, assertEqual } from "@/common/assert";
import { unpackIntegers } from "@/common/bytedata/packing";
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
  // Note: we don't bother bounds checking because array accesses outside of the bounds
  // will return undefined, which acts as 0 for bitwise operations.
  // This is all for performance optimization to minimize the operations per loop.

  if (bitOffset === 0) {
    for (let i = 0; i < len; i++) {
      result[i] = first[i] & second[i + wordOffset];
    }
    return result;
  }

  const rightShift = 32 - bitOffset;
  for (let i = 0; i < len; i++) {
    const j = i + wordOffset;
    let mask = 0;
    // Get the right 32 - bitOffset bits from second[j] and put
    // then in the leftmost bits of mask.
    mask |= second[j] << bitOffset;
    // Get the left bitOffset bits from second[j + 1] and put
    // them in the rightmost bits of mask.
    mask |= second[j + 1] >>> rightShift;
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
    console.log("Array and Bitmask");
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
