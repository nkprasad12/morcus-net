import { describe, expect, test } from "@jest/globals";
import fastify from "fastify";
import fs from "fs";
import request from "supertest";

import { setupServer, WebServerParams } from "@/web/web_server";
import path from "path";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import { encodeMessage, isNumber } from "@/web/utils/rpc/parsing";
import { PreStringifiedRpc, RouteDefinition } from "@/web/utils/rpc/server_rpc";

console.log = jest.fn();
console.debug = jest.fn();

const TEMP_DIR = "web_server_test_ts";
const TEMP_DIR_PUBLIC = "web_server_test_ts_public";
const TEMP_FILE = `${TEMP_DIR}/sample.html`;
const TEMP_INDEX_FILE = `${TEMP_DIR}/index.html`;

beforeAll(() => {
  fs.mkdirSync(TEMP_DIR);
  fs.mkdirSync(TEMP_DIR_PUBLIC);
  fs.writeFileSync(TEMP_FILE, "<!DOCTYPE html>\n<html></html>");
  fs.writeFileSync(TEMP_INDEX_FILE, "<!DOCTYPE html>\n<html></html>");
});

afterAll(() => {
  try {
    fs.unlinkSync(TEMP_FILE);
  } catch (e) {}
  try {
    fs.unlinkSync(TEMP_INDEX_FILE);
  } catch (e) {}
  try {
    fs.rmdirSync(TEMP_DIR);
  } catch (e) {}
  try {
    fs.rmdirSync(TEMP_DIR_PUBLIC);
  } catch (e) {}
});

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
  preStringified: true,
};

async function getServer() {
  const app = fastify({ logger: false });
  const params: WebServerParams = {
    webApp: app,
    routes: [NumberGet, NumberPost, NumberGetPreStringified],
    buildDir: path.resolve(TEMP_DIR),
    publicDir: path.resolve(TEMP_DIR_PUBLIC),
    telemetry: Promise.resolve(TelemetryLogger.NoOp),
  };
  await setupServer(params);
  await app.listen();
  return app;
}

describe("WebServer", () => {
  const app = getServer();

  afterAll(async () => {
    await (await app).close();
  });

  test("handles post route with good data", async () => {
    const server = (await app).server;
    const response = await request(server)
      .post(NumberPost.route.path)
      .send(encodeMessage(57))
      .set("Content-Type", "text/plain; charset=utf-8");

    expect(response.status).toBe(200);
    expect(response.text).toContain("228");
  });

  test("handles post route with bad data", async () => {
    const server = (await app).server;
    const response = await request(server)
      .post(NumberPost.route.path)
      .send(encodeMessage({ data: 57 }))
      .set("Content-Type", "application/json");

    expect(response.status).toBe(400);
    expect(response.text).toContain("Error extracting input");
  });

  test("handles get route", async () => {
    const path = `${NumberGet.route.path}/${encodeMessage(57)}`;
    const server = (await app).server;
    const response = await request(server).get(path);

    expect(response.status).toBe(200);
    expect(response.text).toContain("171");
  });

  test("handles pre-stringified get route", async () => {
    const path = `${NumberGetPreStringified.route.path}/${encodeMessage(57)}`;
    const server = (await app).server;
    const response = await request(server).get(path);

    expect(response.status).toBe(200);
    expect(response.text).toContain("171");
  });

  test("sends  unknown requests to index", async () => {
    const server = (await app).server;
    const response = await request(server).get("/notEvenRemotelyReal");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.headers["cache-control"]).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });

  test("sends out index without cache", async () => {
    const server = (await app).server;
    const response = await request(server).get("/index.html");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
    expect(response.headers["cache-control"]).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });
});
