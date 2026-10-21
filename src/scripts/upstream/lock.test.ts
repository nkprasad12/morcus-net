import { readFileSync } from "fs";
import {
  canonicalRepo,
  githubSshUrl,
  isGitHubRepo,
  pinnedDownload,
  pinnedFileUrl,
  rawFileUrl,
  readUpstreamLock,
  upstreamSource,
  validateUpstreamLock,
  type UpstreamLock,
} from "@/scripts/upstream/lock";
import { parsePinRequest } from "@/scripts/upstream/pin";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function lockWith(source: Record<string, string>): UpstreamLock {
  return {
    sources: {
      foo: {
        repo: "https://github.com/owner/foo.git",
        branch: "main",
        commit: SHA,
        env: "FOO_PATH",
        ...source,
      },
    },
  };
}

describe("the checked-in lock file", () => {
  const lock = readUpstreamLock();

  it("is valid, with only GitHub repos", () => {
    for (const source of Object.values(lock.sources)) {
      expect(isGitHubRepo(source.repo)).toBe(true);
    }
  });

  it("has a single file for every source the prod build downloads", () => {
    const prodBuild = readFileSync("src/scripts/prod_build_steps.ts", "utf8");
    const downloads = Array.from(
      prodBuild.matchAll(/pinnedDownload\("([^"]+)"\)/g),
      (match) => match[1]
    );
    expect(downloads.length).toBeGreaterThan(0);
    for (const name of downloads) {
      expect(lock.sources[name]?.file).toBeDefined();
    }
  });
});

describe("lock helpers", () => {
  it("builds raw URLs at the pinned commit", () => {
    expect(rawFileUrl(lockWith({}).sources.foo, "a/b.txt")).toBe(
      `https://raw.githubusercontent.com/owner/foo/${SHA}/a/b.txt`
    );
  });

  it("resolves sources from the lock file", () => {
    const lexica = upstreamSource("lexica");
    expect(pinnedFileUrl("lexica", "x.xml")).toBe(
      `https://raw.githubusercontent.com/nkprasad12/lexica/${lexica.commit}/x.xml`
    );
    expect(() => upstreamSource("not-a-source")).toThrow();
  });

  it("downloads a source's file to where its env var points", () => {
    const saved = process.env.GESNER_RAW_PATH;
    process.env.GESNER_RAW_PATH = "/tmp/gesner.json";
    try {
      const gesner = upstreamSource("gesner");
      expect(pinnedDownload("gesner")).toEqual({
        url: rawFileUrl(gesner, "gesner.json"),
        path: "/tmp/gesner.json",
      });
      expect(() => pinnedDownload("hypotactic")).toThrow(/single file/);
    } finally {
      if (saved === undefined) delete process.env.GESNER_RAW_PATH;
      else process.env.GESNER_RAW_PATH = saved;
    }
  });

  it("rejects malformed entries", () => {
    expect(() => validateUpstreamLock(lockWith({}))).not.toThrow();
    expect(() => validateUpstreamLock(lockWith({ commit: "master" }))).toThrow(
      /commit/
    );
    expect(() =>
      validateUpstreamLock(lockWith({ commit: SHA.slice(0, 7) }))
    ).toThrow(/commit/);
    expect(() => validateUpstreamLock(lockWith({ repo: "" }))).toThrow(/repo/);
    expect(() => validateUpstreamLock(lockWith({ branch: "" }))).toThrow(
      /branch/
    );
    expect(() => validateUpstreamLock(lockWith({ env: "lower" }))).toThrow(
      /env/
    );
    expect(() => validateUpstreamLock(JSON.parse("{}"))).toThrow(/sources/);
  });

  it("rejects an env var used twice", () => {
    const lock = lockWith({});
    lock.sources.bar = { ...lock.sources.foo };
    expect(() => validateUpstreamLock(lock)).toThrow(/twice/);
  });

  it("matches GitHub remotes however they were cloned", () => {
    const want = "owner/repo";
    expect(canonicalRepo("https://github.com/Owner/repo.git")).toBe(want);
    expect(canonicalRepo("https://github.com/owner/repo")).toBe(want);
    expect(canonicalRepo("git@github.com:owner/repo.git")).toBe(want);
    expect(canonicalRepo("ssh://git@github.com/owner/repo.git")).toBe(want);
    expect(canonicalRepo("/tmp/remote.git")).toBe("/tmp/remote.git");
  });

  it("turns GitHub https URLs into SSH URLs for pushing", () => {
    expect(githubSshUrl("https://github.com/owner/repo.git")).toBe(
      "git@github.com:owner/repo.git"
    );
    expect(githubSshUrl("https://github.com/Owner/repo")).toBe(
      "git@github.com:Owner/repo.git"
    );
    expect(githubSshUrl("git@github.com:owner/repo.git")).toBeUndefined();
    expect(githubSshUrl("/tmp/remote.git")).toBeUndefined();
  });

  it("parses pin requests", () => {
    expect(parsePinRequest("gesner")).toEqual({ name: "gesner" });
    expect(parsePinRequest("gesner@fix/typo")).toEqual({
      name: "gesner",
      ref: "fix/typo",
    });
    expect(() => parsePinRequest("gesner@")).toThrow();
  });
});
