import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { buildCorpus } from "@/common/library/corpus/build_corpus";
import { type CorpusInputWork } from "@/common/library/corpus/corpus_common";
import { RustCorpusQueryEngine } from "@/common/library/corpus/corpus_rust";
import fs from "fs";

console.debug = jest.fn();

setupMorceusWithFakeData();

const TEST_CORPUS_DIR = "rust_corpus_integration_test_dir";

const TEST_WORKS: CorpusInputWork[] = [
  {
    id: "test_work_1",
    rows: ["Gallus servum acclamat.", "servus Gallum accognoscit."],
    rowIds: [["1"], ["2"]],
    sectionDepth: 1,
    author: "Author 1",
    workName: "Work 1",
  },
  {
    id: "test_work_2",
    rows: ["rex et regina.", "Gallus regem videt."], // 'rex', 'regina', 'videt' are not in fake data, but good for word-only tests.
    rowIds: [["1"], ["2"]],
    sectionDepth: 1,
    author: "Author 2",
    workName: "Work 2",
  },
];

describe("Corpus Integration Test", () => {
  let queryEngine: RustCorpusQueryEngine;

  beforeAll(() => {
    if (fs.existsSync(TEST_CORPUS_DIR)) {
      fs.rmSync(TEST_CORPUS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CORPUS_DIR, { recursive: true });
    buildCorpus(TEST_WORKS, TEST_CORPUS_DIR);
    queryEngine = new RustCorpusQueryEngine(TEST_CORPUS_DIR);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_CORPUS_DIR)) {
      fs.rmSync(TEST_CORPUS_DIR, { recursive: true, force: true });
    }
  });

  it("should find a single word", () => {
    const query = "[word:servum]";
    const results = queryEngine.queryCorpus(query);
    expect(results.matches).toHaveLength(1);
    expect(results.matches[0]).toMatchObject({
      workId: "test_work_1",
      section: "1",
      offset: 1,
      text: "servum",
    });
  });

  it("should return correct work data", () => {
    const query = "[word:Gallus]";
    const results = queryEngine.queryCorpus(query);
    expect(results.matches).toHaveLength(2);
    expect(results.matches[0]).toMatchObject({
      workId: "test_work_1",
      author: "Author 1",
      workName: "Work 1",
    });
    expect(results.matches[1]).toMatchObject({
      workId: "test_work_2",
      author: "Author 2",
      workName: "Work 2",
    });
  });

  it("should find all instances of a lemma", () => {
    const query = "[lemma:servus]";
    const results = queryEngine.queryCorpus(query);
    expect(results.totalResults).toBe(2);
    expect(results.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workId: "test_work_1",
          section: "1",
          offset: 1,
          text: "servum",
        }),
        expect.objectContaining({
          workId: "test_work_1",
          section: "2",
          offset: 0,
          text: "servus",
        }),
      ])
    );
  });

  it("should find all instances of a grammatical case", () => {
    const query = "[case:2]";
    const results = queryEngine.queryCorpus(query);
    // Note that `regem` is not in the fake data, so we expect only `servum` and `Gallum`.
    expect(results.totalResults).toBe(2);
    expect(results.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "servum" }),
        expect.objectContaining({ text: "Gallum" }),
      ])
    );
  });

  it("should handle a multi-part query", () => {
    const query = "[word:Gallus] [lemma:servus] [tense:1]";
    const results = queryEngine.queryCorpus(query);
    expect(results.matches).toHaveLength(1);
    expect(results.matches[0]).toMatchObject({
      workId: "test_work_1",
      section: "1",
      offset: 0,
      text: "Gallus servum acclamat",
    });
  });

  it("should handle a composed 'and' query", () => {
    const query = "[lemma:Gallus and case:2] [lemma:accognosco]";
    const results = queryEngine.queryCorpus(query);
    expect(results.matches).toHaveLength(1);
    expect(results.matches[0]).toMatchObject({
      workId: "test_work_1",
      section: "2",
      offset: 1,
      text: "Gallum accognoscit",
    });
  });

  it("should return no results for a query that crosses a hard break", () => {
    const query = "[word:acclamat] [word:servus]";
    const results = queryEngine.queryCorpus(query);

    expect(results.totalResults).toBe(0);
    expect(results.matches).toHaveLength(0);
  });

  it("should return no results for a query with no matches", () => {
    const query = "[word:imperator]";
    const results = queryEngine.queryCorpus(query);

    expect(results.totalResults).toBe(0);
    expect(results.matches).toHaveLength(0);
  });
});
