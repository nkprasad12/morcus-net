/**
 * Writes the corpus word vocabulary (`latin_corpus_vocab.bin`), which the Rust
 * engine reads as a `SortedVocab`.
 *
 * This must match `corpus_rust/src/sorted_vocab/binary_format.rs` (the layout)
 * and `corpus_rust/src/sorted_vocab/jump_table.rs` (the buckets) byte for
 * byte; see the docs there. In short, all little-endian:
 *
 * `"MVCB"` | version `u32` | `V` `u32` | `forward_jump` `u32[J + 1]` |
 * `suffix_jump` `u32[J + 1]` | `text_offsets` `u32[V + 1]` |
 * `by_suffix` `u32[V]` | `postings_offsets` `u32[V + 1]` | UTF-8 text.
 *
 * Words are compared as UTF-8 bytes (never as JS UTF-16 strings, which order
 * astral characters differently), and their IDs are their sorted positions.
 */

const MAGIC = "MVCB";
const VERSION = 1;
export const NUM_BUCKETS = 757;
const HEADER_BYTES = 12;
const LOW_BUCKET = 1;
const FIRST_LETTER_BUCKET = 2;
const SUB_BUCKETS = 29;
const HIGH_BUCKET = NUM_BUCKETS - 1;
const LOWER_A = 0x61;
const LOWER_Z = 0x7a;

/**
 * The jump-table bucket of a key, given its first two bytes (`undefined` if
 * the key is shorter). Mirrors `bucket` in `jump_table.rs`.
 */
export function vocabBucket(
  b0: number | undefined,
  b1: number | undefined
): number {
  if (b0 === undefined) {
    return 0;
  }
  if (b0 < LOWER_A) {
    return LOW_BUCKET;
  }
  if (b0 > LOWER_Z) {
    return HIGH_BUCKET;
  }
  let sub: number;
  if (b1 === undefined) {
    sub = 0;
  } else if (b1 < LOWER_A) {
    sub = 1;
  } else if (b1 > LOWER_Z) {
    sub = SUB_BUCKETS - 1;
  } else {
    sub = 2 + (b1 - LOWER_A);
  }
  return FIRST_LETTER_BUCKET + SUB_BUCKETS * (b0 - LOWER_A) + sub;
}

export function compareReversed(a: Uint8Array, b: Uint8Array): number {
  let i = a.length - 1;
  let j = b.length - 1;
  for (; i >= 0 && j >= 0; i--, j--) {
    if (a[i] !== b[j]) {
      return a[i] - b[j];
    }
  }
  return a.length - b.length;
}

/**
 * Sorts a word table's keys by their UTF-8 bytes. Returns the sorted words and,
 * for each new (sorted) ID, the word's ID in `idTable`.
 */
export function sortWordTable(idTable: Map<string, number>): {
  words: string[];
  oldIds: number[];
} {
  const entries = Array.from(idTable.entries()).map(
    ([word, id]) => [word, Buffer.from(word, "utf8"), id] as const
  );
  entries.sort((a, b) => Buffer.compare(a[1], b[1]));
  return {
    words: entries.map(([word]) => word),
    oldIds: entries.map(([, , id]) => id),
  };
}

function jumpTable(buckets: Iterable<number>): Uint32Array {
  const jump = new Uint32Array(NUM_BUCKETS + 1);
  for (const b of buckets) {
    jump[b + 1] += 1;
  }
  for (let k = 1; k < jump.length; k++) {
    jump[k] += jump[k - 1];
  }
  return jump;
}

function* forwardBuckets(words: Buffer[]): Generator<number> {
  for (const w of words) {
    yield vocabBucket(w[0], w[1]);
  }
}

function* reversedBuckets(words: Buffer[]): Generator<number> {
  for (const w of words) {
    yield vocabBucket(w[w.length - 1], w[w.length - 2]);
  }
}

/**
 * Encodes the vocabulary file. `sortedWords` must be strictly increasing by
 * UTF-8 bytes (see `sortWordTable`); `postingsOffsets` has one more entry than
 * there are words, non-decreasing: word `i`'s postings are elements
 * `postingsOffsets[i]` to `postingsOffsets[i + 1]` of the word postings.
 */
export function encodeVocab(
  sortedWords: string[],
  postingsOffsets: Uint32Array
): Buffer {
  const words = sortedWords.map((w) => Buffer.from(w, "utf8"));
  const v = words.length;
  if (v > 0xffffffff) {
    throw new Error(`Too many words for the vocabulary: ${v}`);
  }
  for (let i = 1; i < v; i++) {
    if (Buffer.compare(words[i - 1], words[i]) >= 0) {
      throw new Error(
        `Vocabulary words ${i - 1} and ${i} are not strictly increasing`
      );
    }
  }
  if (postingsOffsets.length !== v + 1) {
    throw new Error(
      `Expected ${v + 1} postings offsets, got ${postingsOffsets.length}`
    );
  }
  for (let i = 1; i <= v; i++) {
    if (postingsOffsets[i - 1] > postingsOffsets[i]) {
      throw new Error("Postings offsets are not non-decreasing");
    }
  }

  const textOffsets = new Uint32Array(v + 1);
  let textLen = 0;
  for (let i = 0; i < v; i++) {
    textLen += words[i].length;
    if (textLen > 0xffffffff) {
      throw new Error("Vocabulary text is too long");
    }
    textOffsets[i + 1] = textLen;
  }
  const bySuffix = new Uint32Array(v);
  for (let i = 0; i < v; i++) {
    bySuffix[i] = i;
  }
  bySuffix.sort((a, b) => compareReversed(words[a], words[b]));
  const tables = [
    jumpTable(forwardBuckets(words)),
    jumpTable(reversedBuckets(words)),
    textOffsets,
    bySuffix,
    postingsOffsets,
  ];

  const tableBytes = tables.reduce((n, t) => n + 4 * t.length, 0);
  const out = Buffer.alloc(HEADER_BYTES + tableBytes + textLen);
  out.write(MAGIC, 0, "latin1");
  out.writeUInt32LE(VERSION, 4);
  out.writeUInt32LE(v, 8);
  let offset = HEADER_BYTES;
  for (const table of tables) {
    for (const x of table) {
      out.writeUInt32LE(x, offset);
      offset += 4;
    }
  }
  for (const w of words) {
    w.copy(out, offset);
    offset += w.length;
  }
  return out;
}
