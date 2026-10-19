import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  buildMarkdownReport,
  collectGitEntries,
  collectResultEntries,
  jsonForScriptTag,
  parseCompareOutput,
  parseNameStatus,
  parseSnapshotName,
  projectFromResultsDir,
  readPngDimensions,
  resolveServedPath,
  runVisualDiffInspector,
  sizeForProject,
} from "@/scripts/visual_diff/visual_diff";
import type { VisualDiffManifest } from "@/scripts/visual_diff/visual_diff_types";

/** Minimal header-only PNG; enough for `readPngDimensions`. */
function fakePng(width: number, height: number, fill = 0): Buffer {
  const buf = Buffer.alloc(32, fill);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "visual-diff-test-"));
}

describe("parseSnapshotName", () => {
  it("parses a baseline file name", () => {
    expect(
      parseSnapshotName("dicts-results-gladius-js-dark-chromium-linux.png")
    ).toEqual({
      scenario: "dicts-results-gladius",
      category: "Dictionary",
      mode: "js",
      theme: "dark",
      size: "large",
      browser: "chromium",
    });
  });

  it("distinguishes FirefoxSmallScreen from firefox", () => {
    expect(
      parseSnapshotName("about-page-nojs-light-FirefoxSmallScreen-linux.png")
        .browser
    ).toBe("FirefoxSmallScreen");
    expect(
      parseSnapshotName("about-page-nojs-light-FirefoxSmallScreen-linux.png")
        .size
    ).toBe("small");
    expect(
      parseSnapshotName("reader-passage-nojs-light-firefox-darwin.png")
    ).toMatchObject({ browser: "firefox", size: "large", category: "Reader" });
  });

  it("parses corpus snapshots into the Corpus category", () => {
    expect(
      parseSnapshotName("corpus-landing-js-light-chromium-linux.png")
    ).toMatchObject({
      scenario: "corpus-landing",
      category: "Corpus",
    });
  });

  it("uses the browser hint for Playwright result names", () => {
    expect(
      parseSnapshotName("library-landing-js-light.png", "MobileChrome")
    ).toEqual({
      scenario: "library-landing",
      category: "Library",
      mode: "js",
      theme: "light",
      size: "small",
      browser: "MobileChrome",
    });
  });

  it("falls back for arbitrary names", () => {
    expect(parseSnapshotName("legacy_header_test.png")).toEqual({
      scenario: "legacy_header_test",
      category: "Other",
      mode: "default",
      theme: "default",
      size: "unknown",
      browser: "unknown",
    });
  });
});

describe("sizeForProject", () => {
  it("maps Playwright projects to form factors", () => {
    expect(sizeForProject("chromium")).toBe("large");
    expect(sizeForProject("firefox")).toBe("large");
    expect(sizeForProject("MobileChrome")).toBe("small");
    expect(sizeForProject("FirefoxSmallScreen")).toBe("small");
    expect(sizeForProject("unknown")).toBe("unknown");
  });
});

describe("projectFromResultsDir", () => {
  it("extracts the project, ignoring retry suffixes", () => {
    expect(projectFromResultsDir("browser_v2-UI-V2-foo-chromium")).toBe(
      "chromium"
    );
    expect(
      projectFromResultsDir("browser_v2-UI-V2-foo-FirefoxSmallScreen-retry1")
    ).toBe("FirefoxSmallScreen");
    expect(projectFromResultsDir("browser_v2-UI-V2-foo")).toBeUndefined();
  });
});

describe("parseCompareOutput", () => {
  it("handles ImageMagick 6, 7, and scientific notation", () => {
    expect(parseCompareOutput("1234")).toBe(1234);
    expect(parseCompareOutput("1234 (0.0188)")).toBe(1234);
    expect(parseCompareOutput("1.5e+06 (0.5)")).toBe(1500000);
    expect(parseCompareOutput("compare: image widths differ")).toBeUndefined();
  });
});

describe("parseNameStatus", () => {
  it("parses NUL-separated output", () => {
    expect(parseNameStatus("M\0a.png\0D\0b c.png\0A\0d.png\0")).toEqual([
      { status: "M", path: "a.png" },
      { status: "D", path: "b c.png" },
      { status: "A", path: "d.png" },
    ]);
  });
});

