import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import express from "express";
import request from "supertest";
import { PRECOMPRESSED_HEADER } from "@/web/web_server";
import {
  createInMemoryPrecompressedStore,
  openPrecompressedJsonDb,
  precompressJson,
  savePrecompressedJsonDb,
  sendPrecompressedJson,
} from "@/web/ui/core/server/precompressed_json.server";

describe("precompressed_json.server", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "precompressed-json-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("round-trips pre-compressed JSON through SQLite", () => {
    const dbPath = path.join(tmpDir, "chunks.db");
    const entries = new Map<string, string>([
      ["ab", JSON.stringify({ "L&S": ["ab", "abacus"] })],
      ["ca", JSON.stringify({ GAF: ["cădō", "caedō"] })],
    ]);

    savePrecompressedJsonDb(dbPath, entries);

    const store = openPrecompressedJsonDb(dbPath);
    expect(store).toBeDefined();
    try {
      const ab = store!.get("ab");
      expect(ab).toBeDefined();
      expect(ab!.rawLen).toBe(
        Buffer.byteLength(entries.get("ab") ?? "", "utf8")
      );
      expect(zlib.brotliDecompressSync(ab!.br).toString("utf8")).toBe(
        entries.get("ab")
      );
      expect(zlib.gunzipSync(ab!.gzip).toString("utf8")).toBe(
        entries.get("ab")
      );
      expect(store!.get("zz")).toBeUndefined();
    } finally {
      store?.close();
    }
  });

  test("returns undefined when the SQLite file does not exist", () => {
    expect(
      openPrecompressedJsonDb(path.join(tmpDir, "missing.db"))
    ).toBeUndefined();
  });

  test("createInMemoryPrecompressedStore lazily compresses and caches rows", () => {
    const store = createInMemoryPrecompressedStore(
      new Map([["a", '["amo","amor"]']])
    );
    const first = store.get("a");
    const second = store.get("a");
    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(store.get("b")).toBeUndefined();
    store.close();
  });

  test("sendPrecompressedJson negotiates br, gzip, and identity encodings", async () => {
    const payload = JSON.stringify({ hello: "world", items: [1, 2, 3] });
    const row = precompressJson(payload);
    const app = express();
    app.get("/test", (req, res) => {
      sendPrecompressedJson(req, res, row);
    });

    const brRes = await request(app)
      .get("/test")
      .set("Accept-Encoding", "br, gzip")
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(brRes.status).toBe(200);
    expect(brRes.headers["content-encoding"]).toBe("br");
    expect(brRes.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
    expect(brRes.headers["vary"]).toContain("Accept-Encoding");
    expect(
      JSON.parse(
        zlib.brotliDecompressSync(brRes.body as Buffer).toString("utf8")
      )
    ).toEqual({ hello: "world", items: [1, 2, 3] });

    const gzipRes = await request(app)
      .get("/test")
      .set("Accept-Encoding", "gzip");
    expect(gzipRes.status).toBe(200);
    expect(gzipRes.headers["content-encoding"]).toBe("gzip");
    expect(gzipRes.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
    expect(gzipRes.body).toEqual({ hello: "world", items: [1, 2, 3] });

    const identityRes = await request(app)
      .get("/test")
      .set("Accept-Encoding", "identity");
    expect(identityRes.status).toBe(200);
    expect(identityRes.headers["content-encoding"]).toBeUndefined();
    expect(
      identityRes.headers[PRECOMPRESSED_HEADER.toLowerCase()]
    ).toBeUndefined();
    expect(identityRes.body).toEqual({ hello: "world", items: [1, 2, 3] });
  });
});
