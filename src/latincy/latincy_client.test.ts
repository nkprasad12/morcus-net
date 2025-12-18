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
  const originalEnv = process.env.LATINCY_SERVER_ADDRESS;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      // We need to consume these callbacks.
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(FAKE_RESPONSE));
      });
    });

    server.listen(0, () => {
      port = (server.address() as AddressInfo).port;
      process.env.LATINCY_SERVER_ADDRESS = `http://localhost:${port}`;
      done();
    });
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
});