describe("readPngDimensions", () => {
  it("reads IHDR dimensions", () => {
    expect(readPngDimensions(fakePng(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("returns undefined for non-PNG input", () => {
    expect(readPngDimensions(Buffer.from("NOT_A_PNG_FILE_AT_ALL!!!"))).toBe(
      undefined
    );
  });
});

describe("jsonForScriptTag", () => {
  it("cannot close the surrounding script tag", () => {
    const out = jsonForScriptTag({ s: "</script><img src=x>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ s: "</script><img src=x>" });
  });
});

describe("resolveServedPath", () => {
  const root = path.resolve("/tmp/out");

  it("serves index.html for the root", () => {
    expect(resolveServedPath(root, "/")).toBe(path.join(root, "index.html"));
  });

  it("rejects traversal outside the root", () => {
    expect(resolveServedPath(root, "/../etc/passwd")).toBeUndefined();
    expect(
      resolveServedPath(root, "/%2e%2e/%2e%2e/etc/passwd")
    ).toBeUndefined();
    expect(resolveServedPath(root, "/..%2f..%2fetc")).toBeUndefined();
    expect(resolveServedPath(root, "/%E0%A4%A")).toBeUndefined();
  });

  it("allows nested files inside the root", () => {
    expect(resolveServedPath(root, "/images/a%20b.png")).toBe(
      path.join(root, "images/a b.png")
    );
  });
});

describe("buildMarkdownReport", () => {
  it("lists items by severity and includes the approval notice", () => {
    const manifest: VisualDiffManifest = {
      source: "git",
      beforeLabel: "HEAD",
      afterLabel: "Working copy",
      items: [
        {
          id: "a",
          name: "a.png",
          scenario: "small",
          category: "Other",
          mode: "js",
          theme: "light",
          size: "large",
          browser: "chromium",
          status: "modified",
          before: { width: 1280, height: 720 },
          after: { width: 1280, height: 720 },
          diffPixels: 4200,
          diffPct: 4.56,
        },
        {
          id: "b",
          name: "b.png",
          scenario: "new",
          category: "Other",
          mode: "js",
          theme: "light",
          size: "large",
          browser: "chromium",
          status: "added",
          after: { width: 10, height: 10 },
        },
      ],
    };
    const md = buildMarkdownReport(manifest);
    expect(md).toContain("4.56%");
    expect(md).toContain("4,200");
    expect(md).toContain("1280×720");
    expect(md).toContain("Visual Baseline Approval Rule");
    expect(md.indexOf("new")).toBeLessThan(md.indexOf("small"));
  });
});

describe("collectResultEntries", () => {
  it("pairs expected/actual/diff and keeps the latest retry", () => {
    const dir = makeTempDir();
    const first = path.join(dir, "suite-foo-chromium");
    const retry = path.join(dir, "suite-foo-chromium-retry1");
    const added = path.join(dir, "suite-bar-MobileChrome");
    for (const d of [first, retry, added]) fs.mkdirSync(d);
    for (const d of [first, retry]) {
      fs.writeFileSync(path.join(d, "foo-js-light-expected.png"), "");
      fs.writeFileSync(path.join(d, "foo-js-light-actual.png"), "");
    }
    fs.writeFileSync(path.join(retry, "foo-js-light-diff.png"), "");
    fs.writeFileSync(path.join(added, "bar-js-dark-actual.png"), "");

    const entries = collectResultEntries(dir);
    expect(entries.map((e) => [e.name, e.browserHint, e.status])).toEqual([
      ["bar-js-dark.png", "MobileChrome", "added"],
      ["foo-js-light.png", "chromium", "modified"],
    ]);
    expect(entries[1].afterPath).toContain("retry1");
    expect(entries[1].fallbackDiffPath).toContain("retry1");
  });

  it("returns nothing when the directory is missing", () => {
    expect(collectResultEntries("/nonexistent/visual-diff-dir")).toEqual([]);
  });
});

describe("git source (end to end)", () => {
  let repo: string;
  const run = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    repo = makeTempDir();
    run("init", "-q");
    run("config", "user.email", "test@example.com");
    run("config", "user.name", "Test");
    const snaps = path.join(repo, "snaps");
    fs.mkdirSync(snaps);
    fs.writeFileSync(
      path.join(snaps, "mod-js-light-chromium-linux.png"),
      fakePng(10, 10)
    );
    fs.writeFileSync(
      path.join(snaps, "del-js-light-chromium-linux.png"),
      fakePng(10, 10)
    );
    fs.writeFileSync(
      path.join(snaps, "same-js-light-chromium-linux.png"),
      fakePng(10, 10)
    );
    run("add", ".");
    run("commit", "-q", "-m", "init");
    fs.writeFileSync(
      path.join(snaps, "mod-js-light-chromium-linux.png"),
      fakePng(20, 10, 1)
    );
    fs.rmSync(path.join(snaps, "del-js-light-chromium-linux.png"));
    fs.writeFileSync(
      path.join(snaps, "v2-new-js-light-chromium-linux.png"),
      fakePng(10, 10)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("finds modified, deleted, and untracked snapshots", () => {
    const entries = collectGitEntries(path.join(repo, "snaps"), "HEAD");
    expect(entries.map((e) => [e.name, e.status])).toEqual([
      ["del-js-light-chromium-linux.png", "deleted"],
      ["mod-js-light-chromium-linux.png", "modified"],
      ["v2-new-js-light-chromium-linux.png", "added"],
    ]);
  });

  it("rejects an unknown ref", () => {
    expect(() =>
      collectGitEntries(path.join(repo, "snaps"), "no-such-ref")
    ).toThrow();
  });

  it("writes a viewer without a server", async () => {
    const outDir = path.join(repo, "out");
    const result = await runVisualDiffInspector({
      source: "git",
      snapshotDir: path.join(repo, "snaps"),
      outDir,
      startServer: false,
    });

    const byName = new Map(result.manifest.items.map((i) => [i.scenario, i]));
    expect(byName.get("mod")).toMatchObject({
      status: "modified",
      before: { width: 10, height: 10 },
      after: { width: 20, height: 10 },
    });
    expect(byName.get("del")?.afterUrl).toBeUndefined();
    expect(byName.get("del")?.beforeUrl).toBeDefined();
    expect(byName.get("new")?.beforeUrl).toBeUndefined();

    const html = fs.readFileSync(path.join(outDir, "index.html"), "utf-8");
    expect(html).not.toContain("__VISUAL_DIFF_MANIFEST__");
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(fs.existsSync(path.join(outDir, "viewer.js"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "viewer.css"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "report.md"))).toBe(true);
  });
});
