/* istanbul ignore file */

const N = 10_000_000;

function bitMaskSize(): number {
  return N;
}

function formatBits(numBits: number): string {
  return `${(numBits / 8 / 1024 / 1024).toFixed(2)} MB`;
}

function numArrSize(p: number): number {
  const K = Math.round(N * p);
  return K * Math.ceil(Math.log2(N + 1));
}

function runLengthEncodingBound(p: number): number {
  const K = Math.round(N * p);
  const numRuns = 2 * K + 1;
  // We will record K in the header
  const headerSize = Math.ceil(Math.log2(N + 1));
  // Each run will use 1 bit for the value, and either
  // log K or log N - K for the run length depending on
  // whether the value is 0 or 1.
  const runLengthBitSizeFor1 = Math.ceil(Math.log2(K + 1));
  const runLengthBitSizeFor0 = Math.ceil(Math.log2(N - K + 1));
  return (
    headerSize +
    numRuns +
    K * runLengthBitSizeFor1 +
    (K + 1) * runLengthBitSizeFor0
  );
}

const pVals = [0.0001, 0.001, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5];
for (const p of pVals) {
  console.log(`p: ${p * 100}%`);
  console.log(`- Bitmask size: ${formatBits(bitMaskSize())}`);
  console.log(`- Num array size: ${formatBits(numArrSize(p))}`);
  console.log(
    `- Run-length encoding bound: ${formatBits(runLengthEncodingBound(p))}`
  );
}
