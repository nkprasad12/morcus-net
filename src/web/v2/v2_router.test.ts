import express from "express";
import request from "supertest";
import { createV2Router } from "@/web/v2/v2_router";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { XmlNode } from "@/common/xml/xml_node";
import { buildV2Bundle } from "@/bundler/v2.rsbuild";
import { getV2AssetHref } from "@/web/v2/shell/asset_manifest.server";

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describe("v2_router integration", () => {
  let app: express.Express;
  let mockFusedDict: Partial<FusedDictionary>;

  beforeAll(async () => {
    await buildV2Bundle(false);
  }, 30000);

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
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("morcus-dict-search");
    expect(res.text).toContain("amo");
    expect(res.text).toContain("Lewis");
  });

  test("GET /v2/dicts with format=partial returns only the results snippet", async () => {
    const res = await request(app).get("/v2/dicts?q=amo&format=partial");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toContain("v2-dict-card");
    expect(res.text).toContain("amo");
  });

  test("GET /v2/dicts filters by query param 'dict' and sets cookie on form submit", async () => {
    const res = await request(app).get("/v2/dicts?q=amo&dict=ls,gaffiot");
    expect(res.status).toBe(200);
    expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "amo",
        dicts: ["L&S", "GAF"],
      })
    );
    expect(res.header["set-cookie"]).toBeDefined();
    expect(res.header["set-cookie"][0]).toContain("morcus_dicts=L%26S%3BGAF");
  });

  test("GET /v2/dicts uses cookie when no dict param is passed", async () => {
    const res = await request(app)
      .get("/v2/dicts?q=amo")
      .set("Cookie", "morcus_dicts=GAF%3BGRG");
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

  test("GET /v2/dicts with reader query (embedded=1, o=1, lang=La) forces inflected search, filters to Latin lexica, and does not pollute cookies", async () => {
    (mockFusedDict.getEntry as jest.Mock).mockClear();

    // User has existing cookies: inflected disabled (morcus_inflected=0) and custom dicts
    const res = await request(app)
      .get("/v2/dicts?q=arma&embedded=1&o=1&lang=La")
      .set("Cookie", "morcus_dicts=L%26S%3BS%26H%3BGRG; morcus_inflected=0");

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

  test("GET /v2/dicts with Greek query renders Logeion fallback and skips Latin dict lookup", async () => {
    (mockFusedDict.getEntry as jest.Mock).mockClear();
    const res = await request(app).get(
      `/v2/dicts?q=${encodeURIComponent("λόγος")}`
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain('class="v2-greek-fallback"');
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
    expect(res.text).toContain('class="v2-greek-fallback"');
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
    expect(res.text).toContain("v2-target-highlight");
    expect(res.text).not.toContain("2px dashed");
  });

  test("GET /v2/assets/manifest.json is not exposed", async () => {
    const res = await request(app).get("/v2/assets/manifest.json");
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
    expect(res.text).toContain('class="v2-nav-link active"');
  });

  test("GET /v2 redirects to /v2/dicts", async () => {
    const res = await request(app).get("/v2");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/v2/dicts");
  });

  test("GET /v2/assets/v2.js serves the built client bundle", async () => {
    const res = await request(app).get(getV2AssetHref("v2.js"));
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("javascript");
    expect(res.header["cache-control"]).toContain("immutable");
    expect(res.text).toContain("morcus-dict-search");
  });

  describe("GET /v2/reader", () => {
    test("returns 200 with reader layout and dictionary iframe placeholder when no q", async () => {
      const res = await request(app).get("/v2/reader");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("<!DOCTYPE html>");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain("Julius Caesar");
      expect(res.text).toContain('id="v2-dict-frame"');
      expect(res.text).toContain("/v2/dicts?embedded=1");
      expect(res.text).toContain("Tap any word to view definitions");
    });

    test("returns 200 and points dictionary iframe to embedded query when q is supplied", async () => {
      const res = await request(app).get("/v2/reader?q=Gallia");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain('id="v2-dict-frame"');
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
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain("De bello Gallico");
      expect(res.text).toContain("Gallia est omnis divisa in partes tres");
    });
  });

  describe("GET /v2/dicts with embedded mode", () => {
    test("renders minimal dictionary panel suitable for iframe and queries dictionary", async () => {
      const res = await request(app).get("/v2/dicts?q=Gallia&embedded=1");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("v2-dict-card");
      expect(res.text).toContain("v2-body-embedded");
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "Gallia",
          mode: 1,
        })
      );
    });
  });

  describe("GET /v2/library", () => {
    test("returns 200 with catalog and author groupings", async () => {
      const res = await request(app).get("/v2/library");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("morcus-library-view");
      expect(res.text).toContain("Classical Latin Library");
      expect(res.text).toContain("Julius Caesar");
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

    test("returns 400 when reportText is missing or empty", async () => {
      const res = await request(app)
        .post("/v2/api/report")
        .send({ reportText: "   " });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "reportText is required" });
    });

    test("returns 500 when issue reporting handler throws an error", async () => {
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
    });
  });

  describe("dictionary lookup failures", () => {
    const PAYLOAD = '<img src=x onerror="alert(1)">';

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
      mockFusedDict.getEntry = jest
        .fn()
        .mockRejectedValue(new Error("dictionary backend exploded"));
    });

    test("escapes the query in the partial error response", async () => {
      const res = await request(app).get(
        `/v2/dicts?format=partial&q=${encodeURIComponent(PAYLOAD)}`
      );

      expect(res.status).toBe(500);
      expect(res.text).toContain("An error occurred searching for");
      expectPayloadNeutralized(res.text);
    });

    test("escapes the query in the full page error response", async () => {
      const res = await request(app).get(
        `/v2/dicts?q=${encodeURIComponent(PAYLOAD)}`
      );

      expect(res.status).toBe(500);
      expectPayloadNeutralized(res.text);
    });

    test("escapes the id in the partial error response", async () => {
      const res = await request(app).get(
        `/v2/dicts/id/${encodeURIComponent(PAYLOAD)}?format=partial`
      );

      expect(res.status).toBe(500);
      expect(res.text).toContain("An error occurred retrieving ID");
      expectPayloadNeutralized(res.text);
    });

    test("escapes the id in the full page error response", async () => {
      const res = await request(app).get(
        `/v2/dicts/id/${encodeURIComponent(PAYLOAD)}`
      );

      expect(res.status).toBe(500);
      expectPayloadNeutralized(res.text);
    });
  });
});
