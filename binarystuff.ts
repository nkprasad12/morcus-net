// Returns a seeded pseudo-random number generator (Mulberry32)
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates an array of unique random non-negative integers in increasing order.
 * @param count Number of integers to generate
 * @param upperBound Exclusive upper bound (max value is upperBound - 1)
 * @param seed Optional seed for reproducibility
 * @returns Sorted array of unique random integers
 */
export function uniqueRandomSortedInts(
  count: number,
  upperBound: number,
  seed?: number
): number[] {
  if (count > upperBound) {
    throw new Error("Count cannot be greater than upperBound.");
  }
  const rand = mulberry32(seed ?? Date.now());
  // Generate [0, 1, ..., upperBound-1]
  const arr = Array.from({ length: upperBound }, (_, i) => i);
  // Fisher-Yates shuffle up to count
  for (let i = 0; i < count; ++i) {
    const j = i + Math.floor(rand() * (upperBound - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result = arr.slice(0, count);
  result.sort((a, b) => a - b);
  return result;
}

/**
 * Given an array of unique, sorted numbers and an upper bound,
 * returns a bitmask as a Uint8Array where the Nth bit is set if N is in the input array.
 * The bitmask covers bits from 0 to upperBound - 1.
 * @param indices Array of unique, sorted numbers
 * @param upperBound Exclusive upper bound (max value is upperBound - 1)
 * @returns Bitmask as a Uint8Array
 */
export function bitmaskFromSortedIndices(
  indices: number[],
  upperBound: number
): Uint8Array {
  if (upperBound < 0) throw new Error("upperBound must be non-negative");
  const byteLen = Math.floor((upperBound - 1) / 8) + 1;
  const mask = new Uint8Array(byteLen);
  for (const n of indices) {
    if (n < 0 || n >= upperBound)
      throw new Error("Index out of range for bitmask");
    const byteIdx = Math.floor(n / 8);
    const bitIdx = n % 8;
    mask[byteIdx] |= 1 << bitIdx;
  }
  return mask;
}

const POW_2_24 = Math.pow(2, 24);

interface DataArray {
  bitmask: Uint8Array;
  indices: number[];
  upperBound: number;
  numElements: number;
}

function createDataArray(
  count: number,
  upperBound: number = POW_2_24,
  seed?: number
): DataArray {
  const indices = uniqueRandomSortedInts(count, upperBound, seed);
  const bitmask = bitmaskFromSortedIndices(indices, upperBound);
  return { bitmask, indices, upperBound, numElements: count };
}

function computeAnd_indicesAndIndices(
  first: number[],
  second: number[]
): number[] {
  const result: number[] = [];
  let i = 0,
    j = 0;
  while (i < first.length && j < second.length) {
    if (first[i] < second[j]) {
      i++;
    } else if (first[i] > second[j]) {
      j++;
    } else {
      result.push(first[i]);
      i++;
      j++;
    }
  }
  return result;
}

function computeAnd_indicesAndIndices_usingSet(
  first: number[],
  second: number[]
): number[] {
  const firstSet = new Set(first);
  return second.filter((value) => firstSet.has(value));
}

function computeAnd_bitmaskAndBitmask(
  first: Uint8Array,
  second: Uint8Array
): Uint8Array {
  if (first.length !== second.length) {
    throw new Error("Bitmasks must be of the same length");
  }
  const result = new Uint8Array(first.length);
  for (let i = 0; i < first.length; i++) {
    result[i] = first[i] & second[i];
  }
  return result;
}

function computeAnd_bitmaskAndBitmask_asUint32(
  first8: Uint8Array,
  second8: Uint8Array
): Uint8Array {
  if (first8.length !== second8.length) {
    throw new Error("Bitmasks must be of the same length");
  }
  const first = new Uint32Array(first8.buffer);
  const second = new Uint32Array(second8.buffer);
  const result = new Uint32Array(first8.length / 4);
  for (let i = 0; i < first.length; i++) {
    result[i] = first[i] & second[i];
  }
  return new Uint8Array(result.buffer);
}

/**
 * Checks whether two Uint8Array instances have the same underlying value.
 * @param a First Uint8Array
 * @param b Second Uint8Array
 * @returns true if equal, false otherwise
 */
export function bitmaskEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function createRandomDataArrays(num: number, seed = 42): DataArray[] {
  return Array.from({ length: num }, (_, i) =>
    createDataArray(POW_2_24 / 32, POW_2_24, seed + i)
  );
}

function validateAndFunctions() {
  const data = createRandomDataArrays(2);

  const andIndices = computeAnd_indicesAndIndices(
    data[0].indices,
    data[1].indices
  );
  const andIndicesBitmask = bitmaskFromSortedIndices(
    andIndices,
    data[0].upperBound
  );
  const and8Bit = computeAnd_bitmaskAndBitmask(
    data[0].bitmask,
    data[1].bitmask
  );
  const and32Bit = computeAnd_bitmaskAndBitmask_asUint32(
    data[0].bitmask,
    data[1].bitmask
  );
  console.log(bitmaskEquals(andIndicesBitmask, and8Bit));
  console.log(bitmaskEquals(andIndicesBitmask, and32Bit));
}

function profileStuff() {
  const data = createRandomDataArrays(2);
  const start = performance.now();
  let last: any = undefined;
  for (let i = 0; i < 100; i++) {
    // last = computeAnd_indicesAndIndices(data[0].indices, data[1].indices);
    last = computeAnd_indicesAndIndices_usingSet(
      data[0].indices,
      data[1].indices
    );
    // last = computeAnd_bitmaskAndBitmask(data[0].bitmask, data[1].bitmask);
    // last =computeAnd_bitmaskAndBitmask_asUint32(data[0].bitmask, data[1].bitmask);
  }
  const elapsed = performance.now() - start;
  console.log(`${elapsed / 100} ms per operation`);
  console.log(`${data[0].upperBound} upper bound`);
  console.log(last.length);
}

profileStuff();

// bun build --outfile=binarystuff.js --minify binarystuff.ts --format=iife && node binarystuff.js
