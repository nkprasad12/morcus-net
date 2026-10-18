import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  buildProvenance,
  clearRecordedBuildInputs,
  computeBuildId,
  gitBlobSha1,
  gitHead,
  recordClone,
  recordDownload,
  recordedBuildInputs,
  writeBuildProvenance,
} from "@/scripts/build_provenance";
import { loadBuildId } from "@/web/v2/core/server/build_version.server";

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

describe("build_provenance", () => {
  let dir: string;
  const savedCommit = process.env.COMMIT_ID;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "provenance-"));
    clearRecordedBuildInputs();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    clearRecordedBuildInputs();
    if (savedCommit === undefined) delete process.env.COMMIT_ID;
    else process.env.COMMIT_ID = savedCommit;
  });

  describe("gitBlobSha1", () => {
    test("matches git hash-object", async () => {
      const file = path.join(dir, "lexicon.xml");
      writeFileSync(file, "<entry>amo</entry>\n".repeat(10_000));
      expect(await gitBlobSha1(file)).toBe(git(dir, "hash-object", file));
    });

    test("matches the well-known ID of an empty blob", async () => {
      const file = path.join(dir, "empty");
      writeFileSync(file, "");
      expect(await gitBlobSha1(file)).toBe(
        "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
      );
    });
  });

  test("gitHead reads a repo's checked-out commit", () => {
    git(dir, "init", "-q");
    writeFileSync(path.join(dir, "a.txt"), "a");
    git(dir, "add", "a.txt");
    git(
      dir,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      "a"
    );
    expect(gitHead(dir)).toBe(git(dir, "rev-parse", "HEAD"));
    expect(() => gitHead(path.join(dir, "missing"))).toThrow();
  });

  test("records downloads and clones as git object IDs, sorted by URL", async () => {
    const file = path.join(dir, "gesner.json");
    writeFileSync(file, "{}");
    git(dir, "init", "-q");
    git(dir, "add", "gesner.json");
    git(
      dir,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      "a"
    );

    recordClone("https://example.com/z.git", dir);
    await recordDownload("https://example.com/a.json", file);

    const inputs = recordedBuildInputs();
    expect(Object.keys(inputs)).toEqual([
      "https://example.com/a.json",
      "https://example.com/z.git",
    ]);
    expect(inputs["https://example.com/a.json"]).toBe(
      `blob:${git(dir, "hash-object", file)}`
    );
    expect(inputs["https://example.com/z.git"]).toBe(
      `commit:${git(dir, "rev-parse", "HEAD")}`
    );
  });

  describe("computeBuildId", () => {
    const inputs = { "https://a": "blob:1", "https://b": "commit:2" };

    test("is short, deterministic, and ignores input order", () => {
      const id = computeBuildId("abc", inputs);
      expect(id).toMatch(/^[0-9a-f]{12}$/);
      expect(computeBuildId("abc", inputs)).toBe(id);
      expect(
        computeBuildId("abc", {
          "https://b": "commit:2",
          "https://a": "blob:1",
        })
      ).toBe(id);
    });

    test("changes with the commit or any input", () => {
      const id = computeBuildId("abc", inputs);
      expect(computeBuildId("abd", inputs)).not.toBe(id);
      expect(
        computeBuildId("abc", { ...inputs, "https://a": "blob:9" })
      ).not.toBe(id);
      expect(computeBuildId("abc", { "https://a": "blob:1" })).not.toBe(id);
    });
  });

  test("writeBuildProvenance writes what loadBuildId reads back", async () => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    process.env.COMMIT_ID = "abc123";
    const file = path.join(dir, "input.txt");
    writeFileSync(file, "amo");
    await recordDownload("https://example.com/input.txt", file);

    const out = path.join(dir, "build.json");
    const written = await writeBuildProvenance(out);

    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(written);
    expect(written).toEqual(buildProvenance("abc123", recordedBuildInputs()));
    expect(loadBuildId("abc123", out)).toBe(written.buildId);
  });

  describe("loadBuildId", () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    test("is undefined without a file or a commit", () => {
      expect(
        loadBuildId("abc", path.join(dir, "missing.json"))
      ).toBeUndefined();
      const out = path.join(dir, "build.json");
      writeFileSync(out, JSON.stringify(buildProvenance("abc", {})));
      expect(loadBuildId(undefined, out)).toBeUndefined();
      expect(warn).not.toHaveBeenCalled();
    });

    test("ignores a file left over from another commit", () => {
      const out = path.join(dir, "build.json");
      writeFileSync(out, JSON.stringify(buildProvenance("old", {})));
      expect(loadBuildId("new", out)).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });

    test("ignores a malformed file", () => {
      const out = path.join(dir, "build.json");
      writeFileSync(out, "{not json");
      expect(loadBuildId("abc", out)).toBeUndefined();
      writeFileSync(out, JSON.stringify({ commit: "abc", buildId: 7 }));
      expect(loadBuildId("abc", out)).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });
});
