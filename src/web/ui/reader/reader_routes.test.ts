import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import * as loader from "@/web/ui/reader/reader_loader.server";
import { createReaderRoutes } from "@/web/ui/reader/reader_routes.server";
import express from "express";
import fs from "fs";
import request from "supertest";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

// The real loader, reading a library written to a temporary directory.
jest.mock("@/web/ui/reader/reader_loader.server", () => {
  const actual: typeof import("@/web/ui/reader/reader_loader.server") =
    jest.requireActual("@/web/ui/reader/reader_loader.server");
  const os: typeof import("os") = jest.requireActual("os");
  const path: typeof import("path") = jest.requireActual("path");
  const mockLibDir = path.join(
    os.tmpdir(),
    `reader-routes-test-${process.pid}`
  );
  return {
    ...actual,
    mockLibDir,
    getV2Work: (slug: string) => actual.getV2Work(slug, mockLibDir),
  };
});

// Set by the mock above.
const { mockLibDir } = loader as unknown as { mockLibDir: string };

const DE_CLEMENTIA: V2PreprocessedWork = {
  id: "phi1017.phi014.perseus-lat2",
  title: "De Clementia",
  author: "Seneca, Lucius Annaeus",
  urlAuthor: "seneca_minor",
  urlName: "de_clementia",
  attribution: "perseus",
  hasMacra: false,
  hasTranslation: false,
  textParts: ["book", "chapter", "section"],
  paginationDepth: 2,
  tocHtml: "",
  pages: [
    {
      id: ["1", "1"],
      title: "Book 1, Chapter 1",
      sectionCount: 1,
      citationRange: ["1.1.1", "1.1.1"],
      singleHtml: '<p id="sec-1.1.1">Scribere de clementia, Nero Caesar</p>',
    },
    {
      id: ["1", "2"],
      title: "Book 1, Chapter 2",
      sectionCount: 1,
      citationRange: ["1.2.1", "1.2.1"],
      singleHtml: '<p id="sec-1.2.1">Scio male audire apud imperitos</p>',
    },
  ],
};

beforeAll(() => {
  loader.saveV2LibraryDb(mockLibDir, [DE_CLEMENTIA]);
});

afterAll(() => {
  fs.rmSync(mockLibDir, { recursive: true, force: true });
});

function app() {
  const result = express();
  result.use("/", createReaderRoutes());
  return result;
}

describe("legacy work slugs", () => {
  test("redirect to the canonical work URL", async () => {
    const res = await request(app()).get(
      "/work/seneca,_lucius_annaeus/de_clementia"
    );

    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/work/seneca_minor/de_clementia");
  });

  test("keep the page and the query string", async () => {
    const res = await request(app()).get(
      "/work/seneca,_lucius_annaeus/de_clementia/1.2?q=imperitos&matchText=Scio"
    );

    expect(res.status).toBe(302);
    expect(res.header.location).toBe(
      "/work/seneca_minor/de_clementia/1.2?q=imperitos&matchText=Scio"
    );
  });

  test("redirect when the comma is percent-encoded", async () => {
    const res = await request(app()).get(
      "/work/seneca%2C_lucius_annaeus/de_clementia/1.1"
    );

    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/work/seneca_minor/de_clementia/1.1");
  });

  test("keep a legacy jump for the canonical URL to resolve", async () => {
    const res = await request(app()).get(
      "/work/seneca,_lucius_annaeus/de_clementia?jump=1.2.1"
    );

    expect(res.status).toBe(302);
    expect(res.header.location).toBe(
      "/work/seneca_minor/de_clementia?jump=1.2.1"
    );
  });

  test("leave the canonical URL alone", async () => {
    const res = await request(app()).get("/work/seneca_minor/de_clementia/1.2");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Scio male audire");
  });

  test("still 404 for unknown works", async () => {
    const res = await request(app()).get("/work/seneca,_lucius_annaeus/de_ira");

    expect(res.status).toBe(404);
  });
});
