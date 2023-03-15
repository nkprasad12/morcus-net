/**
 * @jest-environment jsdom
 */

import { describe, expect, it } from "@jest/globals";
import { getHash } from "./browser_utils";

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
