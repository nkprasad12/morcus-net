import express from "express";
import request from "supertest";

import {
  createCorpusRoutes,
  type CorpusRoutesOptions,
} from "@/web/v2/corpus/corpus_routes.server";
import type { CorpusEngine } from "@/web/v2/corpus/corpus_query.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  throwingCorpusEngine,
} from "@/web/v2/testing/fake_corpus_engine";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "",
  getV2CriticalJs: () => "",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

function makeApp(engine?: CorpusEngine, options: CorpusRoutesOptions = {}) {
  const app = express();
  app.use(
    createCorpusRoutes({
      engine,
      loadAuthors: () => Promise.resolve(CORPUS_TEST_AUTHORS),
      ...options,
    })
  );
  return app;
}

describe("GET /corpus", () => {
  test("renders the landing page", async () => {
    const engine = fakeCorpusEngine();
    const res = await request(makeApp(engine)).get("/corpus");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("<morcus-corpus-view");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(engine.requests).toHaveLength(0);
  });

  test("renders results for a query", async () => {
    const engine = fakeCorpusEngine();
    const res = await request(makeApp(engine)).get(
      "/corpus?q=omnis&contextLen=5&pageSize=10&strictMode=1"
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('class="corpus-result"');
    expect(engine.requests).toEqual([
      expect.objectContaining({
        query: "omnis",
        contextLen: 5,
        pageSize: 10,
        strictMode: true,
      }),
    ]);
  });

  test("clamps malformed contextLen and pageSize to defaults with 200 OK (CORP-05)", async () => {
    const engine = fakeCorpusEngine();
    const res = await request(makeApp(engine)).get(
      "/corpus?q=amor&contextLen=abc&pageSize=abc"
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('<span class="inflect-chip is-off">20</span>');
    expect(res.text).toContain('<span class="inflect-chip is-off">50</span>');
    expect(engine.requests).toEqual([
      expect.objectContaining({
        query: "amor",
        contextLen: 20,
        pageSize: 50,
      }),
    ]);
  });

  test("a partial request gets only the slot templates", async () => {
    const res = await request(makeApp(fakeCorpusEngine()))
      .get("/corpus?q=omnis")
      .set("X-Requested-With", "fetch");

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toMatch(/^<template data-slot="summary">/);
  });

  test("a query error is still a 200 page", async () => {
    const res = await request(makeApp(fakeCorpusEngine())).get(
      "/corpus?q=%23Nobody+x"
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('role="alert"');
  });

  test("without an engine, answers 503", async () => {
    const res = await request(makeApp()).get("/corpus?q=omnis");
    expect(res.status).toBe(503);
    expect(res.text).toContain("Corpus unavailable");
  });

  test("missing bindings answer 503", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(
      makeApp(throwingCorpusEngine("Missing Rust corpus bindings."))
    ).get("/corpus?q=omnis");
    expect(res.status).toBe(503);
    warn.mockRestore();
  });

  test("an unexpected failure answers 500", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(makeApp(fakeCorpusEngine(() => "not json"))).get(
      "/corpus?q=omnis"
    );
    expect(res.status).toBe(500);
    error.mockRestore();
  });
});

describe("GET /corpus: autocomplete host", () => {
  test("carries the author list", async () => {
    const res = await request(makeApp(fakeCorpusEngine())).get("/corpus");

    expect(res.text).toContain("<morcus-corpus-suggestions");
    expect(res.text).toContain("data-authors=");
  });

  test("a partial response has no host: it sits outside every slot", async () => {
    const res = await request(makeApp(fakeCorpusEngine()))
      .get("/corpus?q=omnis")
      .set("X-Requested-With", "fetch");
    expect(res.text).not.toContain("morcus-corpus-suggestions");
  });
});

describe("GET /api/corpus/lemmata/:letter", () => {
  const LEMMATA = ["caedo", "amo", "Caesar", "cado", "Areus2"];
  const savedCommit = process.env.COMMIT_ID;

  beforeEach(() => {
    process.env.COMMIT_ID = "abc123";
  });

  afterEach(() => {
    if (savedCommit === undefined) {
      delete process.env.COMMIT_ID;
    } else {
      process.env.COMMIT_ID = savedCommit;
    }
  });

  /** `null` stands for a corpus that isn't built. */
  function lemmaApp(lemmata: readonly string[] | null = LEMMATA) {
    const loadLemmata = jest.fn(() => Promise.resolve(lemmata ?? undefined));
    return {
      app: makeApp(undefined, { loadLemmata }),
      loadLemmata,
    };
  }

  test("a shard at the current version is JSON, cacheable for good", async () => {
    const res = await request(lemmaApp().app).get(
      "/api/corpus/lemmata/c?v=abc123"
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(res.body).toEqual(["Caesar", "cado", "caedo"]);
  });

  test("without a version, the browser must revalidate", async () => {
    const res = await request(lemmaApp().app).get("/api/corpus/lemmata/c");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  test("a stale version (a tab open across a deploy) revalidates", async () => {
    const res = await request(lemmaApp().app).get(
      "/api/corpus/lemmata/c?v=old"
    );
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  test("the letter is case-insensitive, and an unused one is empty", async () => {
    const { app } = lemmaApp();
    const upper = await request(app).get("/api/corpus/lemmata/A?v=1");
    expect(upper.body).toEqual(["Areus2", "amo"]);
    const unused = await request(app).get("/api/corpus/lemmata/q?v=1");
    expect(unused.status).toBe(200);
    expect(unused.body).toEqual([]);
  });

  test("more than one letter is a 400", async () => {
    const res = await request(lemmaApp().app).get("/api/corpus/lemmata/ca?v=1");
    expect(res.status).toBe(400);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  test("without the lemma list, answers 503", async () => {
    const res = await request(lemmaApp(null).app).get(
      "/api/corpus/lemmata/c?v=1"
    );
    expect(res.status).toBe(503);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  test("builds the shards once per router", async () => {
    const { app, loadLemmata } = lemmaApp();
    await request(app).get("/api/corpus/lemmata/a?v=1");
    await request(app).get("/api/corpus/lemmata/c?v=1");
    expect(loadLemmata).toHaveBeenCalledTimes(1);
  });
});
