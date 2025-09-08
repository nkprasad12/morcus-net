import { describe, expect, test } from "@jest/globals";
import express from "express";
import fs from "fs";
import request from "supertest";

import { setupServer, WebServerParams } from "@/web/web_server";
import path from "path";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import { encodeMessage, isNumber, isString } from "@/web/utils/rpc/parsing";
import {
  PreEncodedRpc,
  PreStringifiedRpc,
  RouteDefinition,
} from "@/web/utils/rpc/server_rpc";
import zlib from "zlib";

console.debug = jest.fn();

const TEMP_DIR = "web_server_test_ts";
const TEMP_FILE = `${TEMP_DIR}/sample.html`;
const TEMP_INDEX_FILE = `${TEMP_DIR}/index.html`;
const BUNDLE_NAME = "root.ABC.client-bundle.js";
const BUNDLE = `${TEMP_DIR}/${BUNDLE_NAME}`;
const BUNDLE_GZ = `${BUNDLE}.gz`;
const BUNDLE_BR = `${BUNDLE}.br`;

function removePreCompressed() {
  try {
    fs.unlinkSync(BUNDLE_GZ);
  } catch (e) {}
  try {
    fs.rmdirSync(BUNDLE_BR);
  } catch (e) {}
}

const NumberPost: RouteDefinition<number, number> = {
  route: {
    path: "/api/NumberPost",
    method: "POST",
    inputValidator: isNumber,
    outputValidator: isNumber,
  },
  handler: async (x) => x * 4,
};

const NumberGet: RouteDefinition<number, number> = {
  route: {
    path: "/api/NumberGet",
    method: "GET",
    inputValidator: isNumber,
    outputValidator: isNumber,
  },
  handler: async (x) => x * 3,
};

const NumberGetPreStringified: RouteDefinition<
  number,
  number,
  PreStringifiedRpc
> = {
  route: {
    path: "/api/NumberGetPreStringified",
    method: "GET",
    inputValidator: isNumber,
    outputValidator: isNumber,
  },
  handler: async (x) => `${x * 3}`,
  encodingMode: "PreStringified",
};

const NumberGetPreEncoded: RouteDefinition<string, string, PreEncodedRpc> = {
  route: {
    path: "/api/NumberGetPreEncoded",
    method: "GET",
    inputValidator: isString,
    outputValidator: isString,
  },
  handler: async (x, _, requestData) => {
    if (requestData?.acceptEncoding?.includes("gzip")) {
      return zlib.gzipSync(Buffer.from(`${x}PreEncodedGet gzip`));
    }
    return Buffer.from(`${x} PreEncodedGet`);
  },
  encodingMode: "PreEncoded",
};

function getServer(): express.Express {
  const app = express();
  const params: WebServerParams = {
    webApp: app,
    routes: [
      NumberGet,
      NumberPost,
      NumberGetPreStringified,
      NumberGetPreEncoded,
    ],
    buildDir: path.resolve(TEMP_DIR),
    telemetry: Promise.resolve(TelemetryLogger.NoOp),
  };
  setupServer(params);
  return app;
}

describe("WebServer", () => {
  const app = getServer();

  beforeAll(() => {
    fs.mkdirSync(TEMP_DIR);
    fs.writeFileSync(TEMP_FILE, "<!DOCTYPE html>\n<html></html>");
    fs.writeFileSync(TEMP_INDEX_FILE, "<!DOCTYPE html>\n<html></html>");
    fs.writeFileSync(BUNDLE, "");
  });

  afterEach(() => removePreCompressed());

  afterAll(() => {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  test("handles post route with good data", async () => {
    const response = await request(app)
      .post(NumberPost.route.path)
      .send(encodeMessage(57))
      .set("Content-Type", "text/plain; charset=utf-8");

    expect(response.status).toBe(200);
    expect(response.text).toContain("228");
  });

  test("handles post route with bad data", async () => {
    const response = await request(app)
      .post(NumberPost.route.path)
      .send(encodeMessage({ data: 57 }))
      .set("Content-Type", "application/json");

    expect(response.status).toBe(400);
    expect(response.text).toContain("Error extracting input");
  });

  test("handles get route", async () => {
    const path = `${NumberGet.route.path}/${encodeMessage(57)}`;
    const response = await request(app).get(path);

    expect(response.status).toBe(200);
    expect(response.text).toContain("171");
  });

  test("handles pre-stringified get route", async () => {
    const path = `${NumberGetPreStringified.route.path}/${encodeMessage(57)}`;
    const response = await request(app).get(path);

    expect(response.status).toBe(200);
    expect(response.text).toContain("171");
  });

  test("handles pre-encoded get route with gzip", async () => {
    const path = `${NumberGetPreEncoded.route.path}/${encodeMessage("foo")}`;
    const response = await request(app)
      .get(path)
      .set("accept-encoding", "gzip");

    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("gzip");
    expect(response.body.toString()).toBe("fooPreEncodedGet gzip");
  });

  test("handles pre-encoded get route without gzip", async () => {
    const path = `${NumberGetPreEncoded.route.path}/${encodeMessage("foo")}`;
    const response = await request(app).get(path).set("accept-encoding", "");

    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe(undefined);
    expect(response.body.toString()).toBe("foo PreEncodedGet");
  });

  test("sends unknown requests to index", async () => {
    const response = await request(app).get("/notEvenRemotelyReal");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.headers["cache-control"]).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });

  test("sends bundle with correct cache control", async () => {
    const response = await request(app).get(`/${BUNDLE_NAME}`);

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/javascript");
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=315360000000, immutable"
    );
  });

  test("sends pre-compressed brotli if available", async () => {
    fs.writeFileSync(BUNDLE_BR, "const br = true");
    // Make a new one so that we aren't caching previous results.
    const response = await request(getServer())
      .get(`/${BUNDLE_NAME}`)
      .set("Accept-Encoding", "br");

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/javascript");
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=315360000000, immutable, no-transform"
    );
    expect(response.headers["content-encoding"]).toBe("br");
    expect(response.headers["x-morcusnet-precompressed"]).toBe("1");
  });

  test("sends uncompressed js if not available", async () => {
    const response = await request(app)
      .get(`/${BUNDLE_NAME}`)
      .set("Accept-Encoding", "br");

    expect(response.status).toBe(200);
    expect(response.type).toBe("application/javascript");
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=315360000000, immutable"
    );
    expect(response.headers["content-encoding"]).toBe(undefined);
    expect(response.headers["x-morcusnet-precompressed"]).toBe(undefined);
  });

  test("sends out index without cache", async () => {
    const response = await request(app).get("/index.html");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.headers["cache-control"]).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });
});
