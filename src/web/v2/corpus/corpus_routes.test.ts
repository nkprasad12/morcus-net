import express from "express";
import request from "supertest";

import { createCorpusRoutes } from "@/web/v2/corpus/corpus_routes.server";
import type { CorpusEngine } from "@/web/v2/corpus/corpus_query.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  throwingCorpusEngine,
} from "@/web/v2/testing/fake_corpus_engine";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "",
  getV2CriticalJs: () => "",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

function makeApp(engine?: CorpusEngine) {
  const app = express();
  app.use(
    "/v2",
    createCorpusRoutes({
      engine,
      loadAuthors: () => Promise.resolve(CORPUS_TEST_AUTHORS),
    })
  );
  return app;
}

describe("GET /v2/corpus", () => {
  test("renders the landing page", async () => {
    const engine = fakeCorpusEngine();
    const res = await request(makeApp(engine)).get("/v2/corpus");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("<morcus-corpus-view");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(engine.requests).toHaveLength(0);
  });

  test("renders results for a query", async () => {
    const engine = fakeCorpusEngine();
    const res = await request(makeApp(engine)).get(
      "/v2/corpus?q=omnis&contextLen=5&pageSize=10&strictMode=1"
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

  test("a partial request gets only the slot templates", async () => {
    const res = await request(makeApp(fakeCorpusEngine()))
      .get("/v2/corpus?q=omnis")
      .set("X-Requested-With", "fetch");

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toMatch(/^<template data-slot="summary">/);
  });

  test("a query error is still a 200 page", async () => {
    const res = await request(makeApp(fakeCorpusEngine())).get(
      "/v2/corpus?q=%23Nobody+x"
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('role="alert"');
  });

  test("without an engine, answers 503", async () => {
    const res = await request(makeApp()).get("/v2/corpus?q=omnis");
    expect(res.status).toBe(503);
    expect(res.text).toContain("Corpus unavailable");
  });

  test("missing bindings answer 503", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(
      makeApp(throwingCorpusEngine("Missing Rust corpus bindings."))
    ).get("/v2/corpus?q=omnis");
    expect(res.status).toBe(503);
    warn.mockRestore();
  });

  test("an unexpected failure answers 500", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(makeApp(fakeCorpusEngine(() => "not json"))).get(
      "/v2/corpus?q=omnis"
    );
    expect(res.status).toBe(500);
    error.mockRestore();
  });
});
