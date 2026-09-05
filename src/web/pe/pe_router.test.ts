import express from "express";
import request from "supertest";
import { createPeRouter } from "@/web/pe/pe_router";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { XmlNode } from "@/common/xml/xml_node";

describe("pe_router integration", () => {
  let app: express.Express;
  let mockFusedDict: Partial<FusedDictionary>;

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

  test("GET /pe/api/completions returns JSON suggestions", async () => {
    const res = await request(app).get("/pe/api/completions?q=am");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("application/json");
    expect(res.body).toEqual(["amo", "amor", "amicitia"]);
  });

  test("GET /pe/assets/pe.css serves the stylesheet", async () => {
    const res = await request(app).get("/pe/assets/pe.css");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("text/css");
    expect(res.text).toContain(".lsOrth");
  });

  test("GET /pe/assets/pe.js serves the built client bundle", async () => {
    const res = await request(app).get("/pe/assets/pe.js");
    expect(res.status).toBe(200);
    expect(res.header["content-type"]).toContain("javascript");
    expect(res.text).toContain("morcus-dict-search");
  });
});
