import http from "http";
import { AddressInfo } from "net";
import { LatinToken, latincyAnalysis } from "@/latincy/latincy_client";

const FAKE_RESPONSE: LatinToken[] = [
  ["Deditque", "do", "V:PFA:3:S"],
  ["oscula", "osculum", "N:ACC:P:N"],
  ["nato", "natus", "N:DAT:S:M"],
];

describe("latincyAnalysis", () => {
  let server: http.Server;
  let port: number;
  let nextStatus = 200;
  let nextBody: string = JSON.stringify(FAKE_RESPONSE);
  const originalEnv = process.env.LATINCY_SERVER_ADDRESS;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      // We need to consume these callbacks.
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(nextStatus, { "Content-Type": "application/json" });
        res.end(nextBody);
      });
    });

    server.listen(0, () => {
      port = (server.address() as AddressInfo).port;
      process.env.LATINCY_SERVER_ADDRESS = `http://localhost:${port}`;
      done();
    });
  });

  afterEach(() => {
    nextStatus = 200;
    nextBody = JSON.stringify(FAKE_RESPONSE);
  });

  afterAll((done) => {
    process.env.LATINCY_SERVER_ADDRESS = originalEnv;
    server.close(done);
  });

  it("should pipe expected results", async () => {
    const result = await latincyAnalysis(
      ["Deditque", " ", "oscula", " ", "nato"],
      [false, true, false, true, false]
    );
    expect(result).toEqual(FAKE_RESPONSE);
  });

  it("uses an explicit address over the environment", async () => {
    process.env.LATINCY_SERVER_ADDRESS = "http://localhost:1";
    try {
      const result = await latincyAnalysis(
        ["nato"],
        [false],
        `http://localhost:${port}`
      );
      expect(result).toEqual(FAKE_RESPONSE);
    } finally {
      process.env.LATINCY_SERVER_ADDRESS = `http://localhost:${port}`;
    }
  });

  it("rejects on a non-2xx status", async () => {
    nextStatus = 500;
    nextBody = "<html>Internal error</html>";
    await expect(latincyAnalysis(["nato"], [false])).rejects.toThrow(
      /HTTP 500/
    );
  });

  it("rejects a malformed body", async () => {
    nextBody = JSON.stringify([["only", "two"]]);
    await expect(latincyAnalysis(["only"], [false])).rejects.toThrow();
  });
});
