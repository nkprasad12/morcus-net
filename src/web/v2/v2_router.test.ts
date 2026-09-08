import express from "express";
import request from "supertest";
import { createV2Router } from "@/web/v2/v2_router";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { XmlNode } from "@/common/xml/xml_node";
import { buildV2Bundle } from "@/bundler/v2.rsbuild";
import { getV2AssetHref } from "@/web/v2/shell/asset_manifest.server";

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

  test("GET /v2/api/completions returns JSON suggestions", async () => {
    const res = await request(app).get("/v2/api/completions?q=am");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("application/json");
    expect(res.body).toEqual(["amo", "amor", "amicitia"]);
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
    test("returns 200 with reader prototype layout and empty dictionary state when no q", async () => {
      const res = await request(app).get("/v2/reader");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("<!DOCTYPE html>");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain("C. Iulius Caesar");
      expect(res.text).toContain("v2-reader-empty-state");
      expect(mockFusedDict.getEntry).not.toHaveBeenCalled();
    });

    test("returns 200 and queries dictionary when q is supplied in query string", async () => {
      const res = await request(app).get("/v2/reader?q=Gallia");
      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toContain("text/html");
      expect(res.text).toContain("morcus-reader-view");
      expect(res.text).toContain("v2-dict-card");
      expect(res.text).toContain("Lewis");
      expect(mockFusedDict.getEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "Gallia",
          mode: 1,
        })
      );
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
});
