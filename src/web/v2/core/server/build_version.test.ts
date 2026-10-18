import type { Request, Response } from "express";
import {
  BUILD_ID_ENV,
  DEV_SERVER_ENV,
  IMMUTABLE_CACHE_CONTROL,
  getBuildVersion,
  getCommitId,
  setVersionedCacheControl,
} from "@/web/v2/core/server/build_version.server";

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
  const savedBuildId = process.env[BUILD_ID_ENV];

  beforeEach(() => {
    delete process.env[BUILD_ID_ENV];
  });

  afterEach(() => {
    restoreEnv("COMMIT_ID", savedCommit);
    restoreEnv(DEV_SERVER_ENV, savedDev);
    restoreEnv(BUILD_ID_ENV, savedBuildId);
  });

  test("prefers the build ID, leaving the commit for display", () => {
    delete process.env[DEV_SERVER_ENV];
    process.env.COMMIT_ID = "abc123";
    process.env[BUILD_ID_ENV] = "0123456789ab";
    expect(getBuildVersion()).toBe("0123456789ab");
    expect(getCommitId()).toBe("abc123");
  });

  test("a dev server adds its nonce to the build ID too", () => {
    process.env.COMMIT_ID = "abc123";
    process.env[BUILD_ID_ENV] = "0123456789ab";
    process.env[DEV_SERVER_ENV] = "1";
    expect(getBuildVersion()).toMatch(/^0123456789ab-dev\.[0-9a-z]+$/);
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
