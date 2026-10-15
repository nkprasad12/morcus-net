import compression from "compression";
import express, { Router } from "express";
import http from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import type { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  collectParams,
  requestTimer,
  telemetryMiddleware,
  v2ErrorHandler,
} from "@/web/v2/core/server/telemetry.server";
import { asyncHandler } from "@/web/v2/core/server/async_handler.server";

/** A logger that records rows, and a way to wait for them. */
function recordingLogger() {
  const rows: ApiCallData[] = [];
  const logger: TelemetryLogger = {
    teardown: async () => {},
    logApiCall: async (row) => {
      rows.push(row);
    },
    logServerHealth: async () => {},
    logClientEvent: async () => {},
  };
  return { rows, logger };
}

/** `finish` and the logger promise run after supertest resolves; let them. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const BIG_BODY = "x".repeat(5000);

/** Mirrors `createV2Router`'s order: static, telemetry, routers, errors. */
function makeApp(
  telemetry: Promise<TelemetryLogger>,
  options: { compress?: boolean } = {}
): express.Express {
  const router = Router();
  router.use(express.json());
  router.get("/", (_req, res) => res.redirect("/dicts"));
  router.use("/assets", (_req, res) => {
    res.send("asset");
  });
  router.use(telemetryMiddleware(telemetry));

  const sub = Router();
  sub.get("/dicts", (req, res) => {
    requestTimer(res).mark("lookupComplete");
    res.send(`dicts ${String(req.query.q)}`);
  });
  sub.get("/dicts/id/:id", (req, res) => {
    res.send(`id ${req.params.id}`);
  });
  sub.get("/big", (_req, res) => {
    res.send(BIG_BODY);
  });
  sub.get("/stream", (_req, res) => {
    res.write("abc");
    res.write(Buffer.from("de"));
    res.end("f");
  });
  sub.get("/moved", (_req, res) => res.redirect(302, "/dicts"));
  sub.get(
    "/work/:author/:name/:page?",
    asyncHandler(async () => {
      throw new Error("boom");
    })
  );
  sub.get("/api/completions", (_req, res) => {
    res.json({});
  });
  sub.post("/api/report", (_req, res) => {
    res.json({ success: true });
  });
  router.use(sub);
  router.use(v2ErrorHandler);

  const app = express();
  if (options.compress) app.use(compression());
  app.use(router);
  return app;
}

