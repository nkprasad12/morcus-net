import { assert, assertEqual } from "@/common/assert";

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
