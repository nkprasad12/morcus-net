import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import express from "express";
import request from "supertest";
import { PRECOMPRESSED_HEADER } from "@/web/web_server";
import type { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";
import { DEV_SERVER_ENV } from "@/web/ui/core/server/build_version.server";
import { telemetryMiddleware } from "@/web/ui/core/server/telemetry.server";
import {
  compressStaticPage,
  openStaticPagesDb,
  saveStaticPagesDb,
  sendStaticPageOr,
  staticPagesEpoch,
  STATIC_PAGE_MARK,
  type StaticPageStore,
} from "@/web/ui/core/server/static_pages.server";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const rawBody = (res: request.Response, cb: (err: null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("static_pages.server", () => {
  let tmpDir: string;
  const savedCommit = process.env.COMMIT_ID;
  const savedDev = process.env[DEV_SERVER_ENV];
  const savedBuildDir = process.env.MORCUS_V2_BUILD_DIR;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "static-pages-test-"));
    process.env.COMMIT_ID = "abc123";
    delete process.env[DEV_SERVER_ENV];
    process.env.MORCUS_V2_BUILD_DIR = path.join(tmpDir, "client");
    fs.mkdirSync(process.env.MORCUS_V2_BUILD_DIR);
    fs.writeFileSync(
      path.join(process.env.MORCUS_V2_BUILD_DIR, "manifest.json"),
      JSON.stringify({ "common.js": "common.11111111.js" })
    );
  });

  afterEach(() => {
    restoreEnv("COMMIT_ID", savedCommit);
    restoreEnv(DEV_SERVER_ENV, savedDev);
    restoreEnv("MORCUS_V2_BUILD_DIR", savedBuildDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("staticPagesEpoch", () => {
    test("combines the build version and the manifest digest", () => {
      const epoch = staticPagesEpoch();
      expect(epoch).toMatch(/^abc123\|[0-9a-f]{40}$/);
    });

    test("changes when the manifest or an inlined critical file changes", () => {
      const buildDir = process.env.MORCUS_V2_BUILD_DIR!;
      const before = staticPagesEpoch();
      fs.writeFileSync(
        path.join(buildDir, "manifest.json"),
        JSON.stringify({ "common.js": "common.22222222.js" })
      );
      const afterManifest = staticPagesEpoch();
      expect(afterManifest).not.toBe(before);
      // `critical.*` are inlined into every page but aren't in the manifest.
      fs.writeFileSync(path.join(buildDir, "critical.css"), "body{margin:0}");
      const afterCss = staticPagesEpoch();
      expect(afterCss).not.toBe(afterManifest);
      fs.writeFileSync(path.join(buildDir, "critical.js"), "(()=>{})()");
      expect(staticPagesEpoch()).not.toBe(afterCss);
    });

    test("is undefined without a commit id or a manifest", () => {
      delete process.env.COMMIT_ID;
      expect(staticPagesEpoch()).toBeUndefined();
      process.env.COMMIT_ID = "abc123";
      fs.rmSync(path.join(process.env.MORCUS_V2_BUILD_DIR!, "manifest.json"));
      expect(staticPagesEpoch()).toBeUndefined();
    });

    test("a dev server never shares an epoch with a build", () => {
      const build = staticPagesEpoch();
      process.env[DEV_SERVER_ENV] = "1";
      expect(staticPagesEpoch()).not.toBe(build);
    });
  });

  describe("store", () => {
    const html = "<!DOCTYPE html><html><body>Salve, munde!</body></html>";

    test("compressStaticPage round-trips both encodings", () => {
      const row = compressStaticPage(html);
      expect(row.rawLen).toBe(Buffer.byteLength(html));
      expect(zlib.brotliDecompressSync(row.br).toString()).toBe(html);
      expect(zlib.gunzipSync(row.gzip).toString()).toBe(html);
    });

    test("saves and opens under a matching epoch", () => {
      const dbPath = path.join(tmpDir, "pages.db");
      saveStaticPagesDb(dbPath, "epoch-1", new Map([["page:/x", html]]));
      const store = openStaticPagesDb(dbPath, "epoch-1");
      expect(store).toBeDefined();
      try {
        expect(store!.epoch).toBe("epoch-1");
        const row = store!.get("page:/x");
        expect(row).toBeDefined();
        expect(zlib.brotliDecompressSync(row!.br).toString()).toBe(html);
        expect(store!.get("page:/y")).toBeUndefined();
      } finally {
        store?.close();
      }
    });

    test("ignores a store from another epoch, or with no epoch to match", () => {
      const dbPath = path.join(tmpDir, "pages.db");
      saveStaticPagesDb(dbPath, "epoch-1", new Map([["page:/x", html]]));
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        expect(openStaticPagesDb(dbPath, "epoch-2")).toBeUndefined();
        expect(openStaticPagesDb(dbPath, undefined)).toBeUndefined();
      } finally {
        logSpy.mockRestore();
      }
    });

    test("opens against the current epoch by default", () => {
      const dbPath = path.join(tmpDir, "pages.db");
      saveStaticPagesDb(dbPath, staticPagesEpoch()!, new Map([["k", html]]));
      const store = openStaticPagesDb(dbPath);
      expect(store).toBeDefined();
      store?.close();
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        process.env[DEV_SERVER_ENV] = "1";
        expect(openStaticPagesDb(dbPath)).toBeUndefined();
      } finally {
        logSpy.mockRestore();
      }
    });

    test("returns undefined when the file does not exist", () => {
      expect(
        openStaticPagesDb(path.join(tmpDir, "missing.db"), "e")
      ).toBeUndefined();
    });

    test("ignores a file that is not a database rather than throwing", () => {
      const dbPath = path.join(tmpDir, "pages.db");
      fs.writeFileSync(dbPath, "not sqlite");
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(openStaticPagesDb(dbPath, "e")).toBeUndefined();
        expect(errSpy).toHaveBeenCalled();
      } finally {
        errSpy.mockRestore();
      }
    });
  });

  describe("sendStaticPageOr", () => {
    const html = "<!DOCTYPE html><html><body>static</body></html>";
    let store: StaticPageStore;
    let render: jest.Mock<string, []>;
    let app: express.Express;

    beforeEach(() => {
      const dbPath = path.join(tmpDir, "pages.db");
      saveStaticPagesDb(dbPath, "e", new Map([["page:/hit", html]]));
      store = openStaticPagesDb(dbPath, "e")!;
      render = jest.fn(() => "<p>rendered</p>");
      app = express();
      app.get("/hit", (req, res) => {
        res.vary("X-Requested-With");
        void sendStaticPageOr(req, res, store, "page:/hit", render);
      });
      app.get("/miss", (req, res) => {
        void sendStaticPageOr(req, res, store, "page:/miss", render);
      });
      app.get("/nokey", (req, res) => {
        void sendStaticPageOr(req, res, store, undefined, render);
      });
      app.get("/nostore", (req, res) => {
        void sendStaticPageOr(req, res, undefined, "page:/hit", render);
      });
    });

    afterEach(() => {
      store.close();
    });

    test("serves a hit pre-compressed in the negotiated encoding", async () => {
      const br = await request(app)
        .get("/hit")
        .set("Accept-Encoding", "gzip, br")
        .buffer(true)
        .parse(rawBody);
      expect(br.status).toBe(200);
      expect(br.headers["content-type"]).toBe("text/html; charset=utf-8");
      expect(br.headers["content-encoding"]).toBe("br");
      expect(br.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
      expect(br.headers["vary"]).toContain("Accept-Encoding");
      expect(br.headers["vary"]).toContain("X-Requested-With");
      expect(zlib.brotliDecompressSync(br.body as Buffer).toString()).toBe(
        html
      );

      const gzip = await request(app)
        .get("/hit")
        .set("Accept-Encoding", "gzip");
      expect(gzip.headers["content-encoding"]).toBe("gzip");
      expect(gzip.text).toBe(html);

      const identity = await request(app)
        .get("/hit")
        .set("Accept-Encoding", "identity");
      expect(identity.headers["content-encoding"]).toBeUndefined();
      expect(
        identity.headers[PRECOMPRESSED_HEADER.toLowerCase()]
      ).toBeUndefined();
      expect(identity.text).toBe(html);
      expect(render).not.toHaveBeenCalled();
    });

    test("answers HEAD from the store without a body", async () => {
      const res = await request(app).head("/hit").set("Accept-Encoding", "br");
      expect(res.status).toBe(200);
      expect(res.headers["content-encoding"]).toBe("br");
      expect(render).not.toHaveBeenCalled();
    });

    test("renders on a miss, with no key, or with no store", async () => {
      for (const url of ["/miss", "/nokey", "/nostore"]) {
        const res = await request(app).get(url).set("Accept-Encoding", "br");
        expect(res.status).toBe(200);
        expect(res.text).toBe("<p>rendered</p>");
        expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
      }
      expect(render).toHaveBeenCalledTimes(3);
    });

    test("a hit's telemetry row has the uncompressed length and the mark", async () => {
      const rows: ApiCallData[] = [];
      const logger: TelemetryLogger = {
        teardown: async () => {},
        logApiCall: async (row) => {
          rows.push(row);
        },
        logServerHealth: async () => {},
      };
      const telemetered = express();
      telemetered.use(telemetryMiddleware(Promise.resolve(logger)));
      telemetered.get("/hit", (req, res) => {
        void sendStaticPageOr(req, res, store, "page:/hit", render);
      });
      telemetered.get("/miss", (req, res) => {
        void sendStaticPageOr(req, res, store, "page:/miss", render);
      });

      await request(telemetered).get("/hit").set("Accept-Encoding", "br");
      await request(telemetered).get("/miss").set("Accept-Encoding", "br");
      // `finish` and the logger promise run after supertest resolves.
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      expect(rows).toHaveLength(2);
      const [hit, miss] = rows;
      expect(hit.name).toBe("/hit");
      expect(hit.outputLength).toBe(Buffer.byteLength(html));
      expect(hit.extras?.[STATIC_PAGE_MARK]).toEqual(expect.any(Number));
      expect(miss.name).toBe("/miss");
      expect(miss.outputLength).toBe(Buffer.byteLength("<p>rendered</p>"));
      expect(miss.extras?.[STATIC_PAGE_MARK]).toBeUndefined();
    });
  });
});
