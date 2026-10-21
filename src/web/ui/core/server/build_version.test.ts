import type { Request, Response } from "express";
import {
  DEV_SERVER_ENV,
  IMMUTABLE_CACHE_CONTROL,
  getBuildVersion,
  getCommitId,
  setVersionedCacheControl,
} from "@/web/ui/core/server/build_version.server";

function restoreEnv(name: string, saved: string | undefined): void {
  if (saved === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = saved;
  }
}

describe("getBuildVersion", () => {
  const savedCommit = process.env.COMMIT_ID;
  const savedDev = process.env[DEV_SERVER_ENV];

  afterEach(() => {
    restoreEnv("COMMIT_ID", savedCommit);
    restoreEnv(DEV_SERVER_ENV, savedDev);
  });

  test("reads COMMIT_ID", () => {
    delete process.env[DEV_SERVER_ENV];
    process.env.COMMIT_ID = "abc123";
    expect(getBuildVersion()).toBe("abc123");
  });

  test("an override wins over COMMIT_ID", () => {
    process.env.COMMIT_ID = "abc123";
    expect(getBuildVersion("def456")).toBe("def456");
  });

  test("unset or empty is a build without a version", () => {
    delete process.env.COMMIT_ID;
    expect(getBuildVersion()).toBeUndefined();
    process.env.COMMIT_ID = "";
    expect(getBuildVersion()).toBeUndefined();
  });

  test("a dev server adds a stable per-process nonce", () => {
    process.env.COMMIT_ID = "abc123";
    process.env[DEV_SERVER_ENV] = "1";
    const version = getBuildVersion();
    expect(version).toMatch(/^abc123-dev\.[0-9a-z]+$/);
    expect(getBuildVersion()).toBe(version);
    // The commit itself stays clean for display and reports.
    expect(getCommitId()).toBe("abc123");
  });

  test("a dev server without a commit has no version", () => {
    delete process.env.COMMIT_ID;
    process.env[DEV_SERVER_ENV] = "1";
    expect(getBuildVersion()).toBeUndefined();
  });
});

describe("setVersionedCacheControl", () => {
  function cacheControlFor(
    query: Record<string, unknown>,
    options: Parameters<typeof setVersionedCacheControl>[2]
  ): unknown {
    const setHeader = jest.fn();
    setVersionedCacheControl(
      { query } as unknown as Request,
      { setHeader } as unknown as Response,
      options
    );
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", expect.anything());
    return setHeader.mock.calls[0][1];
  }

  test("the current version is immutable", () => {
    expect(cacheControlFor({ v: "abc123" }, { buildVersion: "abc123" })).toBe(
      IMMUTABLE_CACHE_CONTROL
    );
  });

  test("private scope keeps it out of shared caches", () => {
    expect(
      cacheControlFor(
        { v: "abc123" },
        { buildVersion: "abc123", scope: "private" }
      )
    ).toBe("private, max-age=31536000, immutable");
  });

  test("a stale version, no version, or no build version revalidates", () => {
    const current = { buildVersion: "abc123" };
    expect(cacheControlFor({ v: "old" }, current)).toBe("no-cache");
    expect(cacheControlFor({}, current)).toBe("no-cache");
    expect(cacheControlFor({ v: "abc123" }, { buildVersion: "" })).toBe(
      "no-cache"
    );
    expect(cacheControlFor({ v: ["abc123"] }, current)).toBe("no-cache");
  });
});
