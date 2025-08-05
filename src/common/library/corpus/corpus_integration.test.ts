import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { buildCorpus } from "@/common/library/corpus/build_corpus";
import {
  type CorpusInputWork,
  type CorpusQuery,
} from "@/common/library/corpus/corpus_common";
import { loadCorpus } from "@/common/library/corpus/corpus_serialization";
import { CorpusQueryEngine } from "@/common/library/corpus/query_corpus";
import { LatinCase, LatinTense } from "@/morceus/types";
import fs from "fs";

console.debug = jest.fn();

setupMorceusWithFakeData();

const TEST_CORPUS_DIR = "corpus_integration_test_dir";

const TEST_WORKS: CorpusInputWork[] = [
  {
    id: "test_work_1",
    rows: ["Gallus servum acclamat.", "servus Gallum accognoscit."],
    rowIds: [["1"], ["2"]],
    sectionDepth: 1,
  },
  {
    id: "test_work_2",
    rows: ["rex et regina.", "Gallus regem videt."], // 'rex', 'regina', 'videt' are not in fake data, but good for word-only tests.
    rowIds: [["1"], ["2"]],
    sectionDepth: 1,
  },
];

describe("Corpus Integration Test", () => {
  let queryEngine: CorpusQueryEngine;

  beforeAll(() => {
    if (fs.existsSync(TEST_CORPUS_DIR)) {
      fs.rmSync(TEST_CORPUS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CORPUS_DIR, { recursive: true });
    buildCorpus(TEST_WORKS, TEST_CORPUS_DIR);
    const corpus = loadCorpus(TEST_CORPUS_DIR);
    queryEngine = new CorpusQueryEngine(corpus);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_CORPUS_DIR)) {
      fs.rmSync(TEST_CORPUS_DIR, { recursive: true, force: true });
    }
  });

  it("should find a single word", () => {
    const query: CorpusQuery = { parts: [{ word: "servum" }] };
    const results = queryEngine.queryCorpus(query);
    expect(results.matches).toHaveLength(1);
    expect(results.matches[0]).toMatchObject({
      workId: "test_work_1",
      section: "1",
      offset: 1,
      text: "servum",
    });
  });

  it("should find all instances of a lemma", () => {
    const query: CorpusQuery = { parts: [{ lemma: "servus" }] };
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
    const query: CorpusQuery = {
      parts: [{ category: "case", value: LatinCase.Accusative }],
    };
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
    const query: CorpusQuery = {
      parts: [
        { word: "Gallus" },
        { lemma: "servus" },
        { category: "tense", value: LatinTense.Present },
      ],
    };
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
    const query: CorpusQuery = {
      parts: [
        {
          composition: "and",
          atoms: [
            { lemma: "Gallus" },
            { category: "case", value: LatinCase.Accusative },
          ],
        },
        { lemma: "accognosco" },
      ],
    };
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
    const query: CorpusQuery = {
      parts: [{ word: "acclamat" }, { word: "servus" }],
    };
    const results = queryEngine.queryCorpus(query);

    expect(results.totalResults).toBe(0);
    expect(results.matches).toHaveLength(0);
  });

  it("should return no results for a query with no matches", () => {
    const query: CorpusQuery = { parts: [{ word: "imperator" }] };
    const results = queryEngine.queryCorpus(query);

    expect(results.totalResults).toBe(0);
    expect(results.matches).toHaveLength(0);
  });
});
