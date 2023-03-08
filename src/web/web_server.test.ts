import { describe, expect, test } from "@jest/globals";
import express from "express";
import request from "supertest";

import { lsCall, macronizeCall } from "@/web/api_routes";
import { setupServer, WebServerParams } from "./web_server";

function getServer(): express.Express {
  const app = express();
  const params: WebServerParams = {
    app: app,
    macronizer: (a) => Promise.resolve(a + "2"),
    lsDict: (a) => Promise.resolve(`${a} def`),
  };
  setupServer(params);
  return app;
}

describe("WebServer", () => {
  const app = getServer();

  test("handles macronize route", async () => {
    const response = await request(app).get(
      macronizeCall("testPostPleaseIgnore")
    );

    expect(response.status).toBe(200);
    expect(response.text).toBe(`testPostPleaseIgnore2`);
  });

  test("handles LS dict route", async () => {
    const response = await request(app).get(lsCall("Caesar"));

    expect(response.status).toBe(200);
    expect(response.text).toBe(`Caesar def`);
  });
});
