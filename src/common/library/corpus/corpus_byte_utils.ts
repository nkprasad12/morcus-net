export function toBitMask(values: number[], numTokens: number): Uint32Array {
  const u32Words = Math.ceil(numTokens / 32);
  // Round up to an even number to ensure we have complete 64-bit pairs for Rust
  const words = u32Words % 2 === 0 ? u32Words : u32Words + 1;
  const bitMask = new Uint32Array(words);

  for (const value of values) {
    if (value < 0 || value >= numTokens) {
      throw new Error(`Value ${value} out of bounds (numTokens: ${numTokens})`);
    }
    const wordIndex = value >> 5; // value / 32
    const bitIndex = value % 32;
    bitMask[wordIndex] |= 1 << bitIndex;
  }
  return bitMask;
}
