/**
 * @jest-environment jsdom
 */

import { describe, expect, it } from "@jest/globals";
import { backendCall, getHash } from "@/web/client/browser_utils";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
});

function replaceFetch(ok: boolean = true, text: string = "", error?: Error) {
  const mockSuccess = jest.fn((request) =>
    Promise.resolve({
      text: () => Promise.resolve(text),
      ok: ok,
      request: request,
    })
  );
  const mockError = jest.fn((request) => Promise.reject(error));
  const mockFetch = error === undefined ? mockSuccess : mockError;
  // @ts-ignore
  global.fetch = mockFetch;
  return mockFetch;
}

describe("getHash", () => {
  let windowSpy: jest.SpyInstance;

  beforeEach(() => {
    windowSpy = jest.spyOn(window, "window", "get");
  });

  afterEach(() => {
    windowSpy.mockRestore();
  });

  it("returns empty string if no hash", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "",
      },
    }));

    expect(getHash()).toBe("");
  });

  it("prunes the initial hash", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "#Gallia",
      },
    }));

    expect(getHash()).toBe("Gallia");
  });

  it("decodes URL encoded values", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "#part%C4%93s",
      },
    }));

    expect(getHash()).toBe("partēs");
  });
});

describe("backendCall", () => {
  it("returns text on success", async () => {
    replaceFetch(true, "Gallia est omnis");
    expect(await backendCall("/foo")).toBe("Gallia est omnis");
  });

  it("returns message on server failure", async () => {
    replaceFetch(false, "Gallia est omnis");
    expect(await backendCall("/foo")).toContain("Error");
  });

  it("returns message on errored promise", async () => {
    replaceFetch(false, "Gallia est omnis", new Error("Ya dun goofed"));
    expect(await backendCall("/foo")).toContain("goofed");
  });
});
