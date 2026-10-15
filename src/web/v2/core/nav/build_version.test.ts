/**
 * @jest-environment jsdom
 */

import {
  getPageBuildVersion,
  withBuildVersion,
} from "@/web/v2/core/nav/build_version.client";

describe("withBuildVersion", () => {
  afterEach(() => {
    delete document.documentElement.dataset.version;
  });

  test("leaves the URL alone without a build version", () => {
    expect(getPageBuildVersion()).toBeUndefined();
    expect(withBuildVersion("/v2/reader/caesar/gallic-war/2")).toBe(
      "/v2/reader/caesar/gallic-war/2"
    );
  });

  test("treats an empty build version as none", () => {
    document.documentElement.dataset.version = "";
    expect(getPageBuildVersion()).toBeUndefined();
    expect(withBuildVersion("/a")).toBe("/a");
  });

  test("adds v and keeps the URL relative", () => {
    document.documentElement.dataset.version = "abc123";
    expect(withBuildVersion("/v2/api/completions?prefix=am")).toBe(
      "/v2/api/completions?prefix=am&v=abc123"
    );
  });

  test("replaces an existing v and keeps the hash", () => {
    document.documentElement.dataset.version = "abc123";
    expect(withBuildVersion("/a?v=old&q=x#frag")).toBe("/a?v=abc123&q=x#frag");
  });

  test("resolves absolute same-origin URLs to a path", () => {
    document.documentElement.dataset.version = "abc123";
    expect(withBuildVersion(`${window.location.origin}/a?b=1`)).toBe(
      "/a?b=1&v=abc123"
    );
  });

  test("encodes the version", () => {
    document.documentElement.dataset.version = "a b&c";
    expect(withBuildVersion("/a")).toBe("/a?v=a+b%26c");
  });
});
