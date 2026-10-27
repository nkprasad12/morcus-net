import express from "express";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { JSDOM } from "jsdom";
import { encodeDictBitmask } from "@/web/ui/dict/settings/dict_bitmask.common";
import { createInMemoryPrecompressedStore } from "@/web/ui/core/server/precompressed_json.server";
import { createV2Router } from "@/web/ui/app_router.server";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { brotliDecompressSync, gunzipSync } from "zlib";
import { buildV2Bundle } from "@/bundler/client.rsbuild";
import { V2_ASSET_NAMES } from "@/bundler/client_build_contract";
import { getV2AssetHref } from "@/web/ui/shell/asset_manifest.server";
import { getV2Work } from "@/web/ui/reader/reader_loader.server";
import { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";

// The mock loader is the real fixture-backed implementation, except that
// `getV2Work` is wrapped in a `jest.fn` so tests can force it to reject and
// exercise the reader routes' failure path.
jest.mock("@/web/ui/reader/reader_loader.server", () => {
  const actual = jest.requireActual("@/web/ui/testing/mock_reader_loader");
  return {
    __esModule: true,
    ...actual,
    getV2Work: jest.fn(actual.getV2Work),
  };
});

const realGetV2Work: typeof getV2Work = jest.requireActual<
  typeof import("@/web/ui/testing/mock_reader_loader")
>("@/web/ui/testing/mock_reader_loader").getV2Work;

describe("app_router integration", () => {
  let app: express.Express;
  let mockFusedDict: Partial<FusedDictionary>;

  // Build into a temporary directory: writing `build/client` would replace the
  // assets a running dev server is serving with a Jest-mode bundle.
  let buildDir: string;
  const savedBuildDir = process.env.MORCUS_V2_BUILD_DIR;

  beforeAll(async () => {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-v2-build-"));
    process.env.MORCUS_V2_BUILD_DIR = buildDir;
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Precompressed like a production build, to check the siblings.
      await buildV2Bundle(false, { precompress: true });
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
            entry: '<span class="lsOrth">amo</span>',
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
    app.use("/", createV2Router(mockFusedDict as FusedDictionary));
  });

  test("GET /dicts returns full SSR HTML page with 200", async () => {
    const res = await request(app).get("/dicts?q=amo");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("morcus-dict-search");
    expect(res.text).toContain("amo");
    expect(res.text).toContain("Lewis");
    expect(res.text).toContain(
      '<link rel="canonical" href="https://morcus.net/dicts?q=amo">'
    );
  });

  test("GET /dicts with format=partial returns only the results snippet", async () => {
    const res = await request(app).get("/dicts?q=amo&format=partial");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toContain("dict-card");
    expect(res.text).toContain("amo");
  });

  test("GET /dicts filters by query param 'dict' without persisting it", async () => {
    const res = await request(app).get("/dicts?q=amo&dict=LnS,GAF");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["L&S", "GAF"],
      }),
      expect.anything()
    );
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /dicts uses cookie when no dict param is passed", async () => {
    const res = await request(app)
      .get("/dicts?q=amo")
      .set("Cookie", "morcus_d=1u");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["GAF", "GRG"],
      }),
      expect.anything()
    );
  });

  test("GET /dicts filters by lang=La (Latin source only)", async () => {
    const res = await request(app).get("/dicts?q=amo&dict=LnS,SnH,GAF&lang=La");
    expect(res.status).toBe(200);
    // L&S and GAF are Latin-source, S&H is English-to-Latin so excluded
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["L&S", "GAF"],
      }),
      expect.anything()
    );
  });

  test("GET /dicts supports legacy V1 hyphen-delimited lang=La-En", async () => {
    const res = await request(app).get(
      "/dicts?q=love&dict=LnS,SnH,GRG&lang=La-En"
    );
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "love",
        dicts: ["L&S", "S&H"],
      }),
      expect.anything()
    );
  });

  test("GET /dicts?q=<id>&o=2 redirects legacy V1 ID lookups to /dicts/id/:id", async () => {
    const res = await request(app).get("/dicts?q=n20077&o=2");
    expect(res.status).toBe(302);
    expect(res.header["location"]).toBe("/dicts/id/n20077");
  });

  test("GET /dicts/id/:id returns entry looked up by ID and renders the user's saved settings", async () => {
    const res = await request(app)
      .get("/dicts/id/n20077")
      .set("Cookie", "morcus_d=2; morcus_inflected=0");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("<title>amo | LS | Morcus Latin Tools</title>");
    expect(res.text).toContain(
      '<link rel="canonical" href="https://morcus.net/dicts/id/n20077">'
    );
    expect(res.text).toContain("amo");
    // The search bar reflects the user's saved GAF-only, exact-headword preferences.
    expect(res.text).toContain('data-d="2" data-o="0"');
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "n20077",
        mode: 2,
      }),
      expect.anything()
    );
  });

  test("GET /dicts/id/:id?q=... redirects to /dicts preserving all query parameters", async () => {
    const res = await request(app).get(
      "/dicts/id/n20077?q=bellum&d=2&o=0&embedded=1"
    );
    expect(res.status).toBe(302);
    expect(res.header["location"]).toBe("/dicts?q=bellum&d=2&o=0&embedded=1");
  });

  test("GET /dicts/id/:id?format=partial returns only the results snippet without page shell or guest-return", async () => {
    const res = await request(app)
      .get("/dicts/id/n20077?format=partial&d=2&o=0")
      .set("Cookie", "morcus_d=1; morcus_inflected=1");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.headers["vary"]).toContain("X-Requested-With");
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).not.toContain("<html");
    expect(res.text).not.toContain("guest-return");
    expect(res.text).toContain("dict-card");
    expect(res.text).toContain("amo");
  });

  test("GET /dicts sanitizes query parameter before fetching entries", async () => {
    const res = await request(app).get('/dicts?q="amo,"');
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
      }),
      expect.anything()
    );
  });

  test("GET /dicts decodes Base36 d bitmask parameter", async () => {
    // 3 = (L&S [1] | GAF [2])
    const res = await request(app).get("/dicts?q=amo&d=3");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["L&S", "GAF"],
        mode: 1,
      }),
      expect.anything()
    );
  });

  test("GET /dicts supports o=0 for exact headword matching and o=1 for inflections", async () => {
    const resExact = await request(app).get("/dicts?q=amavi&o=0");
    expect(resExact.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amavi",
        mode: 0,
      }),
      expect.anything()
    );

    const resInflected = await request(app).get("/dicts?q=amavi&o=1");
    expect(resInflected.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amavi",
        mode: 1,
      }),
      expect.anything()
    );
  });

  describe("No-JS form submissions", () => {
    test("honours a single selected dictionary without persisting it", async () => {
      const res = await request(app).get("/dicts?q=amo&dict=GAF");
      expect(res.status).toBe(200);
      // "GAF" is a dictionary key, not a base36 bitmask.
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ query: "amo", dicts: ["GAF"] }),
        expect.anything()
      );
      // Ordinary searches are view state; only Apply (save=1) persists.
      expect(res.header["set-cookie"]).toBeUndefined();
    });

    test("Done (save=1) persists, then 303s to the canonical URL without the marker", async () => {
      const res = await request(app).get(
        "/dicts?q=amo&o=0&o=1&dict=GAF&save=1"
      );
      expect(res.status).toBe(303);
      expect(res.header["location"]).toBe("/dicts?q=amo&o=1&d=2");
      expect(res.header["cache-control"]).toBe("no-store");
      const cookies = res.header["set-cookie"].join("\n");
      expect(cookies).toContain("morcus_d=2;");
      expect(cookies).toContain("morcus_inflected=1;");
      // Redirects don't render, so nothing is queried.
      expect(mockFusedDict.getEntry).not.toHaveBeenCalled();
    });

    test("cross-site request with save=1 strips the marker without writing cookies", async () => {
      const res = await request(app)
        .get("/dicts?q=amo&o=0&dict=GAF&save=1")
        .set("Sec-Fetch-Site", "cross-site");
      expect(res.status).toBe(303);
      expect(res.header["location"]).toBe("/dicts?q=amo&o=0&d=2");
      expect(res.header["set-cookie"]).toBeUndefined();
    });

    test("a shared link does not overwrite the recipient's preferences", async () => {
      const res = await request(app)
        .get("/dicts?q=amo&d=2&o=0")
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      expect(res.status).toBe(200);
      // Renders the sender's exact view...
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["GAF"], mode: 0 }),
        expect.anything()
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
        .get("/dicts?q=amo&d=2&o=0")
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Using link settings");
      expect(res.text).toMatch(/class="dict-checkbox"[^>]*disabled/);
      // Return drops the settings params so the recipient's cookies apply.
      expect(res.text).toContain('href="/dicts?q=amo">Restore saved</a>');
      // The link's settings ride along in hidden fields, so the next search keeps them.
      expect(res.text).toContain('<input type="hidden" name="d" value="2" />');
      expect(res.text).toContain('<input type="hidden" name="o" value="0" />');
    });

    test("no guest mode when the link matches the user's settings", async () => {
      const res = await request(app)
        .get("/dicts?q=amo&d=1&o=1")
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("guest-chip");
      expect(res.text).not.toMatch(/class="dict-checkbox"[^>]*disabled/);
    });

    test("no guest mode without saved preferences", async () => {
      const res = await request(app).get("/dicts?q=amo&d=2&o=0");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("guest-chip");
    });

    test("honours repeated dict checkboxes", async () => {
      const res = await request(app).get("/dicts?q=amo&dict=L%26S&dict=GRG");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["L&S", "GRG"] }),
        expect.anything()
      );
    });

    test("prefers the checkboxes over the bitmask rendered into the same form", async () => {
      // The hidden `d` is gone now, but a stale bitmask may still sit in the page URL that the
      // form submits from.
      const res = await request(app).get("/dicts?q=amo&d=an&dict=GAF");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["GAF"] }),
        expect.anything()
      );
    });

    test("re-enables inflection from the hidden-0 plus checked-1 pair", async () => {
      const res = await request(app)
        .get("/dicts?q=amavi&o=0&o=1&dict=GAF")
        .set("Cookie", "morcus_d=2; morcus_inflected=0");

      expect(res.status).toBe(200);
      // Regression: ["0", "1"] matched neither branch, so the stale cookie kept inflection off.
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ query: "amavi", mode: 1 }),
        expect.anything()
      );
    });

    test("disables inflection from the hidden 0 alone", async () => {
      const res = await request(app).get("/dicts?q=amavi&o=0&dict=GAF");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 0 }),
        expect.anything()
      );
    });

    test("saving an inflection change leaves the dictionary cookie alone", async () => {
      const res = await request(app)
        .get("/dicts?q=amavi&o=0&save=1")
        .set("Cookie", "morcus_d=2");

      expect(res.status).toBe(303);
      expect(res.header["set-cookie"]).toEqual([
        expect.stringMatching(/^morcus_inflected=0;/),
      ]);
    });

    test("resolves a single-dictionary cookie exactly", async () => {
      const res = await request(app)
        .get("/dicts?q=amo")
        .set("Cookie", "morcus_d=2");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({ dicts: ["GAF"] }),
        expect.anything()
      );
    });

    test("the settings form has the checkboxes and no hidden bitmask; the search form carries d", async () => {
      const res = await request(app).get("/dicts?q=amo");
      expect(res.status).toBe(200);
      const settingsForm = res.text.match(
        /<form class="dict-settings-form"[\s\S]*?<\/form>/
      )?.[0];
      expect(settingsForm).toBeDefined();
      expect(settingsForm).not.toContain('name="d"');
      expect(settingsForm).toContain('name="dict"');
      const searchForm = res.text.match(
        /<form class="search-form"[\s\S]*?<\/form>/
      )?.[0];
      expect(searchForm).toContain('<input type="hidden" name="d"');
      expect(searchForm).not.toContain('name="dict"');
    });
  });

  test("GET /dicts with reader query (embedded=1, o=1, lang=La) forces inflected search, filters to Latin lexica, and does not pollute cookies", async () => {
    (mockFusedDict.getEntry as jest.Mock).mockClear();

    // User has existing cookies: inflected disabled (morcus_inflected=0) and custom dicts
    const res = await request(app)
      .get("/dicts?q=arma&embedded=1&o=1&lang=La")
      .set("Cookie", "morcus_d=29; morcus_inflected=0");

    expect(res.status).toBe(200);

    // 1. Inflected search is forced on (mode: 1) despite cookie morcus_inflected=0
    // 2. Only Latin-source dictionary from user's cookie (L&S) is queried; reverse dicts (S&H, GRG) are excluded
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "arma",
        dicts: ["L&S"],
        mode: 1,
      }),
      expect.anything()
    );

    // 3. Does not set or overwrite cookies for transient reader lookups
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /dicts never persists from an embedded view, even without lang", async () => {
    // Embedded dictionary requests must never write preference cookies, even without `lang`.
    const res = await request(app)
      .get("/dicts?q=arma&embedded=1&o=0&dict=GAF")
      .set("Cookie", "morcus_d=1; morcus_inflected=1");
    expect(res.status).toBe(200);
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /dicts reader lookup: the settings form saves in scope, the search form leaves it", async () => {
    const res = await request(app)
      .get("/dicts?q=arma&embedded=1&o=1&lang=La")
      .set("Cookie", "morcus_d=29; morcus_inflected=0");
    expect(res.status).toBe(200);
    expect(res.header["set-cookie"]).toBeUndefined();

    const doc = new JSDOM(res.text).window.document;
    const hidden = (form: Element, name: string) =>
      Array.from(
        form.querySelectorAll(`input[type="hidden"][name="${name}"]`)
      ).map((i) => i.getAttribute("value"));
    const search = doc.querySelector("form.search-form")!;
    const settings = doc.querySelector("form.dict-settings-form")!;
    expect(hidden(settings, "lang")).toEqual(["La"]);
    expect(hidden(settings, "embedded")).toEqual(["1"]);
    expect(hidden(settings, "o")).toEqual(["1"]);
    expect(hidden(search, "lang")).toEqual([]);
    expect(hidden(search, "d")).toEqual([]);
    expect(hidden(search, "embedded")).toEqual(["1"]);
    expect(settings.hasAttribute("data-scoped")).toBe(false);
    expect(
      settings.querySelector('button[name="save"][value="1"]')
    ).not.toBeNull();
    expect(settings.querySelector("#toggle-inflected")).toBeNull();
    expect(res.text).not.toContain("guest-chip");
  });

  test("GET /dicts reader save=1 merges into morcus_d and redirects to the cookie-driven lookup", async () => {
    const saved = encodeDictBitmask(["L&S", "S&H", "GRG"]);
    const res = await request(app)
      .get("/dicts?q=arma&lang=La&embedded=1&o=1&dict=GAF&save=1")
      .set("Cookie", `morcus_d=${saved}; morcus_inflected=0`);
    expect(res.status).toBe(303);
    expect(res.header.location).toBe("/dicts?q=arma&lang=La&embedded=1&o=1");
    const cookies: string[] = res.header["set-cookie"] as unknown as string[];
    expect(cookies).toEqual([
      `morcus_d=${encodeDictBitmask([
        "GAF",
        "S&H",
        "GRG",
      ])}; Path=/; Max-Age=31536000; SameSite=Lax`,
    ]);
  });

  test("GET /dicts scoped link whose dictionaries differ from the saved in-scope ones is a guest view", async () => {
    const res = await request(app)
      .get("/dicts?q=arma&embedded=1&o=1&lang=La&d=2")
      .set("Cookie", "morcus_d=1");
    expect(res.status).toBe(200);
    expect(res.text).toContain("guest-chip");
    const doc = new JSDOM(res.text).window.document;
    expect(doc.querySelector("a.guest-return")?.getAttribute("href")).toBe(
      "/dicts?q=arma&embedded=1&o=1&lang=La"
    );
  });

  test("GET /dicts scoped lookup ignores out-of-scope saved dictionaries for guest mode", async () => {
    const res = await request(app)
      .get("/dicts?q=arma&embedded=1&o=1&lang=La")
      .set(
        "Cookie",
        `morcus_d=${encodeDictBitmask(["L&S", "S&H"])}; morcus_inflected=0`
      );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("guest-chip");
  });

  test("GET /dicts scoped lookup falls back to in-scope defaults without guest mode when cookie has only out-of-scope dicts", async () => {
    (mockFusedDict.getEntry as jest.Mock).mockClear();
    const res = await request(app)
      .get("/dicts?q=arma&embedded=1&o=1&lang=La")
      .set("Cookie", `morcus_d=${encodeDictBitmask(["S&H", "R&A"])}`);
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "arma",
        dicts: ["L&S", "GAF", "GES", "FOR", "NUM"],
        mode: 1,
      }),
      expect.anything()
    );
    expect(res.text).not.toContain("guest-chip");
  });

  test("GET /dicts never persists from an iframe detected by Sec-Fetch-Dest", async () => {
    const res = await request(app)
      .get("/dicts?q=arma&o=0&dict=GAF")
      .set("Sec-Fetch-Dest", "iframe");
    expect(res.status).toBe(200);
    expect(res.header["set-cookie"]).toBeUndefined();
  });

  test("GET /dicts with Greek query renders Logeion fallback and skips Latin dict lookup", async () => {
    (mockFusedDict.getEntry as jest.Mock).mockClear();
    const res = await request(app).get(
      `/dicts?q=${encodeURIComponent("λόγος")}`
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

  test("GET /dicts with Greek query and format=partial returns only fallback fragment", async () => {
    const res = await request(app).get(
      `/dicts?q=${encodeURIComponent("λόγος")}&format=partial`
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toContain('class="greek-fallback"');
    expect(res.text).toContain("This site does not (yet) support Greek.");
  });

  test("GET /api/completions returns empty object for Greek query without dictionary lookup", async () => {
    (mockFusedDict.getCompletions as jest.Mock).mockClear();
    const res = await request(app).get(
      `/api/completions?prefix=${encodeURIComponent("λόγος")}`
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    expect(mockFusedDict.getCompletions).not.toHaveBeenCalled();
  });

  test("GET /api/completions returns dictionary chunk map for prefix", async () => {
    const res = await request(app).get("/api/completions?prefix=am");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("application/json");
    expect(res.body).toEqual({
      ls: ["amicitia", "amo", "amor"],
    });
  });

  test("GET /api/completions serves pre-compressed 2-letter unscoped chunks when completions store is configured", async () => {
    const completions = createInMemoryPrecompressedStore(
      new Map([["am", JSON.stringify({ "L&S": ["amo", "amor"] })]])
    );
    const precompressedApp = express();
    precompressedApp.use(
      "/",
      createV2Router(mockFusedDict as FusedDictionary, { completions })
    );

    (mockFusedDict.getCompletions as jest.Mock).mockClear();
    const hit = await request(precompressedApp)
      .get("/api/completions?prefix=am")
      .set("Accept-Encoding", "gzip");
    expect(hit.status).toBe(200);
    expect(hit.headers["content-encoding"]).toBe("gzip");
    expect(hit.body).toEqual({ "L&S": ["amo", "amor"] });
    expect(mockFusedDict.getCompletions).not.toHaveBeenCalled();

    // Unknown 2-letter prefix returns pre-compressed "{}" without querying fusedDict.
    const miss = await request(precompressedApp)
      .get("/api/completions?prefix=zz")
      .set("Accept-Encoding", "gzip");
    expect(miss.status).toBe(200);
    expect(miss.body).toEqual({});
    expect(mockFusedDict.getCompletions).not.toHaveBeenCalled();

    // dict/d query params on prefix requests are ignored and still served from the store.
    const withDictParam = await request(precompressedApp)
      .get("/api/completions?prefix=am&dict=L%26S")
      .set("Accept-Encoding", "gzip");
    expect(withDictParam.status).toBe(200);
    expect(withDictParam.body).toEqual({ "L&S": ["amo", "amor"] });
    expect(mockFusedDict.getCompletions).not.toHaveBeenCalled();
  });

  describe("build-versioned caching", () => {
    const savedCommit = process.env.COMMIT_ID;
    const IMMUTABLE = "max-age=31536000, immutable";

    beforeEach(() => {
      process.env.COMMIT_ID = "abc123";
    });

    afterEach(() => {
      if (savedCommit === undefined) delete process.env.COMMIT_ID;
      else process.env.COMMIT_ID = savedCommit;
    });

    test("prefix chunks at the current version are public and immutable", async () => {
      const res = await request(app).get("/api/completions?prefix=am&v=abc123");
      expect(res.header["cache-control"]).toBe(`public, ${IMMUTABLE}`);
    });

    test("prefix chunks ignore the dictionary cookie (they are cached publicly)", async () => {
      const getCompletions = mockFusedDict.getCompletions as jest.Mock;
      getCompletions.mockClear();
      const plain = await request(app).get(
        "/api/completions?prefix=am&v=abc123"
      );
      const plainCalls = getCompletions.mock.calls.map((call) => call[0]);

      getCompletions.mockClear();
      const withCookie = await request(app)
        .get("/api/completions?prefix=am&v=abc123")
        .set("Cookie", `morcus_d=${encodeDictBitmask(["L&S"])}`);
      const cookieCalls = getCompletions.mock.calls.map((call) => call[0]);

      expect(plainCalls.length).toBeGreaterThan(0);
      expect(cookieCalls).toEqual(plainCalls);
      expect(withCookie.body).toEqual(plain.body);
    });

    test("prefix chunks without the current version revalidate", async () => {
      for (const url of [
        "/api/completions?prefix=am",
        "/api/completions?prefix=am&v=old",
      ]) {
        const res = await request(app).get(url);
        expect(res.header["cache-control"]).toBe("no-cache");
      }
    });

    test("suffix completions are never versioned (they read cookies)", async () => {
      const res = await request(app).get("/api/completions?q=-arum&v=abc123");
      expect(res.header["cache-control"]).toBeUndefined();
    });

    test("reader page-turn partials at the current version are private and immutable", async () => {
      const res = await request(app)
        .get("/work/caesar/de_bello_gallico/1.1?v=abc123")
        .set("X-Requested-With", "fetch");
      expect(res.status).toBe(200);
      expect(res.header["cache-control"]).toBe(`private, ${IMMUTABLE}`);
      expect(res.headers["vary"]).toContain("X-Requested-With");
    });

    test("reader partials with a stale version revalidate", async () => {
      const res = await request(app)
        .get("/work/caesar/de_bello_gallico/1.1?v=old")
        .set("X-Requested-With", "fetch");
      expect(res.header["cache-control"]).toBe("no-cache");
    });

    test("full reader pages are never versioned", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico/1.1?v=abc123"
      );
      expect(res.status).toBe(200);
      expect(res.text).toContain('<html lang="en" data-version="abc123">');
      expect(res.header["cache-control"]).toBeUndefined();
    });

    test("translations at the current version are private and immutable", async () => {
      const res = await request(app).get(
        "/work/sallust/catalina1/1/translation?v=abc123"
      );
      expect(res.status).toBe(200);
      expect(res.header["cache-control"]).toBe(`private, ${IMMUTABLE}`);
    });

    test("a missing translation is never cached", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico/1.1/translation?v=abc123"
      );
      expect(res.status).toBe(404);
      expect(res.header["cache-control"]).toBeUndefined();
    });

    test("/dicts and /dicts/id/:id partials at the current version are private and immutable", async () => {
      for (const url of [
        "/dicts?q=amo&format=partial&v=abc123",
        "/dicts?format=partial&v=abc123",
        `/dicts?q=${encodeURIComponent("λόγος")}&format=partial&v=abc123`,
        "/dicts/id/n20077?format=partial&v=abc123",
      ]) {
        const res = await request(app).get(url);
        expect(res.status).toBe(200);
        expect(res.header["cache-control"]).toBe(`private, ${IMMUTABLE}`);
        expect(res.headers["vary"]).toContain("X-Requested-With");
      }
    });

    test("/dicts and /dicts/id/:id partials with a missing or stale version revalidate", async () => {
      for (const url of [
        "/dicts?q=amo&format=partial",
        "/dicts?q=amo&format=partial&v=old",
        "/dicts/id/n20077?format=partial",
        "/dicts/id/n20077?format=partial&v=old",
      ]) {
        const res = await request(app).get(url);
        expect(res.status).toBe(200);
        expect(res.header["cache-control"]).toBe("no-cache");
      }
    });

    test("full /dicts and /dicts/id/:id pages and 500 error partials are never cached as immutable", async () => {
      for (const url of [
        "/dicts?q=amo&v=abc123",
        "/dicts?v=abc123",
        "/dicts/id/n20077?v=abc123",
      ]) {
        const res = await request(app).get(url);
        expect(res.status).toBe(200);
        expect(res.header["cache-control"]).toBeUndefined();
      }

      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      (mockFusedDict.getEntry as jest.Mock).mockRejectedValueOnce(
        new Error("lookup failed")
      );
      (mockFusedDict.getEntry as jest.Mock).mockRejectedValueOnce(
        new Error("id lookup failed")
      );
      try {
        const dictErr = await request(app).get(
          "/dicts?q=amo&format=partial&v=abc123"
        );
        expect(dictErr.status).toBe(500);
        expect(dictErr.header["cache-control"]).toBeUndefined();

        const idErr = await request(app).get(
          "/dicts/id/n20077?format=partial&v=abc123"
        );
        expect(idErr.status).toBe(500);
        expect(idErr.header["cache-control"]).toBeUndefined();
      } finally {
        errorSpy.mockRestore();
      }
    });
  });

  test("GET /api/completions sanitizes query parameter", async () => {
    const res = await request(app).get('/api/completions?prefix="am,"');
    expect(res.status).toBe(200);
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "am",
      })
    );
  });

  test("GET /api/completions preserves suffix search query with leading hyphen", async () => {
    const res = await request(app).get("/api/completions?q=-arum");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "-arum",
      })
    );
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /api/completions scopes suffix completions to requested dicts", async () => {
    const res = await request(app).get("/api/completions?q=-arum&dict=LnS,GAF");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "-arum",
        dicts: ["L&S", "GAF"],
      })
    );
  });

  test("GET /api/completions partitions prefix chunks by language across all dicts", async () => {
    const res = await request(app).get("/api/completions?prefix=am");
    expect(res.status).toBe(200);
    // Language-aware partitioning sends Latin dicts and German dicts separately
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "am",
        dicts: expect.arrayContaining(["L&S", "GAF"]),
      })
    );
    expect(mockFusedDict.getCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "am",
        dicts: ["GRG"],
      })
    );
  });

  test("GET /assets/app.css serves the built, hashed stylesheet", async () => {
    const res = await request(app).get(getV2AssetHref("app.css"));
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/css");
    expect(res.header["cache-control"]).toContain("immutable");
    expect(res.text).toContain(".lsOrth");
    expect(res.text).toContain("target-highlight");
    expect(res.text).not.toContain("2px dashed");
  });

  test("GET /assets/manifest.json is not exposed", async () => {
    const res = await request(app).get("/assets/manifest.json");
    expect(res.status).toBe(404);
  });

  test("GET /api/completions/profile is not exposed", async () => {
    // Deliberately removed: it ran a synchronous gzip over up to 50k results on
    // an unauthenticated GET. If profiling is needed again, prefer an offline
    // script over a production route.
    const res = await request(app).get("/api/completions/profile?q=am");
    expect(res.status).toBe(404);
  });

  test("GET /about returns full About page with 200", async () => {
    const res = await request(app).get("/about");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain(
      "Clicking on the flag icon in the top navigation bar"
    );
    expect(res.text).toContain("GPL-3.0");
    expect(res.text).toContain("CC BY-SA 4.0");
    expect(res.text).toContain('href="/about"');
    expect(res.text).toContain('class="nav-link active"');
  });

  describe("GET / (the empty dictionary page, served at the root)", () => {
    test("serves the page directly, canonical to /dicts, rewriting the address bar", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("<morcus-dict-search");
      expect(res.text).toContain(
        '<link rel="canonical" href="https://morcus.net/dicts">'
      );
      expect(res.text).toContain(
        '<script>try{history.replaceState(history.state,"","/dicts"+location.hash)}catch(e){}</script>'
      );
      // Never serves partials, so its response mustn't vary on the partial header.
      expect(res.headers["vary"] ?? "").not.toContain("X-Requested-With");
      expect(res.header["set-cookie"]).toBeUndefined();
    });

    test("only the root rewrites the address bar", async () => {
      const res = await request(app).get("/dicts");
      expect(res.text).not.toContain("history.replaceState");
    });

    test("renders the user's saved settings", async () => {
      const res = await request(app)
        .get("/")
        .set("Cookie", "morcus_d=2; morcus_inflected=0");
      expect(res.status).toBe(200);
      expect(res.text).toContain('data-d="2" data-o="0"');
      expect(res.header["set-cookie"]).toBeUndefined();
    });

    test("ignores the query: no lookup, no saved settings, same page", async () => {
      const plain = await request(app).get("/");
      const res = await request(app).get("/?q=amo&d=2&o=0&save=1&fbclid=x");
      expect(res.status).toBe(200);
      expect(mockFusedDict.getEntry).not.toHaveBeenCalled();
      expect(res.header["set-cookie"]).toBeUndefined();
      expect(res.text).toBe(plain.text);
    });

    // Without JS the address bar keeps `/`, so a relative link or a form submitting to the
    // current URL would lead somewhere under `/` (and the query is ignored there, so a search or
    // settings save would be lost). Every link and form must name a real path.
    test("every link and form targets an absolute path", async () => {
      // Forms that never submit natively: the report dialog only opens with JS, which sends it
      // over fetch (`report_dialog.client.ts`).
      const JS_ONLY_FORMS = ["report-form"];
      const res = await request(app).get("/");
      const doc = new JSDOM(res.text).window.document;
      const forms = Array.from(doc.querySelectorAll("form")).filter(
        (form) =>
          form.getAttribute("method")?.toLowerCase() !== "dialog" &&
          !JS_ONLY_FORMS.some((name) => form.classList.contains(name))
      );
      expect(forms.length).toBeGreaterThan(0);
      for (const form of forms) {
        expect({
          form: form.className,
          action: form.getAttribute("action"),
        }).toEqual({
          form: form.className,
          action: expect.stringMatching(/^\/[^/]/),
        });
      }
      const hrefs = Array.from(doc.querySelectorAll("a[href]")).map(
        (a) => a.getAttribute("href") ?? ""
      );
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href).toMatch(/^(\/(?!\/)|#|https?:\/\/|mailto:)/);
      }
    });
  });

  test("GET /assets/<chunk>.js serves all 6 built client chunks", async () => {
    const chunks = [
      { asset: "common.js" as const, expectedSymbol: "morcus-appearance-menu" },
      { asset: "dict.js" as const, expectedSymbol: "morcus-dict-search" },
      { asset: "reader.js" as const, expectedSymbol: "morcus-reader-view" },
      {
        asset: "external.js" as const,
        expectedSymbol: "morcus-external-loader",
      },
      { asset: "corpus.js" as const, expectedSymbol: "morcus-corpus-view" },
      {
        asset: "macronizer.js" as const,
        expectedSymbol: "morcus-macronizer-view",
      },
    ];

    for (const { asset, expectedSymbol } of chunks) {
      const res = await request(app).get(getV2AssetHref(asset));
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("javascript");
      expect(res.header["cache-control"]).toContain("immutable");
      expect(res.text).toContain(expectedSymbol);
    }
  });

  test("the build writes br/gzip siblings of every manifest asset", () => {
    // Serving them is `preCompressedMiddleware`'s job (`web_server.test.ts`).
    for (const asset of V2_ASSET_NAMES) {
      const file = path.join(buildDir, path.basename(getV2AssetHref(asset)));
      const original = fs.readFileSync(file);
      expect(
        brotliDecompressSync(fs.readFileSync(`${file}.br`)).equals(original)
      ).toBe(true);
      expect(gunzipSync(fs.readFileSync(`${file}.gz`)).equals(original)).toBe(
        true
      );
    }
    // Inlined into `<head>`, never fetched.
    expect(fs.existsSync(path.join(buildDir, "critical.js.br"))).toBe(false);
  });

  describe("GET /work", () => {
    test("returns 200 with reader layout and dictionary iframe placeholder when no q", async () => {
      const res = await request(app).get("/work/caesar/de_bello_gallico/1.1");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("X-Requested-With");
      expect(res.text).toContain("<!DOCTYPE html>");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain("Julius Caesar");
      expect(res.text).toContain("De bello Gallico");
      expect(res.text).toContain("Gallia est omnis divisa in partes tres");
      expect(res.text).toContain('id="dict-frame"');
      expect(res.text).toContain("/dicts?embedded=1");
      expect(res.text).toContain("Open Dictionary Search");
      expect(res.text).toContain("Tap any word to view definitions");
    });

    test("returns 200 and points dictionary iframe to embedded query when q is supplied", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico/1.1?q=Gallia"
      );
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("X-Requested-With");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain('id="dict-frame"');
      expect(res.text).toContain(
        "/dicts?q=Gallia&amp;lang=La&amp;o=1&amp;embedded=1"
      );
    });

    test("GET /work/:author/:name/:page? with format=partial returns only the passage slot fragment", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico/1.1?format=partial"
      );
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.headers["vary"]).toContain("X-Requested-With");
      expect(res.text).not.toContain("<!DOCTYPE html>");
      expect(res.text).toContain('data-slot="text"');
      expect(res.text).toContain("Gallia est omnis divisa in partes tres");
    });

    test("GET /work/:author/:name/:page? returns 404 for unknown works", async () => {
      const res = await request(app).get(
        "/work/unknown_author/nonexistent_work"
      );
      expect(res.status).toBe(404);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("Classical Work Not Found");
      expect(res.text).toContain("unknown_author/nonexistent_work");
      expect(res.text).toContain('href="/library"');
      expect(res.text).toContain("not-found-state");
      expect(res.text).not.toContain("style=");
    });

    test("GET /work/:author/:name/:page/translation returns 200 and translation snippet for translated works", async () => {
      const res = await request(app).get(
        "/work/sallust/catalina1/1/translation"
      );
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("reader-translation-content");
      expect(res.text).toContain("reader-translation-header");
      expect(res.text).toContain("John Selby Watson");
      expect(res.text).toContain("reader-translation-body");
    });

    test("GET /work/:author/:name/:page/translation returns 404 for untranslated works", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico/1.1/translation"
      );
      expect(res.status).toBe(404);
      expect(res.text).toBe("Translation not found");
    });

    test("GET /work/:author/:name/:page/translation returns 404 for unknown works", async () => {
      const res = await request(app).get(
        "/work/unknown_author/nonexistent_work/1/translation"
      );
      expect(res.status).toBe(404);
      expect(res.text).toBe("Translation not found");
    });

    test("GET /work/:author/:name redirects matchText links to the matched page and section when :page is omitted", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico?matchText=1.2.1~0~2"
      );
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(
        "/work/caesar/de_bello_gallico/1.2?matchText=1.2.1%7E0%7E2#sec-1.2.1"
      );
    });

    test("GET /work/:author/:name redirects legacy V1 ?id= and ?pg= params to the canonical page", async () => {
      const bySection = await request(app).get(
        "/work/caesar/de_bello_gallico?id=1.2.1"
      );
      expect(bySection.status).toBe(302);
      expect(bySection.header.location).toBe(
        "/work/caesar/de_bello_gallico/1.2#sec-1.2.1"
      );

      const byPageNum = await request(app).get(
        "/work/caesar/de_bello_gallico?pg=2"
      );
      expect(byPageNum.status).toBe(302);
      expect(byPageNum.header.location).toBe(
        "/work/caesar/de_bello_gallico/1.2"
      );
    });

    test("GET /work/:workId redirects legacy V1 work ID URLs to canonical author/name/page URL", async () => {
      const res = await request(app).get(
        "/work/phi0448.phi001.perseus-lat2?id=1.2.1&matchText=1.2.1~0~2"
      );
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(
        "/work/caesar/de_bello_gallico/1.2?matchText=1.2.1%7E0%7E2#sec-1.2.1"
      );

      const unknown = await request(app).get("/work/unknown_work_id");
      expect(unknown.status).toBe(404);
      expect(unknown.text).toContain("Classical Work Not Found");
    });

    test("GET /work/:author/:name/:page with matchText renders the requested page without redirecting", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico/1.2?matchText=1.2.1~0~2"
      );
      expect(res.status).toBe(200);
      expect(res.text).toContain('id="sec-1.2.1"');
    });

    test("GET /work/:author/:name/:page?jump=... preserves matchText across redirect", async () => {
      const res = await request(app).get(
        "/work/caesar/de_bello_gallico/1.1?jump=1.2.1&matchText=1.2.1~0~2&q=Orgetorix"
      );
      expect(res.status).toBe(302);
      expect(res.header.location).toBe(
        "/work/caesar/de_bello_gallico/1.2?q=Orgetorix&matchText=1.2.1%7E0%7E2#sec-1.2.1"
      );
    });
  });

  describe("GET /dicts with embedded mode", () => {
    test("renders minimal dictionary panel suitable for iframe and queries dictionary", async () => {
      const res = await request(app).get("/dicts?q=Gallia&embedded=1");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("dict-card");
      expect(res.text).toContain("body-embedded");
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "Gallia",
          mode: 1,
        }),
        expect.anything()
      );
    });

    test("suppresses table of contents in embedded mode", async () => {
      const res = await request(app).get("/dicts?q=Gallia&embedded=1");
      expect(res.status).toBe(200);
      expect(res.text).not.toContain("has-toc");
      expect(res.text).not.toContain("drawer-toc");
    });

    test("partial format in embedded mode returns fragment without TOC and with lexicon badges", async () => {
      const res = await request(app).get(
        "/dicts?q=Gallia&embedded=1&format=partial"
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
      const res = await request(app).get("/dicts?q=Gallia&scale=120");
      expect(res.status).toBe(200);
      expect(res.text).toContain(
        "<style>:root { --dict-scale: 1.20; }</style>"
      );

      const maxRes = await request(app).get("/dicts?q=Gallia&scale=200");
      expect(maxRes.text).toContain(
        "<style>:root { --dict-scale: 1.50; }</style>"
      );

      const minRes = await request(app).get("/dicts?q=Gallia&scale=40");
      expect(minRes.text).toContain(
        "<style>:root { --dict-scale: 0.50; }</style>"
      );

      const invalidRes = await request(app).get("/dicts?q=Gallia&scale=abc");
      expect(invalidRes.text).not.toContain("--dict-scale");
    });

    test("GET /dicts/id/:id injects font scale style tag from ?scale=", async () => {
      const res = await request(app).get("/dicts/id/n20077?scale=125");
      expect(res.status).toBe(200);
      expect(res.text).toContain(
        "<style>:root { --dict-scale: 1.25; }</style>"
      );
    });
  });

  describe("dictionary partial URL purity", () => {
    test("/dicts partial body is byte-identical across cookies, iframe headers, and referers, and omits save=1 on zero-results o=0", async () => {
      (mockFusedDict.getEntry as jest.Mock).mockResolvedValue({});
      const url = "/dicts?q=amavi&d=2&o=0&format=partial";

      const plain = await request(app).get(url);
      expect(plain.status).toBe(200);
      expect(plain.text).toContain("inflected-hint");
      expect(plain.text).not.toContain("save=1");

      // Matching cookie
      const matchingCookie = await request(app)
        .get(url)
        .set("Cookie", "morcus_d=2; morcus_inflected=0");
      expect(matchingCookie.text).toBe(plain.text);

      // Guest-making cookie
      const guestCookie = await request(app)
        .get(url)
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      expect(guestCookie.text).toBe(plain.text);

      // Sec-Fetch-Dest: iframe and embedded=1 Referer without embedded=1 in URL
      const withHeaders = await request(app)
        .get(url)
        .set("Sec-Fetch-Dest", "iframe")
        .set("Referer", "http://localhost/dicts?embedded=1");
      expect(withHeaders.text).toBe(plain.text);

      // Positive control: ?embedded=1 in the URL actually changes the zero-results markup
      const embeddedZero = await request(app).get(`${url}&embedded=1`);
      expect(embeddedZero.text).toContain("embedded=1");
      expect(embeddedZero.text).not.toBe(plain.text);

      // Also verify with non-empty entry results (where embedded vs non-embedded markup differs)
      (mockFusedDict.getEntry as jest.Mock).mockResolvedValue({
        ls: [
          {
            entry: '<span class="lsOrth">amo</span>',
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
      });
      const hitUrl = "/dicts?q=amo&d=2&o=1&format=partial";
      const plainHit = await request(app).get(hitUrl);
      expect(plainHit.text).not.toContain("dict-badge");

      // Positive control: ?embedded=1 in the URL renders embedded markup (with dict-badge)
      const embeddedHit = await request(app).get(`${hitUrl}&embedded=1`);
      expect(embeddedHit.text).toContain("dict-badge");
      expect(embeddedHit.text).not.toBe(plainHit.text);

      const hitWithHeadersAndCookie = await request(app)
        .get(hitUrl)
        .set("Cookie", "morcus_d=1; morcus_inflected=0")
        .set("Sec-Fetch-Dest", "iframe")
        .set("Referer", "http://localhost/dicts?embedded=1");
      expect(hitWithHeadersAndCookie.text).toBe(plainHit.text);
    });

    test("/dicts/id/:id partial body is byte-identical regardless of cookies, Sec-Fetch-Dest: iframe, or embedded=1 Referer", async () => {
      const url = "/dicts/id/n20077?format=partial";

      const plain = await request(app).get(url);
      expect(plain.status).toBe(200);
      expect(plain.text).not.toContain("dict-badge");

      // Positive control: ?embedded=1 in the URL renders embedded markup (with dict-badge)
      const embeddedId = await request(app).get(`${url}&embedded=1`);
      expect(embeddedId.text).toContain("dict-badge");
      expect(embeddedId.text).not.toBe(plain.text);

      const withHeadersAndCookie = await request(app)
        .get(url)
        .set("Cookie", "morcus_d=2; morcus_inflected=0")
        .set("Sec-Fetch-Dest", "iframe")
        .set("Referer", "http://localhost/dicts?embedded=1");
      expect(withHeadersAndCookie.text).toBe(plain.text);
    });

    test("/dicts partial omitting d or o uses the defaults regardless of cookie", async () => {
      const getEntry = mockFusedDict.getEntry as jest.Mock;
      getEntry.mockClear();

      const plain = await request(app).get("/dicts?q=amo&format=partial");
      const plainCall = getEntry.mock.calls[0][0];

      getEntry.mockClear();
      const withCookie = await request(app)
        .get("/dicts?q=amo&format=partial")
        .set("Cookie", "morcus_d=2; morcus_inflected=0");
      const cookieCall = getEntry.mock.calls[0][0];

      expect(cookieCall).toEqual(plainCall);
      expect(cookieCall.mode).toBe(1);
      expect(cookieCall.dicts.length).toBeGreaterThan(1);
      expect(withCookie.text).toBe(plain.text);
    });

    test("full-page zero-results o=0 still renders save=1 for a non-guest and omits it for a guest", async () => {
      (mockFusedDict.getEntry as jest.Mock).mockResolvedValue({});
      const url = "/dicts?q=amavi&d=2&o=0";

      const nonGuest = await request(app)
        .get(url)
        .set("Cookie", "morcus_d=2; morcus_inflected=0");
      const nonGuestHint = new JSDOM(
        nonGuest.text
      ).window.document.querySelector(".inflected-hint a");
      expect(nonGuestHint?.getAttribute("href")).toBe(
        "/dicts?q=amavi&d=2&o=1&save=1"
      );

      const guest = await request(app)
        .get(url)
        .set("Cookie", "morcus_d=1; morcus_inflected=1");
      const guestHint = new JSDOM(guest.text).window.document.querySelector(
        ".inflected-hint a"
      );
      expect(guestHint?.getAttribute("href")).toBe("/dicts?q=amavi&d=2&o=1");
    });
  });

  describe("GET /library", () => {
    test("returns 200 with catalog and author groupings", async () => {
      const res = await request(app).get("/library");
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

  describe("POST /api/report", () => {
    test("submits issue report successfully and returns 200 with JSON", async () => {
      const mockReportHandler = jest.fn().mockResolvedValue(undefined);
      const testApp = express();
      testApp.use(
        "/",
        createV2Router(mockFusedDict as FusedDictionary, {
          reportHandler: mockReportHandler,
        })
      );

      const res = await request(testApp).post("/api/report").send({
        reportText: "Found a typo in entry",
        url: "http://localhost:1337/dicts?q=amo",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(mockReportHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          reportText: "Found a typo in entry",
          url: "http://localhost:1337/dicts?q=amo",
        })
      );
    });

    test("submits in-flow editedText correction with tags and returns 200", async () => {
      const mockReportHandler = jest.fn().mockResolvedValue(undefined);
      const testApp = express();
      testApp.use(
        "/",
        createV2Router(mockFusedDict as FusedDictionary, {
          reportHandler: mockReportHandler,
        })
      );

      const res = await request(testApp)
        .post("/api/report")
        .send({
          editedText: {
            original: "Gallia est omnes divisa",
            edited: "Gallia est omnis divisa",
            sectionId: "1.1.1",
          },
          tags: ["userEdit"],
          url: "http://localhost:1337/work/caesar/bg/1.1#sec-1.1.1",
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
          url: "http://localhost:1337/work/caesar/bg/1.1#sec-1.1.1",
        })
      );
    });

    test("returns 400 when both reportText and editedText are missing or empty", async () => {
      const res = await request(app)
        .post("/api/report")
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
          "/",
          createV2Router(mockFusedDict as FusedDictionary, {
            reportHandler: mockReportHandler,
          })
        );

        const res = await request(testApp)
          .post("/api/report")
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
        `/dicts?format=partial&q=${encodeURIComponent(PAYLOAD)}`
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
        `/dicts?q=${encodeURIComponent(PAYLOAD)}`
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
        `/dicts/id/${encodeURIComponent(PAYLOAD)}?format=partial`
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
        `/dicts/id/${encodeURIComponent(PAYLOAD)}`
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
     * The reader route `await`s `getV2Work` outside of any `try`, so a rejection
     * escapes the handler entirely. Express 4 ignores the promise a handler
     * returns, so without an `asyncHandler` wrapper the rejection surfaces as
     * an unhandled rejection (which terminates the process on Node 15+) and
     * the request itself simply hangs. Asserting on the 500 pins the wrapper.
     */
    const FAILING_ROUTES = ["/work/caesar/de_bello_gallico/1.1"];

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
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const res = await request(app).get(route);

        expect(res.status).toBe(500);
        // The router's error handler logs what the handler forwarded.
        expect(errorSpy).toHaveBeenCalledWith(
          `[v2] GET ${route}`,
          expect.any(Error)
        );
        errorSpy.mockRestore();
      }
    );

    test("a failed versioned partial is never cached", async () => {
      const savedCommit = process.env.COMMIT_ID;
      process.env.COMMIT_ID = "abc123";
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
      try {
        const res = await request(app)
          .get("/work/caesar/de_bello_gallico/1.1?v=abc123")
          .set("X-Requested-With", "fetch");
        expect(res.status).toBe(500);
        expect(res.header["cache-control"]).toBeUndefined();
      } finally {
        errorSpy.mockRestore();
        if (savedCommit === undefined) delete process.env.COMMIT_ID;
        else process.env.COMMIT_ID = savedCommit;
      }
    });
  });

  describe("telemetry coverage", () => {
    /**
     * One request per registered route, reaching its handler, and the row name
     * it must produce: the pattern, prefixed on non-GET methods.
     * A route missing here fails the registry check below, so new routes are
     * covered too. This also pins the mount order of `telemetryMiddleware`.
     */
    const LOGGED_ROUTES: ReadonlyArray<{
      route: string;
      method: "GET" | "POST";
      url: string;
      form?: Record<string, string>;
      json?: Record<string, string>;
    }> = [
      { route: "/", method: "GET", url: "/" },
      { route: "/dicts", method: "GET", url: "/dicts?q=amo" },
      { route: "/dicts/id/:id", method: "GET", url: "/dicts/id/n123" },
      {
        route: "/work/:author/:name/:page/translation",
        method: "GET",
        url: "/work/caesar/de_bello_gallico/1.1/translation",
      },
      {
        route: "/work/:author/:name{/:page}",
        method: "GET",
        url: "/work/caesar/de_bello_gallico/1.1",
      },
      {
        route: "/work/:workId",
        method: "GET",
        url: "/work/unknown_work",
      },
      { route: "/corpus", method: "GET", url: "/corpus?q=amo" },
      {
        route: "/api/corpus/lemmata/:letter",
        method: "GET",
        url: "/api/corpus/lemmata/a",
      },
      { route: "/macronizer", method: "GET", url: "/macronizer" },
      {
        route: "/macronizer",
        method: "POST",
        url: "/macronizer",
        form: { text: "arma virumque cano" },
      },
      {
        route: "/macronizer/apply",
        method: "POST",
        url: "/macronizer/apply",
        form: { text: "arma virumque cano" },
      },
      { route: "/externalReader", method: "GET", url: "/externalReader" },
      {
        route: "/api/completions",
        method: "GET",
        url: "/api/completions?prefix=am",
      },
      {
        route: "/api/report",
        method: "POST",
        url: "/api/report",
        json: { reportText: "telemetry coverage" },
      },
      { route: "/library", method: "GET", url: "/library" },
      { route: "/about", method: "GET", url: "/about" },
    ];

    /** Mounted ahead of the telemetry middleware, so never logged. */
    const UNLOGGED_ROUTES = ["GET /assets/manifest.json"];

    /** Every `METHOD /pattern` registered in an Express router, recursively. */
    function registeredRoutes(router: any): string[] {
      const found: string[] = [];
      for (const layer of router.stack) {
        if (layer.route) {
          for (const method of Object.keys(layer.route.methods)) {
            found.push(`${method.toUpperCase()} ${layer.route.path}`);
          }
        } else if (layer.handle?.stack) {
          found.push(...registeredRoutes(layer.handle));
        }
      }
      return found;
    }

    function rowName(entry: { route: string; method: string }): string {
      return entry.method === "GET"
        ? entry.route
        : `${entry.method} ${entry.route}`;
    }

    async function settle(): Promise<void> {
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    let rows: ApiCallData[];
    let telemetryApp: express.Express;
    let v2Router: express.Router;

    beforeEach(() => {
      rows = [];
      const logger: TelemetryLogger = {
        ...TelemetryLogger.NoOp,
        logApiCall: async (row) => {
          rows.push(row);
        },
      };
      v2Router = createV2Router(mockFusedDict as FusedDictionary, {
        telemetry: Promise.resolve(logger),
        reportHandler: jest.fn().mockResolvedValue(undefined),
      });
      telemetryApp = express();
      telemetryApp.use("/", v2Router);
    });

    test("the table lists every registered route", () => {
      const expected = [
        ...LOGGED_ROUTES.map((entry) => `${entry.method} ${entry.route}`),
        ...UNLOGGED_ROUTES,
      ];
      expect(registeredRoutes(v2Router).sort()).toEqual(expected.sort());
    });

    test.each(LOGGED_ROUTES)(
      "$method $url logs exactly one row",
      async (entry) => {
        // Unconfigured engines (corpus, macronizer) warn; that is fine here.
        const warnSpy = jest
          .spyOn(console, "warn")
          .mockImplementation(() => {});
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const agent = request(telemetryApp);
        const req =
          entry.method === "GET"
            ? agent.get(entry.url)
            : entry.form
            ? agent.post(entry.url).type("form").send(entry.form)
            : agent.post(entry.url).send(entry.json);
        const res = await req;
        await settle();

        expect(res.status).toBeLessThan(600);
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe(rowName(entry));
        expect(rows[0].status).toBe(res.status);
        expect(rows[0].extras?.ui).toBe("v2");
        warnSpy.mockRestore();
        errorSpy.mockRestore();
      }
    );

    test.each(["/assets/manifest.json", "/no-such-page"])(
      "GET %s logs nothing",
      async (url) => {
        await request(telemetryApp).get(url);
        await settle();

        expect(rows).toEqual([]);
      }
    );
  });
});
