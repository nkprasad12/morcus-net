import { assert } from "@/common/assert";

function bitmaskOrWithSelfOffset_InPlace_right(
  data: Uint32Array,
  offset: number
): Uint32Array {
  assert(offset > 0 && offset < 16, "Offset must be in (0, 16).");
  const len = data.length;
  const leftShift = 32 - offset;

  // Handle the first word separately (there's no `last` word here) to avoid
  // range checks and branching in the hot loop.
  let last = data[0];
  data[0] = data[0] | (data[0] >>> offset);
  for (let i = 1; i < len; i++) {
    // Construct the mask, save the current word for the next iteration, and apply the mask.
    // See `applyAndWithBitmasks` for an explanation of the mask construction, with an example.
    const mask = (data[i] >>> offset) | (last << leftShift);
    last = data[i];
    data[i] = data[i] | mask;
  }
  return data;
}

function bitmaskOrWithSelfOffset_InPlace_left(
  data: Uint32Array,
  offset: number
): Uint32Array {
  assert(offset > 0 && offset < 16, "Offset must be in (0, 16).");
  const len = data.length;
  const rightShift = 32 - offset;

  // Handle the first word separately (there's no `last` word here) to avoid
  // range checks and branching in the hot loop.
  let last = data[len - 1];
  data[len - 1] = data[len - 1] | (data[len - 1] << offset);
  for (let i = len - 2; i >= 0; i--) {
    // Construct the mask, save the current word for the next iteration, and apply the mask.
    // See `applyAndWithBitmasks` for an explanation of the mask construction, with an example.
    const mask = (data[i] << offset) | (last >>> rightShift);
    last = data[i];
    data[i] = data[i] | mask;
  }
  return data;
}

/**
 * Applies a bitwise OR operation with a self-offset to the given bitmask data in place.
 * The offset can be positive (right shift) or negative (left shift).
 *
 * The original data is modified in place, and the function returns the modified data.
 *
 * @param data The bitmask data to modify.
 * @param offset The offset to apply, must be in the range (0, 16).
 * @returns The modified data.
 */
export function bitmaskOrWithSelfOffset_InPlace(
  data: Uint32Array,
  offset: number
): Uint32Array {
  return offset > 0
    ? bitmaskOrWithSelfOffset_InPlace_right(data, offset)
    : bitmaskOrWithSelfOffset_InPlace_left(data, -offset);
}
