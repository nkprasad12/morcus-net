import type { Request } from "express";
import {
  toStringOrArray,
  readStringParam,
  isPartialRequest,
  isEmbeddedRequest,
  readLimit,
  readDictParam,
} from "@/web/v2/core/request_params.server";

function createMockRequest(
  overrides: {
    query?: Record<string, unknown>;
    headers?: Record<string, string | undefined>;
  } = {}
): Request {
  return {
    query: overrides.query ?? {},
    headers: overrides.headers ?? {},
  } as unknown as Request;
}

describe("request_params.server", () => {
  describe("toStringOrArray", () => {
    test("returns string when input is a string", () => {
      expect(toStringOrArray("hello")).toBe("hello");
      expect(toStringOrArray("")).toBe("");
    });

    test("returns string array when input is an array of strings", () => {
      expect(toStringOrArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
      expect(toStringOrArray([])).toEqual([]);
    });

    test("returns undefined for mixed arrays or non-string arrays", () => {
      expect(toStringOrArray(["a", 1])).toBeUndefined();
      expect(toStringOrArray([null])).toBeUndefined();
      expect(toStringOrArray([{}])).toBeUndefined();
    });

    test("returns undefined for numbers, booleans, objects, null, undefined", () => {
      expect(toStringOrArray(123)).toBeUndefined();
      expect(toStringOrArray(true)).toBeUndefined();
      expect(toStringOrArray({})).toBeUndefined();
      expect(toStringOrArray(null)).toBeUndefined();
      expect(toStringOrArray(undefined)).toBeUndefined();
    });
  });

  describe("readStringParam", () => {
    test("returns trimmed string when string is provided", () => {
      expect(readStringParam("  word  ")).toBe("word");
      expect(readStringParam("test")).toBe("test");
    });

    test("returns default empty string fallback when non-string or missing", () => {
      expect(readStringParam(undefined)).toBe("");
      expect(readStringParam(null)).toBe("");
      expect(readStringParam(123)).toBe("");
      expect(readStringParam([])).toBe("");
      expect(readStringParam({})).toBe("");
    });

    test("returns custom fallback when specified", () => {
      expect(readStringParam(undefined, "fallback_value")).toBe(
        "fallback_value"
      );
      expect(readStringParam(null, "fallback_value")).toBe("fallback_value");
    });
  });

  describe("isPartialRequest", () => {
    test("returns true when format=partial query param is present", () => {
      const req = createMockRequest({ query: { format: "partial" } });
      expect(isPartialRequest(req)).toBe(true);
    });

    test("returns true when X-Requested-With header is fetch", () => {
      const req = createMockRequest({
        headers: { "x-requested-with": "fetch" },
      });
      expect(isPartialRequest(req)).toBe(true);
    });

    test("returns true when both format=partial and header are present", () => {
      const req = createMockRequest({
        query: { format: "partial" },
        headers: { "x-requested-with": "fetch" },
      });
      expect(isPartialRequest(req)).toBe(true);
    });

    test("returns false when neither is present", () => {
      const req = createMockRequest({
        query: { format: "html" },
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      expect(isPartialRequest(req)).toBe(false);
    });

    test("returns false for empty request", () => {
      const req = createMockRequest();
      expect(isPartialRequest(req)).toBe(false);
    });
  });

  describe("isEmbeddedRequest", () => {
    test("returns true when embedded=1 query param is present", () => {
      const req = createMockRequest({ query: { embedded: "1" } });
      expect(isEmbeddedRequest(req)).toBe(true);
    });

    test("returns false when embedded has different value", () => {
      const req = createMockRequest({ query: { embedded: "0" } });
      expect(isEmbeddedRequest(req)).toBe(false);
    });

    test("returns true when Sec-Fetch-Dest header is iframe", () => {
      const req = createMockRequest({
        headers: { "sec-fetch-dest": "iframe" },
      });
      expect(isEmbeddedRequest(req)).toBe(true);
    });

    test("returns true when referer contains embedded=1", () => {
      const req = createMockRequest({
        headers: { referer: "http://localhost:5757/v2/reader?embedded=1" },
      });
      expect(isEmbeddedRequest(req)).toBe(true);
    });

    test("returns false when referer does not contain embedded=1", () => {
      const req = createMockRequest({
        headers: { referer: "http://localhost:5757/v2/reader" },
      });
      expect(isEmbeddedRequest(req)).toBe(false);
    });

    test("returns false for plain request without embedded indicators", () => {
      const req = createMockRequest();
      expect(isEmbeddedRequest(req)).toBe(false);
    });
  });

  describe("readLimit", () => {
    test("parses valid positive integer within default bounds", () => {
      const req = createMockRequest({ query: { limit: "50" } });
      expect(readLimit(req)).toBe(50);
    });

    test("clamps to maxLimit (default 50000) when exceeded", () => {
      const req = createMockRequest({ query: { limit: "100000" } });
      expect(readLimit(req)).toBe(50000);
    });

    test("returns defaultLimit (default 25) when missing or non-string", () => {
      expect(readLimit(createMockRequest())).toBe(25);
      expect(readLimit(createMockRequest({ query: { limit: ["50"] } }))).toBe(
        25
      );
    });

    test("returns defaultLimit when non-numeric, zero, or negative", () => {
      expect(readLimit(createMockRequest({ query: { limit: "abc" } }))).toBe(
        25
      );
      expect(readLimit(createMockRequest({ query: { limit: "0" } }))).toBe(25);
      expect(readLimit(createMockRequest({ query: { limit: "-10" } }))).toBe(
        25
      );
    });

    test("respects custom defaultLimit and maxLimit options", () => {
      const reqMissing = createMockRequest();
      expect(readLimit(reqMissing, { defaultLimit: 10, maxLimit: 100 })).toBe(
        10
      );

      const reqExceed = createMockRequest({ query: { limit: "200" } });
      expect(readLimit(reqExceed, { defaultLimit: 10, maxLimit: 100 })).toBe(
        100
      );
    });
  });

  describe("readDictParam", () => {
    test("extracts dict, d, and in parameters", () => {
      const req = createMockRequest({
        query: {
          d: "3",
          dict: ["L&S", "GAF"],
          in: "ls",
        },
      });
      expect(readDictParam(req)).toEqual({
        bitmaskParam: "3",
        dictParam: ["L&S", "GAF"],
        inParam: "ls",
      });
    });

    test("takes the last value when d is an array", () => {
      const req = createMockRequest({
        query: {
          d: ["1", "3"],
        },
      });
      expect(readDictParam(req)).toEqual({
        bitmaskParam: "3",
        dictParam: undefined,
        inParam: undefined,
      });
    });

    test("handles missing dictionary query parameters gracefully", () => {
      const req = createMockRequest();
      expect(readDictParam(req)).toEqual({
        bitmaskParam: null,
        dictParam: undefined,
        inParam: undefined,
      });
    });
  });
});