describe("telemetryMiddleware", () => {
  let rows: ApiCallData[];
  let app: express.Express;

  beforeEach(() => {
    const recorder = recordingLogger();
    rows = recorder.rows;
    app = makeApp(Promise.resolve(recorder.logger));
  });

  test("logs one row per request, named by the route pattern", async () => {
    const res = await request(app)
      .get("/dicts/id/n123")
      .set("User-Agent", "UA");
    await settle();

    expect(res.status).toBe(200);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.name).toBe("/dicts/id/:id");
    expect(row.status).toBe(200);
    expect(row.params).toEqual({ id: "n123" });
    expect(row.userAgent).toBe("UA");
    expect(row.outputLength).toBe("id n123".length);
    expect(row.inputLength).toBeUndefined();
    expect(row.extras).toMatchObject({ ui: "v2", mode: "page" });
  });

  test("measures latency at hand-off and flush separately", async () => {
    await request(app).get("/dicts?q=amo");
    await settle();

    const extras = rows[0].extras ?? {};
    expect(typeof extras.lookupComplete).toBe("number");
    expect(extras.sent).toBe(rows[0].latencyMs);
    expect(Number(extras.end)).toBeGreaterThanOrEqual(rows[0].latencyMs);
    expect(Number(extras.lookupComplete)).toBeLessThanOrEqual(
      rows[0].latencyMs
    );
    expect(extras.flushMs).toBeCloseTo(
      Number(extras.end) - Number(extras.sent),
      1
    );
  });

  test("does not log HEAD requests", async () => {
    await request(app).head("/dicts?q=amo");
    await settle();

    expect(rows).toEqual([]);
  });

  test("normal rows are not marked aborted", async () => {
    await request(app).get("/big");
    await settle();

    expect(rows[0].extras?.aborted).toBeUndefined();
  });

  test("logs a request the client aborted before hand-off", async () => {
    const recorder = recordingLogger();
    let releaseHandler = () => {};
    const handlerGate = new Promise<void>((r) => (releaseHandler = r));
    let signalArrived = () => {};
    const arrived = new Promise<void>((r) => (signalArrived = r));
    let signalClosed = () => {};
    const closed = new Promise<void>((r) => (signalClosed = r));

    const router = Router();
    router.use(telemetryMiddleware(Promise.resolve(recorder.logger)));
    router.get(
      "/slow/:id",
      asyncHandler(async (_req, res) => {
        res.on("close", signalClosed);
        signalArrived();
        await handlerGate;
        requestTimer(res).mark("lookupComplete");
        res.send(BIG_BODY);
      })
    );
    const slowApp = express();
    slowApp.use(compression());
    slowApp.use(router);

    const server = slowApp.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const clientReq = http.get(`http://127.0.0.1:${port}/slow/7?q=x`);
      clientReq.on("error", () => {});
      await arrived;
      clientReq.destroy();
      await closed;
      releaseHandler();
      await settle();
    } finally {
      server.close();
    }

    expect(recorder.rows).toHaveLength(1);
    const row = recorder.rows[0];
    expect(row.name).toBe("/slow/:id");
    expect(row.status).toBe(200);
    expect(row.params).toEqual({ id: "7", q: "x" });
    expect(row.outputLength).toBe(BIG_BODY.length);
    const extras = row.extras ?? {};
    expect(extras.aborted).toBe(true);
    expect(extras.flushMs).toBeUndefined();
    // Closed while the handler was still waiting on its lookup.
    expect(Number(extras.closed)).toBeLessThan(Number(extras.lookupComplete));
    expect(extras.sent).toBe(row.latencyMs);
  });

  test("does not log assets, redirects or unmatched paths", async () => {
    await request(app).get("/assets/v2.js");
    await request(app).get("/");
    await request(app).get("/moved");
    await request(app).get("/nothing-here");
    await settle();

    expect(rows).toEqual([]);
  });

  test("POST rows carry the method, inputLength and no params", async () => {
    const body = JSON.stringify({ reportText: "hi" });
    await request(app)
      .post("/api/report?q=secret")
      .set("Content-Type", "application/json")
      .send(body);
    await settle();

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("POST /api/report");
    expect(rows[0].inputLength).toBe(body.length);
    expect(rows[0].params).toBeUndefined();
    expect(rows[0].extras?.mode).toBe("api");
  });

  test("counts uncompressed bytes when compression() is upstream", async () => {
    const recorder = recordingLogger();
    const compressed = makeApp(Promise.resolve(recorder.logger), {
      compress: true,
    });
    const res = await request(compressed)
      .get("/big")
      .set("Accept-Encoding", "gzip");
    await settle();

    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.text).toBe(BIG_BODY);
    expect(recorder.rows).toHaveLength(1);
    expect(recorder.rows[0].outputLength).toBe(BIG_BODY.length);
  });

  test("counts bytes passed to res.write as well as res.end", async () => {
    await request(app).get("/stream");
    await settle();

    expect(rows[0].outputLength).toBe(6);
  });

  test("logs a forwarded error as 500 with the name intact", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).get("/work/caesar/gallic/1.1?q=x");
    await settle();

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(
      "[v2] GET /work/caesar/gallic/1.1?q=x",
      expect.any(Error)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("/work/:author/:name/:page?");
    expect(rows[0].status).toBe(500);
    expect(rows[0].params).toEqual({ q: "x" });
    expect(rows[0].extras).toMatchObject({
      path: "/work/caesar/gallic/1.1",
    });
    expect(typeof rows[0].extras?.error).toBe("number");
    errorSpy.mockRestore();
  });

  test("keeps the status of a client error such as malformed JSON", async () => {
    const res = await request(app)
      .post("/api/report")
      .set("Content-Type", "application/json")
      .send("{not json");
    await settle();

    expect(res.status).toBe(400);
    // The body parser fails before any route matches, so nothing is logged.
    expect(rows).toEqual([]);
  });

  test("adds no Vary header", async () => {
    const res = await request(app).get("/dicts?q=amo&format=partial");

    expect(res.headers.vary).toBeUndefined();
  });

  test("records mode and embedded independently", async () => {
    await request(app).get("/dicts?q=amo&embedded=1");
    await request(app).get("/dicts?q=amo&format=partial&embedded=1");
    await request(app).get("/dicts?q=amo").set("X-Requested-With", "fetch");
    await request(app).get("/api/completions?embedded=1");
    await settle();

    expect(rows.map((row) => [row.extras?.mode, row.extras?.embedded])).toEqual(
      [
        ["page", true],
        ["partial", true],
        ["partial", undefined],
        ["api", true],
      ]
    );
  });

  test("records raw Sec-Fetch headers", async () => {
    await request(app)
      .get("/dicts?q=amo")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Site", "same-origin");
    await settle();

    expect(rows[0].extras).toMatchObject({
      fetchMode: "navigate",
      fetchSite: "same-origin",
    });
  });

  describe("versioned", () => {
    const saved = process.env.COMMIT_ID;
    afterEach(() => {
      if (saved === undefined) delete process.env.COMMIT_ID;
      else process.env.COMMIT_ID = saved;
    });

    test("is current, stale, or absent", async () => {
      process.env.COMMIT_ID = "abc";
      await request(app).get("/api/completions?v=abc");
      await request(app).get("/api/completions?v=old");
      await request(app).get("/api/completions");
      await settle();

      expect(rows.map((row) => row.extras?.versioned)).toEqual([
        "current",
        "stale",
        undefined,
      ]);
      expect(rows[0].params).toBeUndefined();
    });
  });

  test("flags capped params", async () => {
    await request(app).get(`/dicts?q=${"a".repeat(200)}`);
    await settle();

    expect(rows[0].params?.q).toBe(`${"a".repeat(127)}…`);
    expect(rows[0].extras?.paramsTruncated).toBe(true);
  });

  test("does not flag ordinary requests", async () => {
    await request(app).get("/dicts?q=amo&d=1u&o=0&o=1&format=partial&save=1");
    await settle();

    expect(rows[0].params).toEqual({ q: "amo", d: "1u", o: "0,1" });
    expect(rows[0].extras?.paramsTruncated).toBeUndefined();
  });

  test("a failing logger does not affect the response", async () => {
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    const failing: TelemetryLogger = {
      ...recordingLogger().logger,
      logApiCall: () => Promise.reject(new Error("mongo down")),
    };
    const res = await request(makeApp(Promise.resolve(failing))).get(
      "/dicts?q=amo"
    );
    await settle();

    expect(res.status).toBe(200);
    expect(res.text).toBe("dicts amo");
    expect(debugSpy).toHaveBeenCalledWith(
      "[v2] telemetry failed:",
      expect.any(Error)
    );
    debugSpy.mockRestore();
  });

  test("a rejected logger promise does not affect the response", async () => {
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    const rejected = Promise.reject(new Error("no logger"));
    rejected.catch(() => {});
    const res = await request(makeApp(rejected)).get("/dicts?q=amo");
    await settle();

    expect(res.status).toBe(200);
    debugSpy.mockRestore();
  });
});

