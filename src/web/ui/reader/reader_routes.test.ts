import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import { preprocessWorkToV2 } from "@/common/library/preprocess/work_preprocessor";
import { convertTheLatinLibraryWork } from "@/common/library/process_thelatinlibrary";
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

// Cited by chapter and section, paginated by chapter (Phase 4 Cicero).
const BRUTUS: V2PreprocessedWork = {
  id: "phi0474.phi039.perseus-lat2",
  title: "Brutus",
  author: "Cicero",
  urlAuthor: "cicero",
  urlName: "brutus",
  attribution: "perseus",
  hasMacra: false,
  hasTranslation: false,
  textParts: ["chapter", "section"],
  paginationDepth: 1,
  tocHtml: "",
  pages: [
    {
      id: ["40"],
      title: "Chapter 40",
      sectionCount: 1,
      citationRange: ["40.148", "40.149"],
      singleHtml:
        '<p id="sec-40.148">Sed ad Crassum</p><p id="sec-40.149">Atque ille</p>',
    },
    {
      id: ["41"],
      title: "Chapter 41",
      sectionCount: 1,
      citationRange: ["41.150", "41.150"],
      singleHtml: '<p id="sec-41.150">Tum Brutus</p>',
    },
  ],
};

// Cited by line, paginated by card (Phase 4 Seneca tragedies).
const MEDEA: V2PreprocessedWork = {
  id: "phi1017.phi004.perseus-lat2",
  title: "Medea",
  author: "Seneca, Lucius Annaeus",
  urlAuthor: "seneca_minor",
  urlName: "medea",
  attribution: "perseus",
  hasMacra: false,
  hasTranslation: false,
  textParts: ["line"],
  paginationDepth: 1,
  tocHtml: "",
  pages: [
    {
      id: ["1"],
      title: "Card 1",
      sectionCount: 1,
      citationRange: ["1", "1"],
      singleHtml: '<span id="sec-1">Di coniugales</span>',
    },
    {
      id: ["116"],
      title: "Card 116",
      sectionCount: 2,
      citationRange: ["116", "130"],
      singleHtml:
        '<span id="sec-116">Occidimus</span><span id="sec-130">Quid</span>',
    },
  ],
};

// A Roman-law work, rendered by the real preprocessor so its gutters carry
// the alias anchors (`1.1.1pr`, `30.79.1`) that jumps must see through.
const DIGEST: V2PreprocessedWork = preprocessWorkToV2(
  convertTheLatinLibraryWork({
    workId: "thelatinlibrary-justinian-digesta",
    author: "Justinian",
    title: "Digesta",
    source: {
      url: "https://www.thelatinlibrary.com/justinian.html",
      retrieved: "2026-10-30",
      sha256: "abc",
      statedEdition: null,
    },
    textParts: ["book", "title", "lex", "paragraph"],
    citationStyle: "roman_law",
    pageDepth: 2,
    rows: [
      [["1", "1"], "De iustitia et iure.", "heading"],
      [["1", "1", "1", "pr"], "Iuri operam daturum."],
      [["1", "1", "1", "1"], "Cuius merito."],
      [["30", "0"], "De legatis et fideicommissis.", "heading"],
      [["30", "0", "79", "1"], "Si quis legaverit."],
    ],
  }),
  {
    author: "Justinian",
    name: "Digesta",
    id: "thelatinlibrary-justinian-digesta",
    urlAuthor: "justinian",
    urlName: "digesta",
    attribution: "theLatinLibrary",
  }
);

beforeAll(() => {
  loader.saveV2LibraryDb(mockLibDir, [DE_CLEMENTIA, BRUTUS, MEDEA, DIGEST]);
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

describe("non-canonical page ids", () => {
  test("redirect a bare section to its chapter page", async () => {
    const res = await request(app()).get("/work/cicero/brutus/150");

    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/work/cicero/brutus/41#sec-41.150");
  });

  test("redirect retired front matter pages to the first page", async () => {
    // Brutus' sigla were a page (`sigla`, cited `sigla.1`) until Phase 5;
    // they now open the first page, which here is chapter 40.
    for (const old of ["sigla", "sigla.1", "arg"]) {
      const res = await request(app()).get(`/work/cicero/brutus/${old}`);

      expect(res.status).toBe(302);
      expect(res.header.location).toBe("/work/cicero/brutus/40");
    }
  });

  test("keep the query and match text", async () => {
    const res = await request(app()).get(
      "/work/cicero/brutus/150?q=brutus&matchText=Tum"
    );

    expect(res.status).toBe(302);
    expect(res.header.location).toBe(
      "/work/cicero/brutus/41?q=brutus&matchText=Tum#sec-41.150"
    );
  });

  test("redirect a line to its card page", async () => {
    const res = await request(app()).get("/work/seneca_minor/medea/130");

    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/work/seneca_minor/medea/116#sec-130");
  });

  test("redirect a deeper citation to its page", async () => {
    const res = await request(app()).get(
      "/work/seneca_minor/de_clementia/1.2.1"
    );

    expect(res.status).toBe(302);
    expect(res.header.location).toBe(
      "/work/seneca_minor/de_clementia/1.2#sec-1.2.1"
    );
  });

  test("leave canonical page ids alone", async () => {
    const res = await request(app()).get("/work/seneca_minor/medea/116");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Occidimus");
  });

  test("leave partials alone", async () => {
    const res = await request(app()).get(
      "/work/cicero/brutus/150?format=partial"
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain("Tum Brutus");
  });

  test("leave a jump miss notice alone", async () => {
    const res = await request(app()).get(
      "/work/cicero/brutus/150?jumpMiss=999"
    );

    expect(res.status).toBe(200);
  });

  test("still 404 for page ids that resolve nowhere", async () => {
    const res = await request(app()).get("/work/cicero/brutus/999");

    expect(res.status).toBe(404);
  });
});

describe("Roman-law citation jumps", () => {
  test.each([
    ["1.1.1pr", "/work/justinian/digesta/1.1#sec-1.1.1.pr"],
    ["Lex 1.1.1pr", "/work/justinian/digesta/1.1#sec-1.1.1.pr"],
    ["1.1.1", "/work/justinian/digesta/1.1#sec-1.1.1.pr"],
    ["1.1.1.1", "/work/justinian/digesta/1.1#sec-1.1.1.1"],
    ["30.79.1", "/work/justinian/digesta/30.0#sec-30.0.79.1"],
    ["Book 30", "/work/justinian/digesta/30.0"],
  ])("?jump=%s lands on the canonical section", async (jump, location) => {
    const res = await request(app()).get(
      `/work/justinian/digesta?jump=${encodeURIComponent(jump)}`
    );

    expect(res.status).toBe(302);
    expect(res.header.location).toBe(location);
  });

  test("an alias page id redirects to the canonical section", async () => {
    const res = await request(app()).get("/work/justinian/digesta/30.79.1");

    expect(res.status).toBe(302);
    expect(res.header.location).toBe(
      "/work/justinian/digesta/30.0#sec-30.0.79.1"
    );
  });
});
