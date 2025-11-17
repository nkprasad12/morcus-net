import { assertType } from "@/common/assert";
import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { buildCorpus } from "@/common/library/corpus/build_corpus";
import {
  CorpusQueryResult,
  type CorpusInputWork,
} from "@/common/library/corpus/corpus_common";
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
    authorCode: "Author1",
    workName: "Work 1",
  },
  {
    id: "test_work_2",
    rows: ["rex et regina.", "Gallus regem videt."], // 'rex', 'regina', 'videt' are not in fake data, but good for word-only tests.
    rowIds: [["1"], ["2"]],
    sectionDepth: 1,
    author: "Author 2",
    authorCode: "Author2",
    workName: "Work 2",
  },
  {
    id: "test_work_3",
    rows: [
      "Marmor et marmoris et marmorem. Et marmore et marmoribus et marmora et.",
      "dedit oscula nato,",
      "non iterum repetenda suo",
      "dedit oscula saxo",
      '"res" ait',
      "dedit oscula vesti,",
      '"accipe nunc"',
    ],
    rowIds: [["1"], ["2"], ["3"], ["4"], ["5"], ["6"], ["7"]],
    sectionDepth: 1,
    author: "Author 2",
    authorCode: "Author2",
    workName: "Work 3",
  },
];

function getMatchText(match: CorpusQueryResult["matches"][number]) {
  return match.text.filter(([, isMatch]) => isMatch).map(([text]) => text);
}

