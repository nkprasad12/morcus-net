/* istanbul ignore file */

import {
  applyAndWithBitmasks,
  toBitMask,
} from "@/common/library/corpus/corpus_byte_utils";

const POW_2_24 = Math.pow(2, 24);

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

interface DataArray {
  bitmask8: Uint8Array;
  bitmask: Uint32Array;
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
  const bitmask = toBitMask(indices, upperBound);
  const bitmask8 = new Uint8Array(bitmask.buffer);
  return { bitmask, bitmask8, indices, upperBound, numElements: count };
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

function createRandomDataArrays(
  upperBound: number,
  sizes: number[],
  seed = 42
): DataArray[] {
  return Array.from({ length: sizes.length }, (_, i) =>
    createDataArray(sizes[i], upperBound, seed + i)
  );
}

function printDataSummary(times: number[]) {
  function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return NaN;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    const weight = pos - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
  const percentileKeys = [5, 10, 25, 50, 75, 90, 95];
  const percentileLabels = percentileKeys.map((p) => `p${p}`.padEnd(3, " "));
  const percentileValues = percentileKeys.map(
    (p) => percentile(times, p).toFixed(2) + " ms"
  );

  const sortedTimes = times.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t);

  const tail = 5;
  const tailSize = Math.ceil(times.length * (tail / 100));

  const minTail = sortedTimes.slice(0, tailSize);
  const maxTail = sortedTimes.slice(-tailSize);

  console.log(
    `Mean: ${mean.toFixed(2)} ms per iteration [${times.length} iterations]`
  );
  console.log("Percentiles:");
  for (let i = 0; i < percentileKeys.length; i++) {
    console.log(`- ${percentileLabels[i]}: ${percentileValues[i]}`);
  }
  console.log(
    `Min ${tail}%: ${minTail
      .map((x) => x.t.toFixed(2))
      .join(", ")} (indices: ${minTail.map((x) => x.i).join(", ")})`
  );
  console.log(
    `Max ${tail}%: ${maxTail
      .map((x) => x.t.toFixed(2))
      .join(", ")} (indices: ${maxTail.map((x) => x.i).join(", ")})`
  );
}

function runProfiling() {
  const fraction = 1024;
  const sizes = Array(4).fill(POW_2_24 / fraction);
  const data = createRandomDataArrays(POW_2_24, sizes, 42);

  let last: any = undefined;
  const times: number[] = [];
  const reps = 100;

  for (let i = 0; i < reps; i++) {
    const k = (i % 2) * 2;
    const a = data[k];
    const b = data[k + 1];

    const start = performance.now();
    // Add the operation to be measured below
    last = applyAndWithBitmasks(a.bitmask, b.bitmask, 3);
    // Add the operation to be measured above
    times.push(performance.now() - start);
  }

  printDataSummary(times);
  console.log(
    `${POW_2_24} bits (${POW_2_24 / fraction} set), ${last.length} words`
  );
}

runProfiling();

/*
To run:
  bun build --outfile=binarystuff.js --minify src/common/library/corpus/profiling.ts --format=iife \
    && node binarystuff.js && rm binarystuff.js
 */
