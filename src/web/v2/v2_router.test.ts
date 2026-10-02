import express from "express";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { createV2Router } from "@/web/v2/v2_router.server";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { XmlNode } from "@/common/xml/xml_node";
import { buildV2Bundle } from "@/bundler/v2.rsbuild";
import { getV2AssetHref } from "@/web/v2/shell/asset_manifest.server";
import { getV2Work } from "@/web/v2/reader/reader_loader.server";

// The mock loader is the real fixture-backed implementation, except that
// `getV2Work` is wrapped in a `jest.fn` so tests can force it to reject and
// exercise the reader routes' failure path.
jest.mock("@/web/v2/reader/reader_loader.server", () => {
  const actual = jest.requireActual("@/web/v2/testing/mock_reader_loader");
  return {
    __esModule: true,
    ...actual,
    getV2Work: jest.fn(actual.getV2Work),
  };
});

const realGetV2Work: typeof getV2Work = jest.requireActual<
  typeof import("@/web/v2/testing/mock_reader_loader")
>("@/web/v2/testing/mock_reader_loader").getV2Work;

describe("v2_router integration", () => {
  let app: express.Express;
  let mockFusedDict: Partial<FusedDictionary>;

  // Build into a temporary directory: writing `build/v2` would replace the
  // assets a running dev server is serving with a Jest-mode bundle.
  let buildDir: string;
  const savedBuildDir = process.env.MORCUS_V2_BUILD_DIR;

  beforeAll(async () => {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-v2-build-"));
    process.env.MORCUS_V2_BUILD_DIR = buildDir;
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      await buildV2Bundle(false);
    } finally {
      logSpy.mockRestore();
    }
  }, 30000);

  afterAll(() => {
    if (savedBuildDir === undefined) delete process.env.MORCUS_V2_BUILD_DIR;
    else process.env.MORCUS_V2_BUILD_DIR = savedBuildDir;
    fs.rmSync(buildDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    mockFusedDict = {
      getEntry: jest.fn().mockResolvedValue({
        ls: [
          {
            entry: new XmlNode("span", [["class", "lsOrth"]], ["amo"]),
            outline: {
              mainKey: "amo",
              mainSection: {
                text: "amo",
                level: 0,
                ordinal: "",
                sectionId: "0",
              },
              senses: [],
            },
          },
        ],
      }),
      getCompletions: jest.fn().mockResolvedValue({
        ls: ["amo", "amor", "amicitia"],
      }),
    };

    app = express();
    app.use("/v2", createV2Router(mockFusedDict as FusedDictionary));
  });

  test("GET /v2/dicts returns full SSR HTML page with 200", async () => {
    const res = await request(app).get("/v2/dicts?q=amo");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("morcus-dict-search");
    expect(res.text).toContain("amo");
    expect(res.text).toContain("Lewis");
  });

  test("GET /v2/dicts with format=partial returns only the results snippet", async () => {
    const res = await request(app).get("/v2/dicts?q=amo&format=partial");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toContain("dict-card");
    expect(res.text).toContain("amo");
  });

  test("GET /v2/dicts filters by query param 'dict' without persisting it", async () => {
    const res = await request(app).get("/v2/dicts?q=amo&dict=ls,gaffiot");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["L&S", "GAF"],
      })
    );
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /v2/dicts uses cookie when no dict param is passed", async () => {
    const res = await request(app)
      .get("/v2/dicts?q=amo")
      .set("Cookie", "morcus_d=1u");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["GAF", "GRG"],
      })
    );
  });

  test("GET /v2/dicts filters by lang=La (Latin source only)", async () => {
    const res = await request(app).get(
      "/v2/dicts?q=amo&dict=ls,sh,gaffiot&lang=La"
    );
    expect(res.status).toBe(200);
    // L&S and GAF are Latin-source, S&H is English-to-Latin so excluded
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["L&S", "GAF"],
      })
    );
  });

  test("GET /v2/dicts/id/:id returns entry looked up by ID", async () => {
    const res = await request(app).get("/v2/dicts/id/n20077");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("ID n20077 - Morcus Dictionary");
    expect(res.text).toContain("amo");
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "n20077",
        mode: 2,
      })
    );
  });

  test("GET /v2/dicts sanitizes query parameter before fetching entries", async () => {
    const res = await request(app).get('/v2/dicts?q="amo,"');
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
      })
    );
  });

  test("GET /v2/dicts decodes Base36 d bitmask parameter", async () => {
    // 3 = (L&S [1] | GAF [2])
    const res = await request(app).get("/v2/dicts?q=amo&d=3");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["L&S", "GAF"],
        mode: 1,
      })
    );
  });

  test("GET /v2/dicts supports o=0 for exact headword matching and o=1 for inflections", async () => {
    const resExact = await request(app).get("/v2/dicts?q=amavi&o=0");
    expect(resExact.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amavi",
        mode: 0,
      })
    );

    const resInflected = await request(app).get("/v2/dicts?q=amavi&o=1");
    expect(resInflected.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amavi",
        mode: 1,
      })
    );
  });

  describe("No-JS form submissions", () => {
    test("honours a single selected dictionary without persisting it", async () => {
      const res = await request(app).get("/v2/dicts?q=amo&dict=GAF");
      expect(res.status).toBe(200);
      // Regression: "GAF" used to be read as base36 21111, enabling six dictionaries.
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ query: "amo", dicts: ["GAF"] })
      );
      // Ordinary searches are view state; only Apply (save=1) persists.
      expect(res.header["set-cookie"]).toBeUndefined();
    });

    test("Apply (save=1) persists, then 303s to the same URL without the marker", async () => {
      const res = await request(app).get(
        "/v2/dicts?q=amo&o=0&o=1&dict=GAF&save=1"
      );
      expect(res.status).toBe(303);
      expect(res.header["location"]).toBe("/v2/dicts?q=amo&o=0&o=1&dict=GAF");
      expect(res.header["cache-control"]).toBe("no-store");
      const cookies = res.header["set-cookie"].join("\n");
      expect(cookies).toContain("morcus_d=2;");
      expect(cookies).toContain("morcus_inflected=1;");
      // Redirects don't render, so nothing is queried.
      expect(mockFusedDict.getEntry).not.toHaveBeenCalled();
    });

    test("a shared link does not overwrite the recipient's preferences", async () => {
      const res = await request(app)
        .get("/v2/dicts?q=amo&d=2&o=0")
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      expect(res.status).toBe(200);
      // Renders the sender's exact view...
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["GAF"], mode: 0 })
      );
      // ...and only refreshes the recipient's own values.
      const cookies = res.header["set-cookie"].join("\n");
      expect(cookies).toContain("morcus_d=1;");
      expect(cookies).toContain("morcus_inflected=1;");
      expect(cookies).not.toContain("morcus_d=2");
      expect(cookies).not.toContain("morcus_inflected=0");
    });

    test("a shared link that differs from the recipient's settings opens in guest mode", async () => {
      const res = await request(app)
        .get("/v2/dicts?q=amo&d=2&o=0")
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Viewing this link's settings");
      expect(res.text).toMatch(/class="dict-checkbox"[^>]*disabled/);
      // Return drops the settings params so the recipient's cookies apply.
      expect(res.text).toContain(
        'href="/v2/dicts?q=amo">Return to my settings</a>'
      );
      // The link's settings ride along in hidden fields, so the next search keeps them.
      expect(res.text).toContain('<input type="hidden" name="d" value="2" />');
      expect(res.text).toContain('<input type="hidden" name="o" value="0" />');
    });

    test("no guest mode when the link matches the user's settings", async () => {
      const res = await request(app)
        .get("/v2/dicts?q=amo&d=1&o=1")
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("guest-chip");
      expect(res.text).not.toMatch(/class="dict-checkbox"[^>]*disabled/);
    });

    test("no guest mode without saved preferences", async () => {
      const res = await request(app).get("/v2/dicts?q=amo&d=2&o=0");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("guest-chip");
    });

    test("honours repeated dict checkboxes", async () => {
      const res = await request(app).get("/v2/dicts?q=amo&dict=L%26S&dict=GRG");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["L&S", "GRG"] })
      );
    });

    test("prefers the checkboxes over the bitmask rendered into the same form", async () => {
      // The hidden `d` is gone now, but a stale bitmask may still sit in the page URL that the
      // form submits from.
      const res = await request(app).get("/v2/dicts?q=amo&d=an&dict=GAF");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["GAF"] })
      );
    });

    test("re-enables inflection from the hidden-0 plus checked-1 pair", async () => {
      const res = await request(app)
        .get("/v2/dicts?q=amavi&o=0&o=1&dict=GAF")
        .set("Cookie", "morcus_d=2; morcus_inflected=0");

      expect(res.status).toBe(200);
      // Regression: ["0", "1"] matched neither branch, so the stale cookie kept inflection off.
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ query: "amavi", mode: 1 })
      );
    });

    test("disables inflection from the hidden 0 alone", async () => {
      const res = await request(app).get("/v2/dicts?q=amavi&o=0&dict=GAF");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 0 })
      );
    });

    test("saving an inflection change leaves the dictionary cookie alone", async () => {
      const res = await request(app)
        .get("/v2/dicts?q=amavi&o=0&save=1")
        .set("Cookie", "morcus_d=2");

      expect(res.status).toBe(303);
      expect(res.header["set-cookie"]).toEqual([
        expect.stringMatching(/^morcus_inflected=0;/),
      ]);
    });

    test("resolves a single-dictionary cookie exactly", async () => {
      const res = await request(app)
        .get("/v2/dicts?q=amo")
        .set("Cookie", "morcus_d=2");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["GAF"] })
      );
    });

    test("does not render a hidden bitmask input alongside the checkboxes", async () => {
      const res = await request(app).get("/v2/dicts?q=amo");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('name="d"');
      expect(res.text).toContain('name="dict"');
    });
  });

  test("GET /v2/dicts with reader query (embedded=1, o=1, lang=La) forces inflected search, filters to Latin lexica, and does not pollute cookies", async () => {
    (mockFusedDict.getEntry as jest.Mock).mockClear();

    // User has existing cookies: inflected disabled (morcus_inflected=0) and custom dicts
    const res = await request(app)
      .get("/v2/dicts?q=arma&embedded=1&o=1&lang=La")
      .set("Cookie", "morcus_d=29; morcus_inflected=0");

    expect(res.status).toBe(200);

    // 1. Inflected search is forced on (mode: 1) despite cookie morcus_inflected=0
    // 2. Only Latin-source dictionary from user's cookie (L&S) is queried; reverse dicts (S&H, GRG) are excluded
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "arma",
        dicts: ["L&S"],
        mode: 1,
      })
    );

    // 3. Does not set or overwrite cookies for transient reader lookups
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /v2/dicts never persists from an embedded view, even without lang", async () => {
    // Regression (F7): the guard used to key on `lang`, so an iframe that stopped sending it
    // would overwrite the user's preferences on every lookup.
    const res = await request(app)
      .get("/v2/dicts?q=arma&embedded=1&o=0&dict=GAF")
      .set("Cookie", "morcus_d=1; morcus_inflected=1");
    expect(res.status).toBe(200);
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /v2/dicts marks embedded views scoped and never uses guest mode", async () => {
    const res = await request(app)
      .get("/v2/dicts?q=arma&embedded=1&d=2")
      .set("Cookie", "morcus_d=1");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<form class="search-form"[^>]* data-scoped>/);
    expect(res.text).not.toContain("guest-chip");
  });

  test("GET /v2/dicts never persists from an iframe detected by Sec-Fetch-Dest", async () => {
    const res = await request(app)
      .get("/v2/dicts?q=arma&o=0&dict=GAF")
      .set("Sec-Fetch-Dest", "iframe");
    expect(res.status).toBe(200);
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /v2/dicts with Greek query renders Logeion fallback and skips Latin dict lookup", async () => {
    (mockFusedDict.getEntry as jest.Mock).mockClear();
    const res = await request(app).get(
      `/v2/dicts?q=${encodeURIComponent("λόγος")}`
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain('class="greek-fallback"');
    expect(res.text).toContain("This site does not (yet) support Greek.");
    expect(res.text).toContain(
      "https://logeion.uchicago.edu/%CE%BB%CF%8C%CE%B3%CE%BF%CF%82"
    );
    expect(res.text).toContain("<morcus-greek-embed");
    expect(mockFusedDict.getEntry).not.toHaveBeenCalled();
  });

  test("GET /v2/dicts with Greek query and format=partial returns only fallback fragment", async () => {
    const res = await request(app).get(
      `/v2/dicts?q=${encodeURIComponent("λόγος")}&format=partial`
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toContain('class="greek-fallback"');
    expect(res.text).toContain("This site does not (yet) support Greek.");
  });

  test("GET /v2/api/completions returns empty object for Greek query without dictionary lookup", async () => {
    (mockFusedDict.getCompletions as jest.Mock).mockClear();
    const res = await request(app).get(
      `/v2/api/completions?prefix=${encodeURIComponent("λόγος")}`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    expect(mockFusedDict.getCompletions).not.toHaveBeenCalled();
  });

  test("GET /v2/api/completions returns dictionary chunk map with Cache-Control header for prefix", async () => {
    const res = await request(app).get("/v2/api/completions?prefix=am");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("application/json");
    expect(res.header["cache-control"]).toContain("public, max-age=86400");
    expect(res.body).toEqual({
      ls: ["amicitia", "amo", "amor"],
    });
  });

  test("GET /v2/api/completions sanitizes query parameter", async () => {
    const res = await request(app).get('/v2/api/completions?prefix="am,"');
    expect(res.status).toBe(200);
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "am",
      })
    );
  });

  test("GET /v2/api/completions preserves suffix search query with leading hyphen", async () => {
    const res = await request(app).get("/v2/api/completions?q=-arum");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "-arum",
      })
    );
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /v2/api/completions scopes completions to requested dicts", async () => {
    const res = await request(app).get(
      "/v2/api/completions?prefix=am&dict=ls,gaffiot"
    );
    expect(res.status).toBe(200);
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "am",
        dicts: ["L&S", "GAF"],
      })
    );
  });

  test("GET /v2/api/completions partitions by language when dicts are specified", async () => {
    const res = await request(app).get(
      "/v2/api/completions?prefix=am&dict=gaffiot,georges"
    );
    expect(res.status).toBe(200);
    // Language-aware partitioning sends Latin dicts and German dicts separately
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "am",
        dicts: ["GAF"],
      })
    );
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "am",
        dicts: ["GRG"],
      })
    );
  });

  test("GET /v2/assets/v2.css serves the built, hashed stylesheet", async () => {
    const res = await request(app).get(getV2AssetHref("v2.css"));
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/css");
    expect(res.header["cache-control"]).toContain("immutable");
    expect(res.text).toContain(".lsOrth");
    expect(res.text).toContain("target-highlight");
    expect(res.text).not.toContain("2px dashed");
  });

  test("GET /v2/assets/manifest.json is not exposed", async () => {
    const res = await request(app).get("/v2/assets/manifest.json");
    expect(res.status).toBe(404);
  });

  test("GET /v2/api/completions/profile is not exposed", async () => {
    // Deliberately removed: it ran a synchronous gzip over up to 50k results on
    // an unauthenticated GET. If profiling is needed again, prefer an offline
    // script over a production route.
    const res = await request(app).get("/v2/api/completions/profile?q=am");
    expect(res.status).toBe(404);
  });

  test("GET /v2/about returns full About page with 200", async () => {
    const res = await request(app).get("/v2/about");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("About M&oacute;rcus");
    expect(res.text).toContain("GPL-3.0");
    expect(res.text).toContain("CC BY-SA 4.0");
    expect(res.text).toContain('href="/v2/about"');
    expect(res.text).toContain('class="nav-link active"');
  });

  test("GET /v2 redirects to /v2/dicts", async () => {
    const res = await request(app).get("/v2");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/v2/dicts");
  });

  test("GET /v2/assets/<chunk>.js serves all 5 built client chunks", async () => {
    const chunks = [
      { asset: "common.js" as const, expectedSymbol: "morcus-theme-toggle" },
      { asset: "dict.js" as const, expectedSymbol: "morcus-dict-search" },
      { asset: "reader.js" as const, expectedSymbol: "morcus-reader-view" },
      {
        asset: "external.js" as const,
        expectedSymbol: "morcus-external-loader",
      },
      { asset: "corpus.js" as const, expectedSymbol: "morcus-corpus-view" },
    ];

    for (const { asset, expectedSymbol } of chunks) {
      const res = await request(app).get(getV2AssetHref(asset));
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("javascript");
      expect(res.header["cache-control"]).toContain("immutable");
      expect(res.text).toContain(expectedSymbol);
    }
  });

  describe("GET /v2/reader", () => {
    test("returns 200 with reader layout and dictionary iframe placeholder when no q", async () => {
      const res = await request(app).get("/v2/reader");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("X-Requested-With");
      expect(res.text).toContain("<!DOCTYPE html>");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain("Julius Caesar");
      expect(res.text).toContain('id="dict-frame"');
      expect(res.text).toContain("/v2/dicts?embedded=1");
      expect(res.text).toContain("Open Dictionary Search");
      expect(res.text).toContain("Tap any word to view definitions");
    });

    test("returns 200 and points dictionary iframe to embedded query when q is supplied", async () => {
      const res = await request(app).get("/v2/reader?q=Gallia");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("X-Requested-With");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain('id="dict-frame"');
      expect(res.text).toContain(
        "/v2/dicts?q=Gallia&amp;lang=La&amp;o=1&amp;embedded=1"
      );
    });

    test("GET /v2/reader/:author/:name/:page? renders reader URL", async () => {
      const res = await request(app).get(
        "/v2/reader/caesar/de_bello_gallico/1.1"
      );
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("X-Requested-With");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain("De bello Gallico");
      expect(res.text).toContain("Gallia est omnis divisa in partes tres");
    });

    test("GET /v2/reader/:author/:name/:page? with format=partial returns only the passage slot fragment", async () => {
      const res = await request(app).get(
        "/v2/reader/caesar/de_bello_gallico/1.1?format=partial"
      );
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("X-Requested-With");
      expect(res.text).not.toContain("<!DOCTYPE html>");
      expect(res.text).toContain('data-slot="text"');
      expect(res.text).toContain("Gallia est omnis divisa in partes tres");
    });

    test("GET /v2/reader/:author/:name/:page? returns 404 for unknown works", async () => {
      const res = await request(app).get(
        "/v2/reader/unknown_author/nonexistent_work"
      );
      expect(res.status).toBe(404);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("Classical Work Not Found");
      expect(res.text).toContain("unknown_author/nonexistent_work");
      expect(res.text).toContain('href="/v2/library"');
      expect(res.text).toContain("not-found-state");
      expect(res.text).not.toContain("style=");
    });

    test("GET /v2/reader/:author/:name/:page/translation returns 200 and translation snippet for translated works", async () => {
      const res = await request(app).get(
        "/v2/reader/sallust/catalina1/1/translation"
      );
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("reader-translation-content");
      expect(res.text).toContain("reader-translation-header");
      expect(res.text).toContain("John Selby Watson");
      expect(res.text).toContain("reader-translation-body");
    });

    test("GET /v2/reader/:author/:name/:page/translation returns 404 for untranslated works", async () => {
      const res = await request(app).get(
        "/v2/reader/caesar/de_bello_gallico/1.1/translation"
      );
      expect(res.status).toBe(404);
      expect(res.text).toBe("Translation not found");
    });

    test("GET /v2/reader/:author/:name/:page/translation returns 404 for unknown works", async () => {
      const res = await request(app).get(
        "/v2/reader/unknown_author/nonexistent_work/1/translation"
      );
      expect(res.status).toBe(404);
      expect(res.text).toBe("Translation not found");
    });

    test("GET /v2/reader/:author/:name redirects matchText links to the matched page and section when :page is omitted", async () => {
      const res = await request(app).get(
        "/v2/reader/caesar/de_bello_gallico?matchText=1.2.1~0~2"
      );
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(
        "/v2/reader/caesar/de_bello_gallico/1.2?matchText=1.2.1%7E0%7E2#sec-1.2.1"
      );
    });

    test("GET /v2/reader/:author/:name/:page with matchText renders the requested page without redirecting", async () => {
      const res = await request(app).get(
        "/v2/reader/caesar/de_bello_gallico/1.2?matchText=1.2.1~0~2"
      );
      expect(res.status).toBe(200);
      expect(res.text).toContain('id="sec-1.2.1"');
    });

    test("GET /v2/reader/:author/:name/:page?jump=... preserves matchText across redirect", async () => {
      const res = await request(app).get(
        "/v2/reader/caesar/de_bello_gallico/1.1?jump=1.2.1&matchText=1.2.1~0~2&q=Orgetorix"
      );
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(
        "/v2/reader/caesar/de_bello_gallico/1.2?q=Orgetorix&matchText=1.2.1%7E0%7E2#sec-1.2.1"
      );
    });
  });

  describe("GET /v2/dicts with embedded mode", () => {
    test("renders minimal dictionary panel suitable for iframe and queries dictionary", async () => {
      const res = await request(app).get("/v2/dicts?q=Gallia&embedded=1");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("dict-card");
      expect(res.text).toContain("body-embedded");
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "Gallia",
          mode: 1,
        })
      );
    });

    test("suppresses table of contents in embedded mode", async () => {
      const res = await request(app).get("/v2/dicts?q=Gallia&embedded=1");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("has-toc");
      expect(res.text).not.toContain("drawer-toc");
    });

    test("partial format in embedded mode returns fragment without TOC and with lexicon badges", async () => {
      const res = await request(app).get(
        "/v2/dicts?q=Gallia&embedded=1&format=partial"
      );
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).not.toContain("<!DOCTYPE html>");
      expect(res.text).not.toContain("has-toc");
      expect(res.text).not.toContain("drawer-toc");
      expect(res.text).toContain("dict-card");
      expect(res.text).toContain("dict-badge");
    });

    test("SSR injects clamped font scale style tag from ?scale= query param", async () => {
      const res = await request(app).get("/v2/dicts?q=Gallia&scale=120");
      expect(res.status).toBe(200);
      expect(res.text).toContain(
        "<style>:root { --dict-scale: 1.20; }</style>"
      );

      const maxRes = await request(app).get("/v2/dicts?q=Gallia&scale=200");
      expect(maxRes.text).toContain(
        "<style>:root { --dict-scale: 1.40; }</style>"
      );

      const minRes = await request(app).get("/v2/dicts?q=Gallia&scale=40");
      expect(minRes.text).toContain(
        "<style>:root { --dict-scale: 0.70; }</style>"
      );

      const invalidRes = await request(app).get("/v2/dicts?q=Gallia&scale=abc");
      expect(invalidRes.text).not.toContain("--dict-scale");
    });

    test("GET /v2/dicts/id/:id injects font scale style tag from ?scale=", async () => {
      const res = await request(app).get("/v2/dicts/id/n20077?scale=125");
      expect(res.status).toBe(200);
      expect(res.text).toContain(
        "<style>:root { --dict-scale: 1.25; }</style>"
      );
    });
  });

  describe("GET /v2/library", () => {
    test("returns 200 with catalog and author groupings", async () => {
      const res = await request(app).get("/v2/library");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("morcus-library-view");
      expect(res.text).toContain("Welcome to the library!");
      expect(res.text).toContain("search-form");
      expect(res.text).toContain("Julius Caesar");
      expect(res.text).toContain("work-card");
      expect(res.text).not.toContain("work-card-btn");
      expect(res.text).not.toContain("chapters");
      expect(res.text).not.toContain("badge-perseus");
      expect(res.text).not.toContain("badge-phi");
    });
  });

  describe("POST /v2/api/report", () => {
    test("submits issue report successfully and returns 200 with JSON", async () => {
      const mockReportHandler = jest.fn().mockResolvedValue(undefined);
      const testApp = express();
      testApp.use(
        "/v2",
        createV2Router(mockFusedDict as FusedDictionary, {
          reportHandler: mockReportHandler,
        })
      );

      const res = await request(testApp).post("/v2/api/report").send({
        reportText: "Found a typo in entry",
        url: "http://localhost:1337/v2/dicts?q=amo",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockReportHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          reportText: "Found a typo in entry",
          url: "http://localhost:1337/v2/dicts?q=amo",
        })
      );
    });

    test("submits in-flow editedText correction with tags and returns 200", async () => {
      const mockReportHandler = jest.fn().mockResolvedValue(undefined);
      const testApp = express();
      testApp.use(
        "/v2",
        createV2Router(mockFusedDict as FusedDictionary, {
          reportHandler: mockReportHandler,
        })
      );

      const res = await request(testApp)
        .post("/v2/api/report")
        .send({
          editedText: {
            original: "Gallia est omnes divisa",
            edited: "Gallia est omnis divisa",
            sectionId: "1.1.1",
          },
          tags: ["userEdit"],
          url: "http://localhost:1337/v2/reader/caesar/bg/1.1#sec-1.1.1",
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockReportHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          editedText: {
            original: "Gallia est omnes divisa",
            edited: "Gallia est omnis divisa",
            sectionId: "1.1.1",
          },
          tags: ["userEdit"],
          url: "http://localhost:1337/v2/reader/caesar/bg/1.1#sec-1.1.1",
        })
      );
    });

    test("returns 400 when both reportText and editedText are missing or empty", async () => {
      const res = await request(app)
        .post("/v2/api/report")
        .send({ reportText: "   " });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: "Either reportText or editedText is required",
      });
    });

    test("returns 500 when issue reporting handler throws an error", async () => {
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const mockReportHandler = jest
          .fn()
          .mockRejectedValue(new Error("GitHub API Error"));
        const testApp = express();
        testApp.use(
          "/v2",
          createV2Router(mockFusedDict as FusedDictionary, {
            reportHandler: mockReportHandler,
          })
        );

        const res = await request(testApp)
          .post("/v2/api/report")
          .send({ reportText: "Broken page" });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Failed to submit report" });
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Error submitting report:",
          expect.any(Error)
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe("dictionary lookup failures", () => {
    const PAYLOAD = '<img src=x onerror="alert(1)">';
    let consoleErrorSpy: jest.SpyInstance;

    /**
     * Asserts the payload was reflected as inert text rather than live markup.
     *
     * Note we cannot simply assert the absence of "<img": the app bar always
     * renders a legitimate brand-logo <img>, and the escaped payload still
     * contains the literal word "onerror" as harmless text.
     */
    function expectPayloadNeutralized(html: string): void {
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;img");
    }

    beforeEach(() => {
      consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFusedDict.getEntry = jest
        .fn()
        .mockRejectedValue(new Error("dictionary backend exploded"));
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test("escapes the query in the partial error response", async () => {
      const res = await request(app).get(
        `/v2/dicts?format=partial&q=${encodeURIComponent(PAYLOAD)}`
      );

      expect(res.status).toBe(500);
      expect(res.text).toContain("An error occurred searching for");
      expectPayloadNeutralized(res.text);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error retrieving dictionary entry:",
        expect.any(Error)
      );
    });

    test("escapes the query in the full page error response", async () => {
      const res = await request(app).get(
        `/v2/dicts?q=${encodeURIComponent(PAYLOAD)}`
      );

      expect(res.status).toBe(500);
      expectPayloadNeutralized(res.text);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error retrieving dictionary entry:",
        expect.any(Error)
      );
    });

    test("escapes the id in the partial error response", async () => {
      const res = await request(app).get(
        `/v2/dicts/id/${encodeURIComponent(PAYLOAD)}?format=partial`
      );

      expect(res.status).toBe(500);
      expect(res.text).toContain("An error occurred retrieving ID");
      expectPayloadNeutralized(res.text);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error retrieving dictionary entry by ID:",
        expect.any(Error)
      );
    });

    test("escapes the id in the full page error response", async () => {
      const res = await request(app).get(
        `/v2/dicts/id/${encodeURIComponent(PAYLOAD)}`
      );

      expect(res.status).toBe(500);
      expectPayloadNeutralized(res.text);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error retrieving dictionary entry by ID:",
        expect.any(Error)
      );
    });
  });

  describe("reader loader failures", () => {
    /**
     * These two routes `await getV2Work` outside of any `try`, so a rejection
     * escapes the handler entirely. Express 4 ignores the promise a handler
     * returns, so without an `asyncHandler` wrapper the rejection surfaces as
     * an unhandled rejection (which terminates the process on Node 15+) and
     * the request itself simply hangs. Asserting on the 500 pins the wrapper.
     */
    const FAILING_ROUTES = [
      "/v2/reader?q=Gallia",
      "/v2/reader/caesar/de_bello_gallico/1.1",
    ];

    beforeEach(() => {
      (getV2Work as jest.Mock).mockRejectedValue(new Error("loader exploded"));
    });

    afterEach(() => {
      // `mockReset` alone would leave the mock without an implementation, so
      // reinstate the fixture-backed one for any later test.
      (getV2Work as jest.Mock).mockReset();
      (getV2Work as jest.Mock).mockImplementation(realGetV2Work);
    });

    test.each(FAILING_ROUTES)(
      "GET %s responds 500 instead of hanging",
      async (route) => {
        const res = await request(app).get(route);

        expect(res.status).toBe(500);
      }
    );
  });
});