describe("Corpus Integration Test", () => {
  let queryEngine: RustCorpusQueryEngine;

  function queryCorpus(query: string, pageStart?: number, pageSize?: number) {
    const raw = queryEngine.queryCorpus({ query, pageStart, pageSize });
    const parsed = JSON.parse(raw);
    return assertType(parsed, CorpusQueryResult.isMatch);
  }

  beforeAll(async () => {
    if (fs.existsSync(TEST_CORPUS_DIR)) {
      fs.rmSync(TEST_CORPUS_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CORPUS_DIR, { recursive: true });
    await buildCorpus(TEST_WORKS, TEST_CORPUS_DIR);
    queryEngine = new RustCorpusQueryEngine(TEST_CORPUS_DIR);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_CORPUS_DIR)) {
      fs.rmSync(TEST_CORPUS_DIR, { recursive: true, force: true });
    }
  });

  it("should reject queries that are too long", () => {
    const query = "habeo ".repeat(100);
    expect(() => queryCorpus(query)).toThrow(/.*too long.*/);
  });

  it("should gracefully handle query errors", () => {
    const query = "[word:servum]";
    expect(() => queryCorpus(query)).toThrow();
  });

  it("should find a single word", () => {
    const query = "@word:servum";
    const results = queryCorpus(query);
    expect(results.matches).toHaveLength(1);
    expect(results.matches[0]).toMatchObject({
      metadata: expect.objectContaining({
        workId: "test_work_1",
        section: "1",
        offset: 1,
      }),
    });
    const matchText = getMatchText(results.matches[0]);
    expect(matchText).toEqual(["servum"]);
  });

  it("should return correct work data", () => {
    const query = "Gallus";
    const results = queryCorpus(query);
    expect(results.matches).toHaveLength(2);
    expect(results.matches[0]).toMatchObject({
      metadata: expect.objectContaining({
        workId: "test_work_1",
        author: "Author 1",
        workName: "Work 1",
      }),
    });
    expect(results.matches[1]).toMatchObject({
      metadata: expect.objectContaining({
        workId: "test_work_2",
        author: "Author 2",
        workName: "Work 2",
      }),
    });
  });

  it("should find all instances of a lemma", () => {
    const query = "@lemma:servus";
    const results = queryCorpus(query);
    expect(results.totalResults).toBe(2);
    expect(results.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            workId: "test_work_1",
            section: "1",
            offset: 1,
          }),
        }),
        expect.objectContaining({
          metadata: expect.objectContaining({
            workId: "test_work_1",
            section: "2",
            offset: 0,
          }),
        }),
      ])
    );
    expect(getMatchText(results.matches[0])).toEqual(["servum"]);
    expect(getMatchText(results.matches[1])).toEqual(["servus"]);
  });

  it("should find instances of a grammatical case", () => {
    const query = "@case:acc";
    const results = queryCorpus(query, undefined, 2);
    // Note that `regem` is not in the fake data, so we expect only `servum` and `Gallum`.
    expect(results.totalResults).toBe(4);
    expect(results.matches).toHaveLength(2);
    expect(getMatchText(results.matches[0])).toEqual(["servum"]);
    expect(getMatchText(results.matches[1])).toEqual(["Gallum"]);
  });

  it("should handle a multi-part query", () => {
    const query = "Gallus @lemma:servus @tense:pres";
    const results = queryCorpus(query);
    expect(results.matches).toHaveLength(1);
    expect(results.matches[0]).toMatchObject({
      metadata: expect.objectContaining({
        workId: "test_work_1",
        section: "1",
        offset: 0,
      }),
    });
    expect(getMatchText(results.matches[0])).toEqual([
      "Gallus servum acclamat",
    ]);
  });

  it("should handle a composed 'and' query", () => {
    const query = "(@lemma:Gallus and @case:acc) @lemma:accognosco";
    const results = queryCorpus(query);
    expect(results.matches).toHaveLength(1);
    expect(results.matches[0]).toMatchObject({
      metadata: expect.objectContaining({
        workId: "test_work_1",
        section: "2",
        offset: 1,
      }),
    });
    expect(getMatchText(results.matches[0])).toEqual(["Gallum accognoscit"]);
  });

  it("should handle a composed 'or' query", () => {
    const query = "Gallus (servum or regem)";
    const results = queryCorpus(query);
    expect(results.matches).toHaveLength(2);
    expect(results.matches[0]).toMatchObject({
      metadata: expect.objectContaining({
        workId: "test_work_1",
        section: "1",
        offset: 0,
      }),
    });
    expect(results.matches[1]).toMatchObject({
      metadata: expect.objectContaining({
        workId: "test_work_2",
        section: "2",
        offset: 0,
      }),
    });
    expect(getMatchText(results.matches[0])).toEqual(["Gallus servum"]);
    expect(getMatchText(results.matches[1])).toEqual(["Gallus regem"]);
  });

  it("should return no results for a query that crosses a hard break", () => {
    const query = "acclamat servus";
    const results = queryCorpus(query);

    expect(results.totalResults).toBe(0);
    expect(results.matches).toHaveLength(0);
  });

  it("should allow matches around a hard break", () => {
    const results = [
      "et marmoris et",
      "marmoris et marmorem",
      "et marmorem et",
      "marmorem et marmore",
      "et marmore et",
      "marmore et marmoribus",
    ].map((text) => queryCorpus(text));

    expect(results[0].totalResults).toBe(1);
    expect(results[1].totalResults).toBe(1);
    // There's a period between the words now.
    expect(results[2].totalResults).toBe(0);
    expect(results[3].totalResults).toBe(0);
    expect(results[4].totalResults).toBe(1);
    expect(results[5].totalResults).toBe(1);
  });

  it("should return no results for a query with no matches", () => {
    const query = "imperator";
    const results = queryCorpus(query);

    expect(results.totalResults).toBe(0);
    expect(results.matches).toHaveLength(0);
  });

  it("should handle paginated results", () => {
    const query = "@lemma:marmor et";
    const startIds = new Set<number>();

    let results = queryCorpus(query, 0, 2);
    expect(results.totalResults).toBe(5);
    expect(results.matches).toHaveLength(2);
    results.matches.forEach((match) => startIds.add(match.metadata.offset));

    results = queryCorpus(query, 2, 2);
    expect(results.totalResults).toBe(5);
    expect(results.matches).toHaveLength(2);
    results.matches.forEach((match) => startIds.add(match.metadata.offset));

    results = queryCorpus(query, 4, 2);
    expect(results.totalResults).toBe(5);
    expect(results.matches).toHaveLength(1);
    results.matches.forEach((match) => startIds.add(match.metadata.offset));

    const sortedIds = Array.from(startIds).sort((a, b) => a - b);
    // Marmorem is not valid because marmor is neuter.
    expect(sortedIds).toEqual([0, 2, 6, 8, 10]);
  });

  it("should break lines across leaf sections with break after punct", () => {
    const query = "oscula nato";

    const results = queryCorpus(query);

    expect(results.totalResults).toBe(1);
    const resultParts = results.matches[0].text;
    expect(resultParts).toHaveLength(3);
    expect(resultParts[0][1]).toBe(false);
    expect(resultParts[0][0]).toMatch(/dedit $/);
    expect(resultParts[2][1]).toBe(false);
    expect(resultParts[2][0]).toMatch(/^,\nnon iterum/);
  });

  it("should break lines across leaf sections with break before punct", () => {
    const query = "oscula saxo";

    const results = queryCorpus(query);

    expect(results.totalResults).toBe(1);
    const resultParts = results.matches[0].text;
    expect(resultParts).toHaveLength(3);
    expect(resultParts[0][1]).toBe(false);
    expect(resultParts[0][0]).toMatch(/dedit $/);
    expect(resultParts[2][1]).toBe(false);
    expect(resultParts[2][0]).toMatch(/^\n"res"/);
  });

  it("should break lines across leaf sections with punct on both sides", () => {
    const query = "oscula vesti";

    const results = queryCorpus(query);

    expect(results.totalResults).toBe(1);
    const resultParts = results.matches[0].text;
    expect(resultParts).toHaveLength(3);
    expect(resultParts[0][1]).toBe(false);
    expect(resultParts[0][0]).toMatch(/dedit $/);
    expect(resultParts[2][1]).toBe(false);
    expect(resultParts[2][0]).toMatch(/^,\n"accipe/);
  });

  it("should handle low frequency proximity searches", () => {
    const query = "marmore ~ marmoris";

    const results = queryCorpus(query);

    expect(results.totalResults).toBe(1);
    expect(getMatchText(results.matches[0])).toEqual(["marmoris", "marmore"]);
  });

  it("should handle bitmask proximity searches", () => {
    const query = "@lemma:marmor ~ et";

    const results = queryCorpus(query);

    // Marmorem is not valid because marmor is neuter.
    expect(results.totalResults).toBe(5);
  });
});
