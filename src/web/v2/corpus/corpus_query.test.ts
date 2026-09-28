import {
  CONTEXT_LEN,
  PAGE_SIZE,
  corpusUrl,
  decodeCursor,
  encodeCursor,
  type CorpusParams,
} from "@/web/v2/corpus/corpus_params.common";
import {
  CorpusUnavailableError,
  parseCorpusParams,
  runCorpusSearch,
} from "@/web/v2/corpus/corpus_query.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeMatch,
  fakeResult,
  throwingCorpusEngine,
} from "@/web/v2/testing/fake_corpus_engine";

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

const BASE: CorpusParams = {
  q: "amoris",
  pageSize: PAGE_SIZE.default,
  contextLen: CONTEXT_LEN.default,
  strictMode: false,
};

describe("parseCorpusParams", () => {
  test("defaults", () => {
    expect(parseCorpusParams({})).toEqual({
      q: "",
      pageSize: 50,
      contextLen: 20,
      strictMode: false,
      cursor: undefined,
    });
  });

  test("reads and trims every parameter", () => {
    expect(
      parseCorpusParams({
        q: "  @lemma:do  ",
        pageSize: "25",
        contextLen: "5",
        strictMode: "1",
        cursor: "3-50-7",
      })
    ).toEqual({
      q: "@lemma:do",
      pageSize: 25,
      contextLen: 5,
      strictMode: true,
      cursor: { resultId: 3, resultIndex: 50, candidateIndex: 7 },
    });
  });

  test("clamps numbers to their ranges", () => {
    const params = parseCorpusParams({ pageSize: "5000", contextLen: "0" });
    expect(params.pageSize).toBe(PAGE_SIZE.max);
    expect(params.contextLen).toBe(CONTEXT_LEN.min);
  });

  test("non-numeric numbers fall back to defaults", () => {
    const params = parseCorpusParams({ pageSize: "lots", contextLen: "1.5" });
    expect(params.pageSize).toBe(PAGE_SIZE.default);
    expect(params.contextLen).toBe(CONTEXT_LEN.default);
  });

  test("uses the first of repeated parameters", () => {
    expect(parseCorpusParams({ q: ["a", "b"] }).q).toBe("a");
  });

  test("strictMode is only on for 1", () => {
    expect(parseCorpusParams({ strictMode: "on" }).strictMode).toBe(false);
  });
});

