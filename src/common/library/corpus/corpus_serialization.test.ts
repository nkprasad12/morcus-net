import fs from "fs";
import path from "path";
import {
  writeCorpus,
  loadCorpus,
} from "@/common/library/corpus/corpus_serialization";
import {
  CORPUS_FILE,
  type InProgressLatinCorpus,
} from "@/common/library/corpus/corpus_common";
import { unpackPackedIndexData } from "@/common/library/corpus/corpus_byte_utils";

console.debug = jest.fn();

const TEST_CORPUS_DIR = path.join(__dirname, "test_latin_corpus");

const LONG_ARRAY = [2, 6, 17, 21, 23, 27, 35, 48, 59, 60, 61, 62];

function getTestCorpus(): InProgressLatinCorpus {
  return {
    workLookup: [
      [
        "work1",
        [["row1"], ["row2"]],
        { name: "Test Work", author: "Test Author" },
      ],
    ],
    workRowRanges: [
      [
        0,
        [
          [0, 0, 2],
          [1, 2, 4],
        ],
      ],
    ],
    indices: {
      word: new Map([
        ["amo", [0, 1]],
        ["amas", [2]],
        ["commonWord", LONG_ARRAY],
      ]),
      lemma: new Map([["amare", [0, 1, 2]]]),
      breaks: {} as any,
      case: {} as any,
      number: {} as any,
      gender: {} as any,
      tense: {} as any,
      person: {} as any,
      mood: {} as any,
      voice: {} as any,
    },
    numTokens: 63,
    stats: {
      totalWords: 4,
      totalWorks: 1,
      uniqueWords: 2,
      uniqueLemmata: 1,
    },
    rawTextDb: "placeholder.db",
  };
}

describe("writeCorpus and loadCorpus", () => {
  afterEach(() => {
    if (fs.existsSync(TEST_CORPUS_DIR)) {
      fs.rmdirSync(TEST_CORPUS_DIR, { recursive: true });
    }
  });

  it("writes and loads a corpus index correctly", () => {
    const corpus = getTestCorpus();
    writeCorpus(corpus, TEST_CORPUS_DIR);
    const indexPath = path.join(TEST_CORPUS_DIR, CORPUS_FILE);
    expect(fs.existsSync(indexPath)).toBe(true);

    const loaded = loadCorpus(TEST_CORPUS_DIR);
    expect(loaded.workLookup).toEqual(corpus.workLookup);
    expect(loaded.workRowRanges).toEqual(corpus.workRowRanges);
    expect(loaded.stats).toEqual(corpus.stats);

    expect(loaded.indices.word).toBeInstanceOf(Map);
    expect(loaded.indices.lemma).toBeInstanceOf(Map);

    expect(unpackPackedIndexData(loaded.indices.word.get("amo"))).toEqual([
      0, 1,
    ]);
    expect(loaded.indices.word.get("amo")).toBeInstanceOf(Uint8Array);

    expect(unpackPackedIndexData(loaded.indices.lemma.get("amare"))).toEqual([
      0, 1, 2,
    ]);
    expect(loaded.indices.lemma.get("amare")).toBeInstanceOf(Uint8Array);

    expect(
      unpackPackedIndexData(loaded.indices.word.get("commonWord"))
    ).toEqual(LONG_ARRAY);
    expect(loaded.indices.word.get("commonWord")).toEqual(
      expect.objectContaining({ format: "bitmask" })
    );
  });
});
