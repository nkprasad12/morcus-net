import express from "express";
import request from "supertest";
import { createPeRouter } from "@/web/pe/pe_router";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { XmlNode } from "@/common/xml/xml_node";
import { buildPeBundle } from "@/bundler/pe.esbuild";
import { getPeAssetHref } from "@/web/pe/server/asset_manifest";

describe("pe_router integration", () => {
  let app: express.Express;
  let mockFusedDict: Partial<FusedDictionary>;

  beforeAll(async () => {
    await buildPeBundle(false);
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
    app.use("/pe", createPeRouter(mockFusedDict as FusedDictionary));
  });

  test("GET /pe/dicts returns full SSR HTML page with 200", async () => {
    const res = await request(app).get("/pe/dicts?q=amo");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("morcus-dict-search");
    expect(res.text).toContain("amo");
    expect(res.text).toContain("Lewis");
  });

  test("GET /pe/dicts with format=partial returns only the results snippet", async () => {
    const res = await request(app).get("/pe/dicts?q=amo&format=partial");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).not.toContain("<!DOCTYPE html>");
    expect(res.text).toContain("pe-dict-card");
    expect(res.text).toContain("amo");
  });

  test("GET /pe/dicts/id/:id returns entry looked up by ID", async () => {
    const res = await request(app).get("/pe/dicts/id/n20077");
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

  test("GET /pe/api/completions returns JSON suggestions", async () => {
    const res = await request(app).get("/pe/api/completions?q=am");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("application/json");
    expect(res.body).toEqual(["amo", "amor", "amicitia"]);
  });

  test("GET /pe/assets/pe.css serves the built, hashed stylesheet", async () => {
    const res = await request(app).get(getPeAssetHref("pe.css"));
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/css");
    expect(res.header["cache-control"]).toContain("immutable");
    expect(res.text).toContain(".lsOrth");
  });

  test("GET /pe/assets/manifest.json is not exposed", async () => {
    const res = await request(app).get("/pe/assets/manifest.json");
    expect(res.status).toBe(404);
  });

  test("GET /pe/about returns full About page with 200", async () => {
    const res = await request(app).get("/pe/about");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("About M&oacute;rcus");
    expect(res.text).toContain("GPL-3.0");
    expect(res.text).toContain("CC BY-SA 4.0");
    expect(res.text).toContain('href="/pe/about"');
    expect(res.text).toContain('class="pe-nav-link active"');
  });

  test("GET /pe redirects to /pe/dicts", async () => {
    const res = await request(app).get("/pe");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/pe/dicts");
  });

  test("GET /pe/assets/pe.js serves the built client bundle", async () => {
    const res = await request(app).get(getPeAssetHref("pe.js"));
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("javascript");
    expect(res.header["cache-control"]).toContain("immutable");
    expect(res.text).toContain("morcus-dict-search");
  });
});