describe("requestTimer", () => {
  test("is a no-op outside the middleware", async () => {
    const app = express();
    app.get("/", (_req, res) => {
      const timer = requestTimer(res);
      timer.mark("x");
      timer.serverExtras().log("y");
      res.send("ok");
    });

    const res = await request(app).get("/");

    expect(res.text).toBe("ok");
  });
});

describe("collectParams", () => {
  test("merges route params before query params", () => {
    expect(collectParams({ id: "n1" }, { id: "other", q: "amo" })).toEqual({
      params: { id: "n1", q: "amo" },
      truncated: false,
    });
  });

  test("drops denied keys silently", () => {
    expect(
      collectParams(
        {},
        { format: "partial", v: "abc", embedded: "1", save: "1" }
      )
    ).toEqual({ params: undefined, truncated: false });
  });

  test("drops malformed keys and nested values with a flag", () => {
    expect(
      collectParams(
        {},
        { "utm-source": "x", ["k".repeat(33)]: "y", a: { b: "c" }, q: "ok" }
      )
    ).toEqual({ params: { q: "ok" }, truncated: true });
  });

  test("keeps at most 10 keys", () => {
    const query: Record<string, string> = {};
    for (let i = 0; i < 12; i++) query[`k${i}`] = "v";

    const result = collectParams({}, query);

    expect(Object.keys(result.params ?? {})).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  test("enforces the 1 KB backstop", () => {
    const query: Record<string, string> = {};
    for (let i = 0; i < 10; i++) query[`key${i}`] = "v".repeat(128);

    const result = collectParams({}, query);

    expect(JSON.stringify(result.params).length).toBeLessThanOrEqual(1024);
    expect(Object.keys(result.params ?? {}).length).toBeLessThan(10);
    expect(result.truncated).toBe(true);
  });
});
