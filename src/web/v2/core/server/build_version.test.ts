import type { Request, Response } from "express";
import {
  IMMUTABLE_CACHE_CONTROL,
  getBuildVersion,
  setVersionedCacheControl,
} from "@/web/v2/core/server/build_version.server";

describe("getBuildVersion", () => {
  const saved = process.env.COMMIT_ID;

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.COMMIT_ID;
    } else {
      process.env.COMMIT_ID = saved;
    }
  });

  test("reads COMMIT_ID", () => {
    process.env.COMMIT_ID = "abc123";
    expect(getBuildVersion()).toBe("abc123");
  });

  test("an override wins over COMMIT_ID", () => {
    process.env.COMMIT_ID = "abc123";
    expect(getBuildVersion("def456")).toBe("def456");
  });

  test("unset or empty is a dev build", () => {
    delete process.env.COMMIT_ID;
    expect(getBuildVersion()).toBeUndefined();
    process.env.COMMIT_ID = "";
    expect(getBuildVersion()).toBeUndefined();
  });
});

describe("setVersionedCacheControl", () => {
  function cacheControlFor(
    query: Record<string, unknown>,
    buildVersion: string | undefined
  ): unknown {
    const setHeader = jest.fn();
    setVersionedCacheControl(
      { query } as unknown as Request,
      { setHeader } as unknown as Response,
      buildVersion
    );
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", expect.anything());
    return setHeader.mock.calls[0][1];
  }

  test("the current version is immutable", () => {
    expect(cacheControlFor({ v: "abc123" }, "abc123")).toBe(
      IMMUTABLE_CACHE_CONTROL
    );
  });

  test("a stale version, no version, or a dev build revalidates", () => {
    expect(cacheControlFor({ v: "old" }, "abc123")).toBe("no-cache");
    expect(cacheControlFor({}, "abc123")).toBe("no-cache");
    expect(cacheControlFor({ v: "abc123" }, undefined)).toBe("no-cache");
    expect(cacheControlFor({ v: ["abc123"] }, "abc123")).toBe("no-cache");
  });
});
