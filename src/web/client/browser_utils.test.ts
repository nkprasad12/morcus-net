/**
 * @jest-environment jsdom
 */

import { describe, expect, it } from "@jest/globals";
import { backendCall, getHash, getUrlParams } from "./browser_utils";

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

  it("removes parameters", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "#Gallia?highlight=322",
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

describe("getUrlParams", () => {
  let windowSpy: jest.SpyInstance;

  beforeEach(() => {
    windowSpy = jest.spyOn(window, "window", "get");
  });

  afterEach(() => {
    windowSpy.mockRestore();
  });

  it("returns empty map if no hash", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "",
      },
    }));

    expect(getUrlParams().size).toBe(0);
  });

  it("handles key only parameters", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "#Gallia?flag",
      },
    }));

    const params = getUrlParams();
    expect(params.get("flag")).toBe("");
  });

  it("handles parameters with multiple equals", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "#Gallia?flag=name=value",
      },
    }));

    const params = getUrlParams();
    expect(params.get("flag")).toBe("name=value");
  });

  it("handles multiple parameters", () => {
    windowSpy.mockImplementation(() => ({
      location: {
        hash: "#Gallia?a=b?c=d?e=f",
      },
    }));

    const params = getUrlParams();
    expect(params.size).toBe(3);
    expect(params.get("a")).toBe("b");
    expect(params.get("c")).toBe("d");
    expect(params.get("e")).toBe("f");
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
