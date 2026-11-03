import { execFileSync } from "child_process";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {
  type BaselinePaths,
  readManifest,
  readPreviousBatch,
  recordUpdateFromSnapshot,
  snapshotBeforeUpdate,
} from "@/scripts/visual_diff/local_baselines";
import {
  computeTreeState,
  readRunMarker,
  writeRunMarker,
} from "@/scripts/visual_diff/run_marker";
import {
  MANIFEST_FILE,
  buildMarkdownReport,
  collectFailuresWithoutSnapshot,
  collectPreviousEntries,
  collectResultEntries,
  incompleteItems,
  isSameOrigin,
  jsonForScriptTag,
  namesFromReport,
  newSessionToken,
  parseCompareOutput,
  parseSnapshotName,
  projectFromResultsDir,
  readPngDimensions,
  resolveServedPath,
  runVisualDiffInspector,
  sizeForProject,
  tokenMatches,
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
      source: "previous",
      beforeLabel: "Previous baseline",
      afterLabel: "Local baseline",
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
    expect(entries.map((e) => e.snapshotName)).toEqual([
      `bar-js-dark-MobileChrome-${process.platform}.png`,
      `foo-js-light-chromium-${process.platform}.png`,
    ]);
    expect(entries[1].afterPath).toContain("retry1");
    expect(entries[1].fallbackDiffPath).toContain("retry1");
  });

  it("returns nothing when the directory is missing", () => {
    expect(collectResultEntries("/nonexistent/visual-diff-dir")).toEqual([]);
  });
});

describe("collectFailuresWithoutSnapshot", () => {
  it("lists failures that never reached a screenshot comparison", () => {
    const dir = makeTempDir();
    const timedOut = path.join(dir, "suite-notes-nojs-light--MobileSafari");
    const compared = path.join(dir, "suite-foo-js-light--chromium");
    const crashed = path.join(dir, "suite-bar-js-dark--firefox");
    for (const d of [timedOut, compared, crashed]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(timedOut, "test-failed-1.png"), "");
    fs.writeFileSync(path.join(timedOut, "error-context.md"), "");
    fs.writeFileSync(path.join(compared, "test-failed-1.png"), "");
    fs.writeFileSync(path.join(compared, "foo-js-light-actual.png"), "");
    fs.writeFileSync(path.join(crashed, "error-context.md"), "");

    expect(collectFailuresWithoutSnapshot(dir)).toEqual([
      { dir: "suite-bar-js-dark--firefox", project: "firefox" },
      { dir: "suite-notes-nojs-light--MobileSafari", project: "MobileSafari" },
    ]);
  });

  it("counts only the latest retry of a test", () => {
    const dir = makeTempDir();
    const first = path.join(dir, "suite-foo-chromium");
    const retry = path.join(dir, "suite-foo-chromium-retry1");
    for (const d of [first, retry]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(first, "error-context.md"), "");
    fs.writeFileSync(path.join(retry, "test-failed-1.png"), "");
    fs.writeFileSync(path.join(retry, "foo-js-light-actual.png"), "");

    expect(collectFailuresWithoutSnapshot(dir)).toEqual([]);
  });

  it("ignores directories without failure artifacts, and a missing directory", () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, "suite-trace-chromium"));
    fs.writeFileSync(path.join(dir, "suite-trace-chromium", "trace.zip"), "");
    expect(collectFailuresWithoutSnapshot(dir)).toEqual([]);
    expect(
      collectFailuresWithoutSnapshot("/nonexistent/visual-diff-dir")
    ).toEqual([]);
  });

  it("is called out at the top of the report", () => {
    const md = buildMarkdownReport({
      source: "results",
      beforeLabel: "Expected",
      afterLabel: "Actual",
      items: [],
      failuresWithoutSnapshot: [
        {
          dir: "suite-notes-nojs-light--MobileSafari",
          project: "MobileSafari",
        },
      ],
    });
    expect(md).toContain("[!WARNING]");
    expect(md).toContain("1 failed without a screenshot (not shown)");
    expect(md).toContain("suite-notes-nojs-light--MobileSafari [MobileSafari]");
    expect(md.indexOf("[!WARNING]")).toBeLessThan(md.indexOf("| Scenario"));
  });
});

