import { describe, expect, test } from "@jest/globals";
import express from "express";
import fs from "fs";
import request from "supertest";

import { entriesByPrefix, lsCall, macronizeCall } from "@/web/api_routes";
import { setupServer, WebServerParams } from "./web_server";
import path from "path";

console.debug = jest.fn();

const TEMP_FILE = "web_server.test.ts.html";

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

beforeAll(() => {
  writeFile("<!DOCTYPE html>\n<html></html>");
});

afterAll(() => {
  try {
    fs.unlinkSync(TEMP_FILE);
  } catch (e) {}
});

function getServer(): express.Express {
  const app = express();
  const params: WebServerParams = {
    app: app,
    macronizer: (a) => Promise.resolve(a + "2"),
    lsDict: (a) => Promise.resolve(`${a} def`),
    entriesByPrefix: (a) => Promise.resolve([a]),
    indexFilePath: path.resolve(TEMP_FILE),
  };
  setupServer(params);
  return app;
}

describe("WebServer", () => {
  const app = getServer();

  test("handles macronize route", async () => {
    const response = await request(app)
      .post(macronizeCall())
      .send("testPostPleaseIgnore")
      .set("Content-Type", "text/plain; charset=utf-8");

    expect(response.status).toBe(200);
    expect(response.text).toBe(`testPostPleaseIgnore2`);
  });

  test("handles macronize route with bad data", async () => {
    const response = await request(app)
      .post(macronizeCall())
      .send({ data: "testPostPleaseIgnore" })
      .set("Content-Type", "application/json");

    expect(response.status).toBe(200);
    expect(response.text).toBe(`Invalid request`);
  });

  test("handles LS dict route", async () => {
    const response = await request(app).get(lsCall("Caesar"));

    expect(response.status).toBe(200);
    expect(response.text).toBe(`Caesar def`);
  });

  test("handles LS completion route", async () => {
    const response = await request(app).get(entriesByPrefix("Caesar"));

    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toStrictEqual(["Caesar"]);
  });

  test("sends out requests to index", async () => {
    const response = await request(app).get("/notEvenRemotelyReal");

    expect(response.status).toBe(200);
    expect(response.type).toBe("text/html");
  });
});
