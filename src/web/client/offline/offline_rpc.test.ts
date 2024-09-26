import { extractInput } from "@/web/client/offline/offline_rpc";
import { encodeMessage, isNumber } from "@/web/utils/rpc/parsing";
import type { ApiRoute } from "@/web/utils/rpc/rpc";

const GET_API: ApiRoute<number, number> = {
  path: "/getCall",
  method: "GET",
  inputValidator: isNumber,
  outputValidator: isNumber,
};

const POST_API: ApiRoute<number, number> = {
  path: "/postCall",
  method: "POST",
  inputValidator: isNumber,
  outputValidator: isNumber,
};

describe("extractInput", () => {
  it("errors on non-GET requests", () => {
    const req = { url: "https://foo.bar/postCall" } as Request;
    const input = extractInput(req, POST_API) as Error;
    expect(input.message).toContain("Error extracting input");
  });

  it("errors on bad GET requests", () => {
    const req = { url: "https://foo.bar/getCall" } as Request;
    const input = extractInput(req, GET_API) as Error;
    expect(input.message).toContain("Error extracting input");
  });

  it("returns input on good get calls", () => {
    const encoded = encodeMessage(57, undefined, true);
    const req = { url: `https://foo.bar/getCall/${encoded}` } as Request;
    const input = extractInput(req, GET_API) as [number, number];
    expect(input[0]).toBe(57);
  });
});
