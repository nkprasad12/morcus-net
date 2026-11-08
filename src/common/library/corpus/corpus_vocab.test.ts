import {
  NUM_BUCKETS,
  compareReversed,
  encodeVocab,
  sortWordTable,
  vocabBucket,
} from "@/common/library/corpus/corpus_vocab";

const HEADER_BYTES = 12;
const TABLE_BYTES = 4 * (NUM_BUCKETS + 1);

function u32At(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function u32Array(buffer: Buffer, offset: number, length: number): number[] {
  return Array.from({ length }, (_, i) => u32At(buffer, offset + 4 * i));
}

function bucketOf(word: string): number {
  const bytes = Buffer.from(word, "utf8");
  return vocabBucket(bytes[0], bytes[1]);
}

describe("vocabBucket", () => {
  test("matches the Rust bucket formula", () => {
    expect(bucketOf("")).toBe(0);
    expect(bucketOf("!")).toBe(1);
    expect(bucketOf("0abc")).toBe(1);
    expect(bucketOf("A")).toBe(1);
    expect(bucketOf("a")).toBe(2);
    expect(bucketOf("a-")).toBe(3);
    expect(bucketOf("aa")).toBe(4);
    expect(bucketOf("az")).toBe(29);
    expect(bucketOf("aā")).toBe(30);
    expect(bucketOf("b")).toBe(31);
    expect(bucketOf("zz")).toBe(2 + 29 * 25 + 27);
    expect(bucketOf("zā")).toBe(755);
    expect(bucketOf("{")).toBe(756);
    expect(bucketOf("ā")).toBe(756);
  });

  test("is monotonic in UTF-8 byte order", () => {
    const keys: Buffer[] = [Buffer.alloc(0)];
    for (let b0 = 0; b0 < 256; b0++) {
      keys.push(Buffer.from([b0]));
      for (let b1 = 0; b1 < 256; b1++) {
        keys.push(Buffer.from([b0, b1]));
      }
    }
    keys.sort(Buffer.compare);
    const buckets = keys.map((k) => vocabBucket(k[0], k[1]));
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i - 1]).toBeLessThanOrEqual(buckets[i]);
    }
    expect(new Set(buckets).size).toBe(NUM_BUCKETS);
  });
});

describe("compareReversed", () => {
  test("orders by reversed bytes, shorter first on ties", () => {
    const cmp = (a: string, b: string) =>
      Math.sign(compareReversed(Buffer.from(a), Buffer.from(b)));
    expect(cmp("ratio", "oratio")).toBe(-1);
    expect(cmp("amo", "bello")).toBe(1);
    expect(cmp("que", "que")).toBe(0);
    expect(cmp("ab", "b")).toBe(1);
  });
});

describe("sortWordTable", () => {
  test("sorts by UTF-8 bytes, not UTF-16 code units", () => {
    // U+FF21 (EF BC A1) sorts before U+1D400 (F0 9D 90 80) in UTF-8, but
    // after it in UTF-16 (FF21 > D835).
    const table = new Map([
      ["𝐀", 0],
      ["Ａ", 1],
      ["b", 2],
      ["a", 3],
      ["ā", 4],
    ]);
    const { words, oldIds } = sortWordTable(table);
    expect(words).toEqual(["a", "b", "ā", "Ａ", "𝐀"]);
    expect(oldIds).toEqual([3, 2, 4, 1, 0]);
  });
});

describe("encodeVocab", () => {
  test("writes the documented layout", () => {
    const words = ["amo", "amor", "bello"];
    const encoded = encodeVocab(words, new Uint32Array([0, 1, 3, 6]));
    expect(encoded.subarray(0, 4).toString("latin1")).toBe("MVCB");
    expect(u32At(encoded, 4)).toBe(1);
    expect(u32At(encoded, 8)).toBe(3);
    const forward = u32Array(encoded, HEADER_BYTES, NUM_BUCKETS + 1);
    const suffix = u32Array(
      encoded,
      HEADER_BYTES + TABLE_BYTES,
      NUM_BUCKETS + 1
    );
    let offset = HEADER_BYTES + 2 * TABLE_BYTES;
    const textOffsets = u32Array(encoded, offset, 4);
    offset += 16;
    const bySuffix = u32Array(encoded, offset, 3);
    offset += 12;
    const postings = u32Array(encoded, offset, 4);
    offset += 16;
    expect(encoded.subarray(offset).toString("utf8")).toBe("amoamorbello");
    expect(encoded.length).toBe(offset + "amoamorbello".length);

    expect(textOffsets).toEqual([0, 3, 7, 12]);
    // Reversed: "olleb" < "oma" < "roma".
    expect(bySuffix).toEqual([2, 0, 1]);
    expect(postings).toEqual([0, 1, 3, 6]);
    // "am" is bucket 16 and "be" is bucket 37.
    expect(forward[0]).toBe(0);
    expect(forward[16]).toBe(0);
    expect(forward[17]).toBe(2);
    expect(forward[37]).toBe(2);
    expect(forward[38]).toBe(3);
    expect(forward[NUM_BUCKETS]).toBe(3);
    // Reversed "ol" (olleb) is bucket 421, "om" (oma) 422, "ro" (roma) 511.
    expect(suffix[421]).toBe(0);
    expect(suffix[422]).toBe(1);
    expect(suffix[423]).toBe(2);
    expect(suffix[511]).toBe(2);
    expect(suffix[512]).toBe(3);
  });

  test("encodes an empty vocabulary", () => {
    const encoded = encodeVocab([], new Uint32Array([0]));
    // One `text_offsets` and one `postings_offsets` entry.
    expect(encoded.length).toBe(HEADER_BYTES + 2 * TABLE_BYTES + 8);
    expect(u32At(encoded, 8)).toBe(0);
  });

  test("keeps every u32 table 4-byte aligned before the text", () => {
    const encoded = encodeVocab(["ā", "λ"], new Uint32Array([0, 2, 5]));
    const textStart = encoded.length - Buffer.byteLength("āλ");
    expect(textStart % 4).toBe(0);
  });

  test("rejects unsorted words and bad postings offsets", () => {
    expect(() => encodeVocab(["b", "a"], new Uint32Array(3))).toThrow(
      /strictly increasing/
    );
    expect(() => encodeVocab(["a", "a"], new Uint32Array(3))).toThrow(
      /strictly increasing/
    );
    expect(() => encodeVocab(["a"], new Uint32Array(1))).toThrow(
      /postings offsets/
    );
    expect(() => encodeVocab(["a"], new Uint32Array([2, 1]))).toThrow(
      /non-decreasing/
    );
  });
});