describe("previous source (end to end)", () => {
  let root: string;
  let localPaths: BaselinePaths;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    root = makeTempDir();
    localPaths = {
      storeDir: path.join(root, ".visual-baselines", "local"),
      previousDir: path.join(root, ".visual-baselines", "previous"),
    };
    const before1 = snapshotBeforeUpdate(localPaths);
    fs.mkdirSync(localPaths.storeDir, { recursive: true });
    fs.writeFileSync(
      path.join(localPaths.storeDir, "mod-js-light-chromium-linux.png"),
      fakePng(10, 10)
    );
    fs.writeFileSync(
      path.join(localPaths.storeDir, "same-js-light-chromium-linux.png"),
      fakePng(10, 10)
    );
    recordUpdateFromSnapshot(localPaths, before1);

    const before2 = snapshotBeforeUpdate(localPaths);
    fs.writeFileSync(
      path.join(localPaths.storeDir, "mod-js-light-chromium-linux.png"),
      fakePng(20, 10, 1)
    );
    fs.writeFileSync(
      path.join(localPaths.storeDir, "new-js-light-chromium-linux.png"),
      fakePng(10, 10)
    );
    recordUpdateFromSnapshot(localPaths, before2);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("finds modified and newly added snapshots from the previous backup", () => {
    const entries = collectPreviousEntries(localPaths);
    expect(entries.map((e) => [e.name, e.status])).toEqual([
      ["mod-js-light-chromium-linux.png", "modified"],
      ["new-js-light-chromium-linux.png", "added"],
    ]);
  });

  it("writes a viewer without a server", async () => {
    const outDir = path.join(root, "out");
    const result = await runVisualDiffInspector({
      source: "previous",
      localPaths,
      outDir,
      startServer: false,
    });

    const byName = new Map(result.manifest.items.map((i) => [i.scenario, i]));
    expect(byName.get("mod")).toMatchObject({
      status: "modified",
      before: { width: 10, height: 10 },
      after: { width: 20, height: 10 },
    });
    expect(byName.get("new")?.beforeUrl).toBeUndefined();
    expect(byName.get("new")?.afterUrl).toBeDefined();

    const html = fs.readFileSync(path.join(outDir, "index.html"), "utf-8");
    expect(html).not.toContain("__VISUAL_DIFF_MANIFEST__");
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(fs.existsSync(path.join(outDir, "viewer.js"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "viewer.css"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "report.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Accept / undo / drop from the viewer
// ---------------------------------------------------------------------------

describe("tokenMatches", () => {
  it("accepts only the exact token", () => {
    expect(tokenMatches("s3cret", "s3cret")).toBe(true);
    expect(tokenMatches("s3cret", "s3cre")).toBe(false);
    expect(tokenMatches("s3cret", "s3cretX")).toBe(false);
    expect(tokenMatches("s3cret", "")).toBe(false);
    expect(tokenMatches("s3cret", undefined)).toBe(false);
    expect(tokenMatches("s3cret", ["s3cret"])).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
  });

  it("generates long random tokens", () => {
    const a = newSessionToken();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(newSessionToken()).not.toBe(a);
  });
});

describe("isSameOrigin", () => {
  it("requires an Origin that names the Host", () => {
    expect(isSameOrigin({ host: "box:8899", origin: "http://box:8899" })).toBe(
      true
    );
    expect(isSameOrigin({ host: "box:8899" })).toBe(false);
    expect(
      isSameOrigin({ host: "box:8899", origin: "http://evil.example" })
    ).toBe(false);
    expect(isSameOrigin({ host: "box:8899", origin: "null" })).toBe(false);
  });
});

describe("incompleteItems", () => {
  const base = {
    scenario: "s",
    category: "Other" as const,
    mode: "js" as const,
    theme: "light" as const,
    size: "large" as const,
    browser: "chromium",
  };
  it("flags snapshots that can't be judged or mapped to a baseline", () => {
    expect(
      incompleteItems(
        [
          {
            ...base,
            id: "ok",
            name: "ok.png",
            snapshotName: "ok-chromium-linux.png",
            status: "modified",
            before: { width: 1, height: 1 },
            after: { width: 1, height: 1 },
            beforeUrl: "b",
            afterUrl: "a",
            diffUrl: "d",
          },
          { ...base, id: "x", name: "x.png", status: "added" },
          {
            ...base,
            id: "nodiff",
            name: "nodiff.png",
            snapshotName: "nodiff-chromium-linux.png",
            status: "modified",
            before: { width: 1, height: 1 },
            after: { width: 1, height: 1 },
            beforeUrl: "b",
            afterUrl: "a",
          },
        ],
        "results"
      )
    ).toEqual([
      "x.png [chromium]: unknown Playwright project",
      "nodiff-chromium-linux.png: no diff (ImageMagick missing, no Playwright diff)",
    ]);
  });
});

/** Minimal HTTP client that sets exactly the headers given. */
function request(
  port: number,
  pathName: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathName,
        method: options.method ?? "POST",
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          let body: unknown = text;
          try {
            body = JSON.parse(text);
          } catch {
            // Not JSON (static files).
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      }
    );
    req.on("error", reject);
    if (options.body !== undefined) req.write(JSON.stringify(options.body));
    req.end();
  });
}

describe("viewer write endpoints (end to end)", () => {
  const TOKEN = "test-token-0123456789";
  const PLATFORM = process.platform;
  const A = `a-js-light-chromium-${PLATFORM}.png`;
  const B = `b-js-dark-MobileChrome-${PLATFORM}.png`;
  const NEW = `n-nojs-light-webkit-${PLATFORM}.png`;
  let repo: string;
  let results: string;
  let localPaths: BaselinePaths;
  let server: http.Server | undefined;
  let port: number;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });

  function fail(
    stem: string,
    project: string,
    actual: Buffer,
    expected?: Buffer
  ) {
    const dir = path.join(
      results,
      `screenshot-browser_screens-1a2b3-${stem}--${project}`
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${stem}-actual.png`), actual);
    if (expected !== undefined) {
      fs.writeFileSync(path.join(dir, `${stem}-expected.png`), expected);
      fs.writeFileSync(path.join(dir, `${stem}-diff.png`), fakePng(10, 10, 9));
    }
  }

  const headers = (extra: Record<string, string> = {}) => ({
    "Content-Type": "application/json",
    Origin: `http://127.0.0.1:${port}`,
    "X-Visual-Diff-Token": TOKEN,
    ...extra,
  });

  async function start(source: "results" | "previous") {
    const result = await runVisualDiffInspector({
      source,
      resultsDir: results,
      localPaths,
      outDir: path.join(repo, ".cache", "visual-diff"),
      host: "127.0.0.1",
      port: 0,
      token: TOKEN,
      repoRoot: repo,
    });
    server = result.server;
    const address = server?.address();
    port = typeof address === "object" && address !== null ? address.port : 0;
    return result;
  }

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    repo = makeTempDir();
    results = path.join(repo, "test-results");
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    fs.writeFileSync(
      path.join(repo, ".gitignore"),
      "/test-results/\n/.cache/\n/.visual-baselines/\n"
    );
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "app.ts"), "v1");
    git("add", ".");
    git("commit", "-q", "-m", "init");

    localPaths = {
      storeDir: path.join(repo, ".visual-baselines", "local"),
      previousDir: path.join(repo, ".visual-baselines", "previous"),
    };
    const before = snapshotBeforeUpdate(localPaths);
    fs.mkdirSync(localPaths.storeDir, { recursive: true });
    fs.writeFileSync(path.join(localPaths.storeDir, A), fakePng(10, 10, 0));
    fs.writeFileSync(path.join(localPaths.storeDir, B), fakePng(10, 10, 0));
    recordUpdateFromSnapshot(
      localPaths,
      before,
      new Date("2026-01-01T00:00:00Z"),
      repo
    );
    // Clear the initial seed backup so tests start with a clean previousDir.
    fs.rmSync(localPaths.previousDir, { recursive: true, force: true });

    fail("a-js-light", "chromium", fakePng(10, 10, 1), fakePng(10, 10, 0));
    fail("b-js-dark", "MobileChrome", fakePng(10, 10, 2), fakePng(10, 10, 0));
    fail("n-nojs-light", "webkit", fakePng(10, 10, 3));
    writeRunMarker(results, computeTreeState(repo), new Date());
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise((resolve) =>
      server === undefined ? resolve(undefined) : server.close(resolve)
    );
    server = undefined;
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("maps results to baseline names and keeps the token out of the page", async () => {
    const { manifest, viewerUrl, outDir } = await start("results");
    expect(manifest.items.map((i) => i.snapshotName).sort()).toEqual(
      [A, B, NEW].sort()
    );
    expect(manifest.actions).toEqual({ mode: "accept" });
    expect(manifest.localStore).toMatchObject({ active: 2 });
    expect(manifest.reviewKey).toBe(`results:${readRunMarker(results)!.id}`);
    expect(viewerUrl).toContain(`#token=${TOKEN}`);
    for (const file of ["index.html", MANIFEST_FILE]) {
      expect(fs.readFileSync(path.join(outDir, file), "utf-8")).not.toContain(
        TOKEN
      );
    }
    const page = await request(port, "/", { method: "GET" });
    expect(page.status).toBe(200);
    expect(page.body).not.toContain(TOKEN);
  });

  it("rejects requests without the token, from another origin, or not POST", async () => {
    await start("results");
    const body = { names: [A] };
    const noToken = await request(port, "/api/accept", {
      headers: headers({ "X-Visual-Diff-Token": "" }),
      body,
    });
    expect(noToken.status).toBe(403);
    const wrongToken = await request(port, "/api/accept", {
      headers: headers({ "X-Visual-Diff-Token": "nope" }),
      body,
    });
    expect(wrongToken.status).toBe(403);
    const crossOrigin = await request(port, "/api/accept", {
      headers: headers({ Origin: "http://evil.example" }),
      body,
    });
    expect(crossOrigin.status).toBe(403);
    const noOrigin = await request(port, "/api/accept", {
      headers: {
        "Content-Type": "application/json",
        "X-Visual-Diff-Token": TOKEN,
      },
      body,
    });
    expect(noOrigin.status).toBe(403);
    const get = await request(port, "/api/accept", {
      method: "GET",
      headers: headers(),
    });
    expect(get.status).toBe(405);
    const form = await request(port, "/api/accept", {
      headers: headers({ "Content-Type": "text/plain" }),
      body,
    });
    expect(form.status).toBe(415);
    expect(readPreviousBatch(localPaths)).toBeUndefined();
  });

  it("only accepts names from this session", async () => {
    await start("results");
    const res = await request(port, "/api/accept", {
      headers: headers(),
      body: { names: [A, "../../etc/passwd"] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Not in this review session/);
    expect(readPreviousBatch(localPaths)).toBeUndefined();
  });

  it("accepts approved names, and refuses /api/undo from a results session", async () => {
    await start("results");
    const accepted = await request(port, "/api/accept", {
      headers: headers(),
      body: { names: [A, NEW] },
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      added: [NEW],
      updated: [A],
      unchanged: [],
      store: { active: 3, previousCount: 2 },
    });
    expect(accepted.body.store.oldestAcceptedAt).toBeDefined();
    expect(fs.readFileSync(path.join(localPaths.storeDir, B))).toEqual(
      fakePng(10, 10, 0)
    );

    const undone = await request(port, "/api/undo", {
      headers: headers(),
      body: { names: [A] },
    });
    expect(undone.status).toBe(400);
    expect(undone.body.error).toMatch(/only available for --source previous/);
  });

  it("undoes only this session's accepts, restoring earlier local baselines", async () => {
    await start("results");
    await request(port, "/api/accept", {
      headers: headers(),
      body: { names: [B, NEW] },
    });
    const notAccepted = await request(port, "/api/drop", {
      headers: headers(),
      body: { names: [A] },
    });
    expect(notAccepted.status).toBe(400);
    expect(notAccepted.body.error).toMatch(/accepted in this session/);

    const undone = await request(port, "/api/drop", {
      headers: headers(),
      body: { names: [B, NEW] },
    });
    expect(undone.status).toBe(200);
    expect(undone.body).toMatchObject({
      dropped: [NEW],
      restored: [B],
      store: { active: 2 },
    });
    expect(Object.keys(readManifest(localPaths).entries)).toEqual([A, B]);
    expect(fs.readFileSync(path.join(localPaths.storeDir, B))).toEqual(
      fakePng(10, 10, 0)
    );
    // Undone once; a second undo of the same names is refused.
    const again = await request(port, "/api/drop", {
      headers: headers(),
      body: { names: [NEW] },
    });
    expect(again.status).toBe(400);
  });

  it("refuses to accept once the code has changed since the run", async () => {
    await start("results");
    fs.writeFileSync(path.join(repo, "src", "app.ts"), "changed");
    const res = await request(port, "/api/accept", {
      headers: headers(),
      body: { names: [A] },
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Uncommitted changes/);
    expect(readPreviousBatch(localPaths)).toBeUndefined();
  });

  it("disables actions in the page when there is no run marker", async () => {
    fs.rmSync(path.join(results, ".visual-run.json"));
    const { manifest } = await start("results");
    expect(manifest.actions?.disabledReason).toMatch(/No run marker/);
  });

  it("undoes the last update and drops local baselines in previous mode", async () => {
    await start("results");
    await request(port, "/api/accept", {
      headers: headers(),
      body: { names: [A, B, NEW] },
    });
    server?.close();

    const { manifest } = await start("previous");
    expect(manifest.actions).toEqual({ mode: "previous" });
    expect(manifest.items.map((i) => i.snapshotName).sort()).toEqual(
      [A, B, NEW].sort()
    );
    expect(manifest.items.every((i) => i.acceptedAt !== undefined)).toBe(true);

    const accept = await request(port, "/api/accept", {
      headers: headers(),
      body: { names: [B] },
    });
    expect(accept.status).toBe(400);

    const foreign = await request(port, "/api/drop", {
      headers: headers(),
      body: { names: ["other-js-light-chromium-linux.png"] },
    });
    expect(foreign.status).toBe(400);
    const noToken = await request(port, "/api/drop", {
      headers: headers({ "X-Visual-Diff-Token": "" }),
      body: { names: [NEW] },
    });
    expect(noToken.status).toBe(403);

    // Drop a single local baseline in previous mode.
    const dropped = await request(port, "/api/drop", {
      headers: headers(),
      body: { names: [B] },
    });
    expect(dropped.status).toBe(200);
    expect(dropped.body).toMatchObject({
      dropped: [B],
      restored: [],
      store: { active: 2 },
    });

    // Undo the last update: restores A & B, drops NEW, clears previousDir.
    const undone = await request(port, "/api/undo", {
      headers: headers(),
      body: { names: [A] },
    });
    expect(undone.status).toBe(200);
    expect(undone.body).toMatchObject({
      dropped: [NEW],
      restored: [A, B],
      store: { active: 2 },
    });
    expect(fs.readFileSync(path.join(localPaths.storeDir, A))).toEqual(
      fakePng(10, 10, 0)
    );
    expect(fs.existsSync(path.join(localPaths.storeDir, NEW))).toBe(false);
    expect(readPreviousBatch(localPaths)).toBeUndefined();
  });

  it("lists the reported names for accept --from-report", async () => {
    const outDir = path.join(repo, ".cache", "visual-diff");
    await runVisualDiffInspector({
      source: "results",
      resultsDir: results,
      localPaths,
      outDir,
      startServer: false,
      repoRoot: repo,
    });
    expect(namesFromReport(outDir, results)).toEqual([A, B, NEW].sort());

    // A newer run makes the report out of date.
    writeRunMarker(
      results,
      computeTreeState(repo),
      new Date(Date.now() + 1000)
    );
    expect(() => namesFromReport(outDir, results)).toThrow(
      /doesn't belong to the run/
    );
  });
});