describe("cursor", () => {
  test("round-trips", () => {
    const cursor = { resultId: 12, resultIndex: 100, candidateIndex: 4 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  test.each(["", "1-2", "1-2-x", "-1-2-3", "1-2-3-4"])(
    "malformed %p means the first page",
    (raw) => {
      expect(decodeCursor(raw)).toBeUndefined();
    }
  );
});

describe("corpusUrl", () => {
  test("follows the form's field order", () => {
    expect(
      corpusUrl({
        ...BASE,
        q: "#Caesar bellum",
        strictMode: true,
        cursor: { resultId: 1, resultIndex: 50, candidateIndex: 2 },
      })
    ).toBe(
      "/v2/corpus?q=%23Caesar+bellum&contextLen=20&pageSize=50&strictMode=1&cursor=1-50-2"
    );
  });

  test("omits defaults-off flags", () => {
    expect(corpusUrl(BASE)).toBe(
      "/v2/corpus?q=amoris&contextLen=20&pageSize=50"
    );
  });

  test("round-trips through parseCorpusParams", () => {
    const params: CorpusParams = {
      ...BASE,
      q: "a & b",
      strictMode: true,
      cursor: { resultId: 1, resultIndex: 2, candidateIndex: 3 },
    };
    const search = new URL(corpusUrl(params), "http://x").searchParams;
    expect(parseCorpusParams(Object.fromEntries(search))).toEqual(params);
  });
});

describe("runCorpusSearch", () => {
  test("an empty query is the landing view and skips the engine", async () => {
    const engine = fakeCorpusEngine();
    const view = await runCorpusSearch(
      { ...BASE, q: "" },
      engine,
      CORPUS_TEST_AUTHORS
    );
    expect(view.outcome).toEqual({ kind: "landing" });
    expect(engine.requests).toHaveLength(0);
  });

  test("a syntax error is reported without calling the engine", async () => {
    const engine = fakeCorpusEngine();
    const view = await runCorpusSearch(
      { ...BASE, q: "#Nobody amoris" },
      engine,
      CORPUS_TEST_AUTHORS
    );
    expect(view.outcome.kind).toBe("error");
    expect(engine.requests).toHaveLength(0);
  });

  test("an over-long query is an error", async () => {
    const engine = fakeCorpusEngine();
    const view = await runCorpusSearch(
      { ...BASE, q: "amoris ".repeat(20).trim() },
      engine,
      CORPUS_TEST_AUTHORS
    );
    expect(view.outcome).toEqual({
      kind: "error",
      message: "The query is too long.",
    });
    expect(engine.requests).toHaveLength(0);
  });

  test("sends the transformed query and settings", async () => {
    const engine = fakeCorpusEngine();
    const cursor = { resultId: 1, resultIndex: 50, candidateIndex: 0 };
    await runCorpusSearch(
      {
        q: "#Caesar @lemma:bellum",
        pageSize: 10,
        contextLen: 5,
        strictMode: true,
        cursor,
      },
      engine,
      CORPUS_TEST_AUTHORS
    );
    expect(engine.requests).toEqual([
      {
        query: "[Caesar] @lemma:bellum",
        pageData: cursor,
        pageSize: 10,
        contextLen: 5,
        strictMode: true,
      },
    ]);
  });

  test("builds result views with reader links", async () => {
    const view = await runCorpusSearch(
      BASE,
      fakeCorpusEngine(),
      CORPUS_TEST_AUTHORS
    );
    expect(view.outcome).toMatchObject({
      kind: "results",
      estimatedTotal: 1,
      isExact: true,
      pageStart: 0,
      timingMs: 1.25,
      next: undefined,
    });
    if (view.outcome.kind !== "results") throw new Error("Expected results");
    const [result] = view.outcome.results;
    expect(result.heading).toBe("De Bello Gallico 1.1 [Caesar]");
    expect(result.href).toMatch(
      /^\/v2\/reader\/caesar\/de_bello_gallico\?matchText=/
    );
    expect(result.snippet).toEqual(fakeMatch().text);
  });

  test("a work missing from V2 has no link", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const view = await runCorpusSearch(
      BASE,
      fakeCorpusEngine(() =>
        fakeResult({ matches: [fakeMatch({ workId: "unknown.work" })] })
      ),
      CORPUS_TEST_AUTHORS
    );
    if (view.outcome.kind !== "results") throw new Error("Expected results");
    expect(view.outcome.results[0].href).toBeUndefined();
    warn.mockRestore();
  });

  test("passes paging through", async () => {
    const next = { resultId: 2, resultIndex: 100, candidateIndex: 3 };
    const view = await runCorpusSearch(
      { ...BASE, cursor: { resultId: 1, resultIndex: 50, candidateIndex: 0 } },
      fakeCorpusEngine(() =>
        fakeResult({ resultStats: { estimatedResults: 500 }, nextPage: next })
      ),
      CORPUS_TEST_AUTHORS
    );
    expect(view.outcome).toMatchObject({
      kind: "results",
      isExact: false,
      pageStart: 50,
      next,
    });
  });

  test("flags inflection filters for the disclaimer", async () => {
    const plain = await runCorpusSearch(
      BASE,
      fakeCorpusEngine(),
      CORPUS_TEST_AUTHORS
    );
    const inflected = await runCorpusSearch(
      { ...BASE, q: "@case:dat" },
      fakeCorpusEngine(),
      CORPUS_TEST_AUTHORS
    );
    expect(plain.showInflectionDisclaimer).toBe(false);
    expect(inflected.showInflectionDisclaimer).toBe(true);
  });

  test("an engine query error becomes an error outcome", async () => {
    const view = await runCorpusSearch(
      BASE,
      throwingCorpusEngine(new Error("Unknown lemma")),
      CORPUS_TEST_AUTHORS
    );
    expect(view.outcome).toEqual({ kind: "error", message: "Unknown lemma" });
  });

  test("missing bindings mean the corpus is unavailable", async () => {
    await expect(
      runCorpusSearch(
        BASE,
        throwingCorpusEngine("Missing Rust corpus bindings. Run setup."),
        CORPUS_TEST_AUTHORS
      )
    ).rejects.toBeInstanceOf(CorpusUnavailableError);
  });

  test("a malformed engine response is a server error", async () => {
    await expect(
      runCorpusSearch(
        BASE,
        fakeCorpusEngine(() => JSON.stringify({ nope: true })),
        CORPUS_TEST_AUTHORS
      )
    ).rejects.toThrow("unexpected result shape");
  });
});
