import fs from "fs";
import path from "path";
import {
  writeCorpus,
  loadCorpus,
} from "@/common/library/corpus/corpus_serialization";
import { type InProgressLatinCorpus } from "@/common/library/corpus/corpus_common";
import { PackedReverseIndex } from "@/common/library/corpus/packed_reverse_index";

console.debug = jest.fn();

const TEST_CORPUS_FILE = path.join(__dirname, "test_latin_corpus.json");

const WHATEVER_ARRAY = [2, 6, 17, 21, 35, 67];

function getTestCorpus(): InProgressLatinCorpus {
  return {
    workLookup: [["work1", ["row1", "row2"]]],
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
        ["whatever", WHATEVER_ARRAY],
      ]),
      lemma: new Map([["amare", [0, 1, 2]]]),
      case: {} as any,
      number: {} as any,
      gender: {} as any,
      tense: {} as any,
      person: {} as any,
      mood: {} as any,
      voice: {} as any,
    },
    maxTokenId: 67,
    stats: {
      totalWords: 4,
      totalWorks: 1,
      uniqueWords: 2,
      uniqueLemmata: 1,
    },
  };
}

describe("writeCorpus and loadCorpus", () => {
  afterEach(() => {
    if (fs.existsSync(TEST_CORPUS_FILE)) {
      fs.unlinkSync(TEST_CORPUS_FILE);
    }
  });

  it("writes and loads a corpus index correctly", () => {
    const corpus = getTestCorpus();
    writeCorpus(corpus, TEST_CORPUS_FILE);
    expect(fs.existsSync(TEST_CORPUS_FILE)).toBe(true);

    const loaded = loadCorpus(TEST_CORPUS_FILE);
    expect(loaded.workLookup).toEqual(corpus.workLookup);
    expect(loaded.workRowRanges).toEqual(corpus.workRowRanges);
    expect(loaded.stats).toEqual(corpus.stats);

    // Check that Maps are restored to PackedReverseIndex
    expect(loaded.indices.word).toBeInstanceOf(PackedReverseIndex);
    expect(loaded.indices.word.get("amo")).toEqual([0, 1]);
    expect(loaded.indices.lemma).toBeInstanceOf(PackedReverseIndex);
    expect(loaded.indices.lemma.get("amare")).toEqual([0, 1, 2]);
    expect(loaded.indices.word.get("whatever")).toEqual(WHATEVER_ARRAY);
  });
});
