/**
 * Checks that every seeded static page is what its route renders, request
 * for request, and that requests the keys don't cover still render.
 *
 * Dev servers never serve a seed (their epoch has a per-process nonce), so
 * this is the only place the seed path runs outside production.
 */

import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import express from "express";
import request from "supertest";
import type { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import type { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";
import { PRECOMPRESSED_HEADER } from "@/web/web_server";
import { createV2Router } from "@/web/ui/app_router.server";
import { DEV_SERVER_ENV } from "@/web/ui/core/server/build_version.server";
import {
  openStaticPagesDb,
  saveStaticPagesDb,
  staticPagesEpoch,
  STATIC_PAGE_MARK,
  type StaticPageStore,
} from "@/web/ui/core/server/static_pages.server";
import {
  renderStaticPages,
  staticPageSeeds,
} from "@/web/ui/static_pages_seed.server";
import { CORPUS_TEST_AUTHORS } from "@/web/ui/testing/fake_corpus_engine";
import { fakeCorpusEngine } from "@/web/ui/testing/fake_corpus_engine";

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

// The author list comes from the corpus build; the seed and the route must
// see the same one, as they do in production.
jest.mock("@/web/ui/corpus/corpus_query.server", () => ({
  ...jest.requireActual("@/web/ui/corpus/corpus_query.server"),
  loadCorpusAuthors: () =>
    Promise.resolve(
      jest.requireActual("@/web/ui/testing/fake_corpus_engine")
        .CORPUS_TEST_AUTHORS
    ),
}));

/** The URL each seed answers, with the request state its key stands for. */
const SEEDED_REQUESTS: ReadonlyArray<{ url: string; expectKey: RegExp }> = [
  { url: "/", expectKey: /^dict:.*:root$/ },
  { url: "/dicts", expectKey: /^dict:[^:]+:1:0$/ },
  { url: "/dicts?embedded=1", expectKey: /^dict:[^:]+:1:1$/ },
  { url: "/about", expectKey: /^page:\/about$/ },
  { url: "/library", expectKey: /^page:\/library$/ },
  { url: "/macronizer", expectKey: /^page:\/macronizer$/ },
  { url: "/externalReader", expectKey: /^page:\/externalReader$/ },
  { url: "/corpus", expectKey: /^corpus:/ },
];

/** Requests on the same routes that must render dynamically. */
const DYNAMIC_REQUESTS: ReadonlyArray<{ url: string; cookie?: string }> = [
  { url: "/dicts?q=amo" },
  { url: "/dicts?lang=La" },
  { url: "/dicts?scale=120" },
  { url: "/dicts?o=0" },
  { url: "/dicts", cookie: "morcus_d=1" },
  { url: "/", cookie: "morcus_d=1" },
  { url: "/corpus?pageSize=20" },
  { url: "/corpus?q=amo" },
  { url: "/externalReader?lines=prose" },
];

const rawBody = (res: request.Response, cb: (err: null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("static page seeds", () => {
  let tmpDir: string;
  let store: StaticPageStore;
  let seeded: express.Express;
  let dynamic: express.Express;
  const savedCommit = process.env.COMMIT_ID;
  const savedDev = process.env[DEV_SERVER_ENV];
  const savedBuildDir = process.env.MORCUS_V2_BUILD_DIR;

  const fusedDict = {
    getEntry: jest.fn().mockResolvedValue({}),
    getCompletions: jest.fn().mockResolvedValue({}),
  } as unknown as FusedDictionary;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "static-pages-seed-"));
    process.env.COMMIT_ID = "seedtest";
    delete process.env[DEV_SERVER_ENV];
    // A manifest is enough: the pages only need the asset hrefs from it.
    const buildDir = path.join(tmpDir, "client");
    fs.mkdirSync(buildDir);
    fs.writeFileSync(
      path.join(buildDir, "manifest.json"),
      JSON.stringify({
        "common.js": "common.0a0a0a0a.js",
        "dict.js": "dict.0b0b0b0b.js",
        "app.css": "app.0c0c0c0c.css",
      })
    );
    process.env.MORCUS_V2_BUILD_DIR = buildDir;

    const dbPath = path.join(tmpDir, "pages.db");
    saveStaticPagesDb(dbPath, staticPagesEpoch()!, await renderStaticPages());
    const opened = openStaticPagesDb(dbPath);
    if (opened === undefined) {
      throw new Error("The seed store did not open under the test epoch.");
    }
    store = opened;

    const engine = fakeCorpusEngine();
    seeded = express();
    seeded.use(
      createV2Router(fusedDict, { corpus: engine, staticPages: store })
    );
    dynamic = express();
    dynamic.use(createV2Router(fusedDict, { corpus: engine }));
  });

  afterAll(() => {
    store?.close();
    restoreEnv("COMMIT_ID", savedCommit);
    restoreEnv(DEV_SERVER_ENV, savedDev);
    restoreEnv("MORCUS_V2_BUILD_DIR", savedBuildDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("every seed has a request in this test, and vice versa", () => {
    const keys = staticPageSeeds().map((s) => s.key);
    expect(keys.length).toBe(SEEDED_REQUESTS.length);
    for (const { expectKey } of SEEDED_REQUESTS) {
      expect(keys.filter((k) => expectKey.test(k))).toHaveLength(1);
    }
  });

  test("the corpus seed carries the author list the route would", async () => {
    // `identity` is served from the store too, gunzipped on the way out.
    const res = await request(seeded)
      .get("/corpus")
      .set("Accept-Encoding", "identity");
    expect(res.status).toBe(200);
    for (const author of CORPUS_TEST_AUTHORS) {
      expect(res.text).toContain(author);
    }
  });

  test.each(SEEDED_REQUESTS)(
    "GET $url is served from the store and matches the dynamic render",
    async ({ url }) => {
      const fromStore = await request(seeded)
        .get(url)
        .set("Accept-Encoding", "br")
        .buffer(true)
        .parse(rawBody);
      expect(fromStore.status).toBe(200);
      expect(fromStore.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBe("1");
      expect(fromStore.headers["content-encoding"]).toBe("br");
      expect(fromStore.headers["content-type"]).toBe(
        "text/html; charset=utf-8"
      );
      const served = zlib
        .brotliDecompressSync(fromStore.body as Buffer)
        .toString("utf8");

      const rendered = await request(dynamic)
        .get(url)
        .set("Accept-Encoding", "identity");
      expect(rendered.status).toBe(200);
      expect(
        rendered.headers[PRECOMPRESSED_HEADER.toLowerCase()]
      ).toBeUndefined();

      expect(served).toBe(rendered.text);
      expect(served).toContain("<!DOCTYPE html>");
    }
  );

  test.each(DYNAMIC_REQUESTS)(
    "GET $url (cookie: $cookie) renders dynamically",
    async ({ url, cookie }) => {
      let req = request(seeded).get(url).set("Accept-Encoding", "br");
      if (cookie !== undefined) req = req.set("Cookie", cookie);
      const res = await req;
      expect(res.status).toBe(200);
      expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
    }
  );

  test("a partial request for the dictionary landing is never static", async () => {
    const res = await request(seeded)
      .get("/dicts")
      .set("Accept-Encoding", "br")
      .set("X-Requested-With", "fetch");
    expect(res.status).toBe(200);
    expect(res.headers[PRECOMPRESSED_HEADER.toLowerCase()]).toBeUndefined();
    expect(res.text).not.toContain("<!DOCTYPE html>");
  });

  test("a static corpus hit skips the lookup; a search still runs it", async () => {
    const rows: ApiCallData[] = [];
    const logger: TelemetryLogger = {
      teardown: async () => {},
      logApiCall: async (row) => {
        rows.push(row);
      },
      logServerHealth: async () => {},
    };
    const app = express();
    app.use(
      createV2Router(fusedDict, {
        corpus: fakeCorpusEngine(),
        staticPages: store,
        telemetry: Promise.resolve(logger),
      })
    );
    await request(app).get("/corpus").set("Accept-Encoding", "br");
    await request(app).get("/corpus?q=amo").set("Accept-Encoding", "br");
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(rows).toHaveLength(2);
    const [landing, search] = rows;
    expect(landing.extras?.[STATIC_PAGE_MARK]).toEqual(expect.any(Number));
    expect(landing.extras?.lookupComplete).toBeUndefined();
    expect(search.extras?.[STATIC_PAGE_MARK]).toBeUndefined();
    expect(search.extras?.lookupComplete).toEqual(expect.any(Number));
  });
});
