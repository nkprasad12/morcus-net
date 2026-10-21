import { describe, expect, test } from "@jest/globals";
import express from "express";
import fs from "fs";
import request from "supertest";

import {
  PRECOMPRESSED_HEADER,
  setupServer,
  WebServerParams,
} from "@/web/web_server";
import path from "path";
import zlib from "zlib";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";

console.debug = jest.fn();

function getServer(): express.Express {
  const app = express();
  const params: WebServerParams = {
    webApp: app,
    v2Router: express.Router(),
  };
  setupServer(params);
  return app;
}

interface RawResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

// Over `compression()`'s 1 kB threshold, so a fallthrough is visibly encoded.
const JS = `export const x = "${"morcus ".repeat(400)}";\n`;
const CSS = `.lsOrth { color: red; }\n${"/* pad */\n".repeat(200)}`;

/**
 * Raw bytes, unlike supertest: superagent gunzips on its own (but not
 * brotli), which would hide which sibling was actually sent.
 */
function fetchRaw(
  server: http.Server,
  urlPath: string,
  options: { acceptEncoding?: string; method?: string } = {}
): Promise<RawResponse> {
  const { port } = server.address() as AddressInfo;
  const headers: http.OutgoingHttpHeaders = {};
  if (options.acceptEncoding !== undefined) {
    headers["accept-encoding"] = options.acceptEncoding;
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port, path: urlPath, method: options.method ?? "GET", headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function decode(res: RawResponse): string {
  switch (res.headers["content-encoding"]) {
    case "br":
      return zlib.brotliDecompressSync(res.body).toString("utf8");
    case "gzip":
      return zlib.gunzipSync(res.body).toString("utf8");
    default:
      return res.body.toString("utf8");
  }
}

describe("WebServer", () => {
  const app = getServer();

  test("serves the legacy service worker cleanup script uncached", async () => {
    const response = await request(app).get("/serviceworker.js");

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/javascript");
    expect(response.headers["cache-control"]).toBe(
      "no-cache, no-store, must-revalidate"
    );
    expect(response.text).toContain("registration.unregister()");
  });

  test("serves the favicon at the root", async () => {
    const response = await request(app).get("/favicon.ico");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).not.toContain("text/html");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000");

    const logo = await request(app).get("/public/logo192.png");
    expect(logo.status).toBe(200);
    expect(logo.headers["cache-control"]).toBe("public, max-age=31536000");
  });

  test("serves robots.txt at the root ahead of the V2 router", async () => {
    const response = await request(app).get("/robots.txt");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/plain");
    expect(response.headers["cache-control"]).toBe("public, max-age=604800");
    expect(response.text).toContain("User-agent: *");
    expect(response.text).toContain("Disallow: /api/");
    expect(response.text).toContain("Disallow: /*?*format=partial");
  });

  test("serves the manifest as application/manifest+json", async () => {
    const response = await request(app).get("/public/pwa.webmanifest");

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/manifest+json");
    expect(response.headers["cache-control"]).toBeUndefined();
    expect(response.headers["etag"]).toBeDefined();
    const manifest = JSON.parse(response.text);
    expect(manifest).toMatchObject({
      start_url: "/",
      scope: "/",
    });
    expect(manifest.icons[0].src).toBe("/favicon.ico");
  });

  test("the V2 router serves root routes, and unknown routes are not found", async () => {
    const v2Router = express.Router();
    v2Router.get("/", (_req, res) => res.redirect(302, "/dicts"));
    v2Router.get("/dicts", (_req, res) => res.status(200).send("V2 Dicts"));

    const v2App = express();
    setupServer({
      webApp: v2App,
      v2Router,
    });

    const rootRes = await request(v2App).get("/");
    expect(rootRes.status).toBe(302);
    expect(rootRes.headers["location"]).toBe("/dicts");

    const dictsRes = await request(v2App).get("/dicts");
    expect(dictsRes.status).toBe(200);
    expect(dictsRes.text).toBe("V2 Dicts");

    const robotsRes = await request(v2App).get("/robots.txt");
    expect(robotsRes.status).toBe(200);
    expect(robotsRes.type).toBe("text/plain");

    const unknownRes = await request(v2App).get("/notEvenRemotelyReal");
    expect(unknownRes.status).toBe(404);
  });
});

describe("pre-compressed V2 assets", () => {
  let baseDir: string;
  let rootDir: string;
  let server: http.Server;
  const savedBuildDir = process.env.MORCUS_V2_BUILD_DIR;

  beforeAll(async () => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-precompressed-"));
    rootDir = path.join(baseDir, "assets");
    fs.mkdirSync(rootDir);
    const write = (name: string, data: string | Buffer) =>
      fs.writeFileSync(path.join(rootDir, name), data);
    // Both siblings.
    write("common.abcd1234.js", JS);
    write("common.abcd1234.js.br", zlib.brotliCompressSync(JS));
    write("common.abcd1234.js.gz", zlib.gzipSync(JS));
    // gzip sibling only.
    write("app.abcd1234.css", CSS);
    write("app.abcd1234.css.gz", zlib.gzipSync(CSS));
    // No siblings.
    write("dict.abcd1234.js", JS);
    // Not a hashed asset: siblings must be ignored.
    write("critical.js", JS);
    write("critical.js.br", zlib.brotliCompressSync(JS));
    write("critical.js.gz", zlib.gzipSync(JS));
    // Outside the asset directory.
    write("../secret.abcd1234.js.gz", zlib.gzipSync("secret"));

    // As in production: the V2 router serves `/assets` statically, and
    // `setupServer` puts the pre-compressed siblings (and `compression()`)
    // ahead of it.
    process.env.MORCUS_V2_BUILD_DIR = rootDir;
    const v2Router = express.Router();
    v2Router.use("/assets", express.static(rootDir));
    const app = express();
    setupServer({
      webApp: app,
      v2Router,
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(baseDir, { recursive: true, force: true });
    if (savedBuildDir === undefined) delete process.env.MORCUS_V2_BUILD_DIR;
    else process.env.MORCUS_V2_BUILD_DIR = savedBuildDir;
  });

  test("prefers brotli over gzip, whatever the client's order", async () => {
    const res = await fetchRaw(server, "/assets/common.abcd1234.js", {
      acceptEncoding: "gzip, deflate, br, zstd",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("br");
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
    expect(res.headers["content-type"]).toContain("application/javascript");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.headers["cache-control"]).toContain("no-transform");
    expect(res.headers["vary"]).toContain("Accept-Encoding");
    expect(decode(res)).toBe(JS);
  });

  test("serves gzip when the client does not accept brotli", async () => {
    const res = await fetchRaw(server, "/assets/common.abcd1234.js", {
      acceptEncoding: "gzip",
    });
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
    expect(decode(res)).toBe(JS);
  });

  test("honours q=0", async () => {
    const res = await fetchRaw(server, "/assets/common.abcd1234.js", {
      acceptEncoding: "br;q=0, gzip",
    });
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
  });

  test("falls back to the next sibling when one is missing", async () => {
    const res = await fetchRaw(server, "/assets/app.abcd1234.css", {
      acceptEncoding: "br, gzip",
    });
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
    expect(res.headers["content-type"]).toContain("text/css");
    expect(decode(res)).toBe(CSS);
  });

  test.each([
    ["no Accept-Encoding", undefined],
    ["an empty Accept-Encoding", ""],
    ["an unsupported encoding", "middleOut"],
  ])("serves the original for %s", async (_, acceptEncoding) => {
    const res = await fetchRaw(server, "/assets/common.abcd1234.js", {
      acceptEncoding,
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
    expect(res.body.toString("utf8")).toBe(JS);
  });

  test("leaves assets without siblings to compression()", async () => {
    const res = await fetchRaw(server, "/assets/dict.abcd1234.js", {
      acceptEncoding: "gzip",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
    expect(decode(res)).toBe(JS);
  });

  test("never serves siblings of files that are not hashed assets", async () => {
    const res = await fetchRaw(server, "/assets/critical.js", {
      acceptEncoding: "br",
    });
    expect(res.status).toBe(200);
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
    expect(decode(res)).toBe(JS);
  });

  test("does not serve a sibling for a direct request to it", async () => {
    // The `.br` file is served by the static handler as an opaque file, if at
    // all; it is never labelled as `Content-Encoding: br`.
    const res = await fetchRaw(server, "/assets/common.abcd1234.js.br", {
      acceptEncoding: "br",
    });
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
  });

  test.each([
    "/assets/..%2fsecret.abcd1234.js",
    "/assets/../secret.abcd1234.js",
  ])("rejects path traversal: %s", async (urlPath) => {
    const res = await fetchRaw(server, urlPath, { acceptEncoding: "gzip" });
    expect(res.status).toBe(404);
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
  });

  test("answers HEAD with the sibling's headers and no body", async () => {
    const res = await fetchRaw(server, "/assets/common.abcd1234.js", {
      acceptEncoding: "br",
      method: "HEAD",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("br");
    expect(res.body.byteLength).toBe(0);
  });

  test("ignores other methods", async () => {
    const res = await fetchRaw(server, "/assets/common.abcd1234.js", {
      acceptEncoding: "br",
      method: "POST",
    });
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
  });
});
