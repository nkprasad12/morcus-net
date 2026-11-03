import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  AcceptRefusedError,
  type BaselinePaths,
  acceptFromActuals,
  drop,
  readManifest,
  readPreviousBatch,
  recordUpdateFromSnapshot,
  resolutionSummary,
  resolveLocal,
  restoreEntry,
  saveEntry,
  snapshotBeforeUpdate,
  statusReport,
  storeSummary,
  undoLastUpdate,
} from "@/scripts/visual_diff/local_baselines";
import {
  RUN_MARKER_FILE,
  checkRunMarker,
  computeTreeState,
  readRunMarker,
  writeRunMarker,
} from "@/scripts/visual_diff/run_marker";
import { collectPreviousEntries } from "@/scripts/visual_diff/visual_diff";

/** Distinct fake PNG content; the store never decodes images. */
function png(tag: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(tag),
  ]);
}

let root: string;
let paths: BaselinePaths;

function write(dir: string, name: string, content: Buffer) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content);
}

function read(dir: string, name: string): Buffer {
  return fs.readFileSync(path.join(dir, name));
}

/** Simulates Playwright's `--update-snapshots` writing into the local store. */
function playwrightWrites(name: string, content: Buffer) {
  write(paths.storeDir, name, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "local-baselines-test-"));
  paths = {
    storeDir: path.join(root, ".visual-baselines", "local"),
    previousDir: path.join(root, ".visual-baselines", "previous"),
  };
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("snapshotBeforeUpdate and recordUpdateFromSnapshot", () => {
  it("records new baselines and creates a previous backup", () => {
    const before = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("new.png", png("n1"));

    const result = recordUpdateFromSnapshot(
      paths,
      before,
      new Date("2026-01-02T03:04:05Z")
    );

    expect(result).toEqual({
      added: ["a.png", "new.png"],
      updated: [],
      unchanged: [],
    });
    expect(read(paths.storeDir, "a.png")).toEqual(png("a1"));
    const manifest = readManifest(paths);
    expect(manifest.entries["a.png"]).toMatchObject({
      acceptedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(readPreviousBatch(paths)).toEqual({
      version: 1,
      updatedAt: "2026-01-02T03:04:05.000Z",
      added: ["a.png", "new.png"],
      updated: {},
    });
  });

  it("is a no-op when nothing changed", () => {
    const before1 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    recordUpdateFromSnapshot(paths, before1, new Date("2026-01-02T03:04:05Z"));
    const firstManifest = readManifest(paths);
    const firstBatch = readPreviousBatch(paths);

    const before2 = snapshotBeforeUpdate(paths);
    const result = recordUpdateFromSnapshot(paths, before2, new Date(0));
    expect(result).toEqual({ added: [], updated: [], unchanged: ["a.png"] });
    expect(readManifest(paths)).toEqual(firstManifest);
    expect(readPreviousBatch(paths)).toEqual(firstBatch);
  });

  it("updates an existing entry and backs up the old image to previousDir", () => {
    const before1 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    recordUpdateFromSnapshot(paths, before1, new Date("2026-01-01T00:00:00Z"));
    const prevEntry = readManifest(paths).entries["a.png"];

    const before2 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a2"));
    const result = recordUpdateFromSnapshot(
      paths,
      before2,
      new Date("2026-02-01T00:00:00Z")
    );

    expect(result).toEqual({
      added: [],
      updated: ["a.png"],
      unchanged: [],
    });
    expect(read(paths.storeDir, "a.png")).toEqual(png("a2"));
    expect(read(paths.previousDir, "a.png")).toEqual(png("a1"));
    expect(readPreviousBatch(paths)).toEqual({
      version: 1,
      updatedAt: "2026-02-01T00:00:00.000Z",
      added: [],
      updated: { "a.png": prevEntry },
    });
  });

  it("ignores legacy checkpointBlob fields in manifest.json", () => {
    fs.mkdirSync(paths.storeDir, { recursive: true });
    fs.writeFileSync(
      path.join(paths.storeDir, "manifest.json"),
      JSON.stringify({
        version: 1,
        entries: {
          "a.png": {
            sha256: "abc",
            acceptedAt: "2026-01-01T00:00:00.000Z",
            checkpointBlob: "deadbeef",
          },
        },
      })
    );
    const manifest = readManifest(paths);
    expect(manifest.entries["a.png"]).toEqual({
      sha256: "abc",
      acceptedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("resolveLocal", () => {
  beforeEach(() => {
    const before = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("new.png", png("n1"));
    recordUpdateFromSnapshot(paths, before, new Date("2026-01-01T00:00:00Z"));
  });

  it("reports manifest entries without a PNG as missing", () => {
    fs.rmSync(path.join(paths.storeDir, "a.png"));
    expect(resolveLocal(paths)).toEqual({
      valid: ["new.png"],
      missing: ["a.png"],
    });
  });

  it("summarizes the resolution", () => {
    fs.rmSync(path.join(paths.storeDir, "a.png"));
    expect(resolutionSummary(resolveLocal(paths))).toBe(
      "1 local baseline(s) active, 1 missing"
    );
    expect(resolutionSummary({ valid: [], missing: [] })).toBeUndefined();
  });

  it("lists entries and previous backup in the status report", () => {
    fs.rmSync(path.join(paths.storeDir, "a.png"));
    const report = statusReport(paths);
    expect(report).toContain("1 active");
    expect(report).toContain("previous backup: 2 snapshot(s)");
    expect(report).toMatch(/Active[^\n]*:\n {2}new\.png {2}\[/);
    expect(report).toMatch(/Missing[^\n]*:\n {2}a\.png {2}\[/);
  });
});

describe("undoLastUpdate", () => {
  it("restores updated baselines, drops added ones, and clears previousDir", () => {
    const before1 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("b.png", png("b1"));
    recordUpdateFromSnapshot(paths, before1, new Date("2026-01-01T00:00:00Z"));
    const a1Entry = readManifest(paths).entries["a.png"];

    const before2 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a2"));
    playwrightWrites("new.png", png("n1"));
    recordUpdateFromSnapshot(paths, before2, new Date("2026-02-01T00:00:00Z"));

    const undone = undoLastUpdate(paths);
    expect(undone).toEqual({
      dropped: ["new.png"],
      restored: ["a.png"],
    });
    expect(read(paths.storeDir, "a.png")).toEqual(png("a1"));
    expect(read(paths.storeDir, "b.png")).toEqual(png("b1"));
    expect(fs.existsSync(path.join(paths.storeDir, "new.png"))).toBe(false);
    expect(readManifest(paths).entries["a.png"]).toEqual(a1Entry);
    expect(readManifest(paths).entries["new.png"]).toBeUndefined();
    expect(readPreviousBatch(paths)).toBeUndefined();
  });

  it("throws when there is no previous backup", () => {
    expect(() => undoLastUpdate(paths)).toThrow(/No previous baseline update/);
  });
});

describe("drop", () => {
  beforeEach(() => {
    const before = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("b.png", png("b1"));
    recordUpdateFromSnapshot(paths, before);
  });

  it("drops named entries", () => {
    expect(drop(paths, { names: ["a.png"] })).toEqual(["a.png"]);
    expect(Object.keys(readManifest(paths).entries)).toEqual(["b.png"]);
    expect(fs.existsSync(path.join(paths.storeDir, "a.png"))).toBe(false);
  });

  it("drops everything", () => {
    expect(drop(paths, { all: true })).toEqual(["a.png", "b.png"]);
    expect(readManifest(paths).entries).toEqual({});
  });

  it("rejects unknown names", () => {
    expect(() => drop(paths, { names: ["nope.png"] })).toThrow(/nope\.png/);
  });
});

describe("collectPreviousEntries", () => {
  it("compares local entries against the previous backup", () => {
    const before1 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a0"));
    playwrightWrites("b.png", png("b0"));
    recordUpdateFromSnapshot(paths, before1);

    const before2 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("new.png", png("n1"));
    recordUpdateFromSnapshot(paths, before2);

    const entries = collectPreviousEntries(paths);

    expect(entries.map((e) => ({ name: e.name, status: e.status }))).toEqual([
      { name: "a.png", status: "modified" },
      { name: "new.png", status: "added" },
    ]);
    const dest = path.join(root, "before.png");
    entries[0].writeBefore?.(dest);
    expect(fs.readFileSync(dest)).toEqual(png("a0"));
    expect(entries[0].afterPath).toBe(path.join(paths.storeDir, "a.png"));
    expect(entries[1].writeBefore).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Accepting from Playwright's actuals
// ---------------------------------------------------------------------------

const A = "a-js-light-chromium-linux.png";
const NEW = "n-js-dark-MobileSafari-linux.png";

/** Simulates a failed comparison: Playwright's files in `test-results/`. */
function playwrightFails(
  resultsDir: string,
  stem: string,
  project: string,
  actual: Buffer,
  expected?: Buffer
) {
  const dir = path.join(
    resultsDir,
    `screenshot-browser_screens-1a2b3-${stem}--${project}`
  );
  write(dir, `${stem}-actual.png`, actual);
  if (expected !== undefined) write(dir, `${stem}-expected.png`, expected);
}

describe("acceptFromActuals", () => {
  let results: string;
  const accept = (names: string[], now?: Date) =>
    acceptFromActuals(paths, results, names, {
      force: true,
      platform: "linux",
      now,
    });

  beforeEach(() => {
    results = path.join(root, "test-results");
  });

  it("adds new snapshots and backs up overwritten ones to previousDir", () => {
    const before = snapshotBeforeUpdate(paths);
    playwrightWrites(A, png("a0"));
    recordUpdateFromSnapshot(paths, before, new Date("2026-01-01T00:00:00Z"));

    playwrightFails(results, "a-js-light", "chromium", png("a1"), png("a0"));
    playwrightFails(results, "n-js-dark", "MobileSafari", png("n1"));

    const result = accept([A, NEW], new Date("2026-01-02T03:04:05Z"));

    expect(result).toEqual({
      added: [NEW],
      updated: [A],
      unchanged: [],
    });
    expect(read(paths.storeDir, A)).toEqual(png("a1"));
    expect(read(paths.storeDir, NEW)).toEqual(png("n1"));
    expect(read(paths.previousDir, A)).toEqual(png("a0"));
    const manifest = readManifest(paths);
    expect(manifest.entries[A]).toMatchObject({
      acceptedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(resolveLocal(paths).valid).toEqual([A, NEW]);
  });

  it("accepts only the named snapshots", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"), png("a0"));
    playwrightFails(results, "n-js-dark", "MobileSafari", png("n1"));

    expect(accept([NEW]).added).toEqual([NEW]);
    expect(Object.keys(readManifest(paths).entries)).toEqual([NEW]);
  });

  it("updates an existing local baseline", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    accept([A]);
    playwrightFails(results, "a-js-light", "chromium", png("a2"));

    expect(accept([A]).updated).toEqual([A]);
    expect(read(paths.storeDir, A)).toEqual(png("a2"));
    expect(read(paths.previousDir, A)).toEqual(png("a1"));
  });

  it("reports images that are already accepted as unchanged", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    accept([A]);
    const before = readManifest(paths);
    expect(accept([A], new Date(0)).unchanged).toEqual([A]);
    expect(readManifest(paths)).toEqual(before);
  });

  it("rejects names with no actual, and writes nothing", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    expect(() => accept([A, "nope-js-light-chromium-linux.png"])).toThrow(
      /nope-js-light-chromium-linux\.png/
    );
    // A baseline name for another platform doesn't match either.
    expect(() => accept(["a-js-light-chromium-darwin.png"])).toThrow(
      AcceptRefusedError
    );
    expect(readManifest(paths).entries).toEqual({});
  });

  it("refuses to accept without names", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    expect(() => accept([])).toThrow(/needs snapshot names/);
  });

  it("uses the latest retry", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    write(
      path.join(
        results,
        "screenshot-browser_screens-1a2b3-a-js-light--chromium-retry1"
      ),
      "a-js-light-actual.png",
      png("a-retry")
    );
    accept([A]);
    expect(read(paths.storeDir, A)).toEqual(png("a-retry"));
  });
});

// ---------------------------------------------------------------------------
// Run marker
// ---------------------------------------------------------------------------

describe("run marker guard", () => {
  let repo: string;
  let results: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });

  beforeEach(() => {
    repo = path.join(root, "repo");
    results = path.join(repo, "test-results");
    fs.mkdirSync(repo);
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    fs.writeFileSync(
      path.join(repo, ".gitignore"),
      "/test-results/\n/.visual-baselines/\n"
    );
    write(path.join(repo, "src"), "app.ts", Buffer.from("v1"));
    write(repo, "README.md", Buffer.from("readme"));
    git("add", ".");
    git("commit", "-q", "-m", "init");
    // Paths inside the repo, like the real layout.
    paths = {
      storeDir: path.join(repo, ".visual-baselines", "local"),
      previousDir: path.join(repo, ".visual-baselines", "previous"),
    };
    playwrightFails(results, "a-js-light", "chromium", png("a1"), png("a0"));
  });

  const markRun = () =>
    writeRunMarker(
      results,
      computeTreeState(repo),
      new Date("2026-01-02T03:04:05Z")
    );
  const accept = (force = false) =>
    acceptFromActuals(paths, results, [A], {
      repoRoot: repo,
      platform: "linux",
      force,
    });

  it("accepts when the code is unchanged since the run", () => {
    markRun();
    expect(checkRunMarker(results, repo).ok).toBe(true);
    expect(accept().added).toEqual([A]);
  });

  it("refuses without a marker, unless forced", () => {
    const check = checkRunMarker(results, repo);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toMatch(/No run marker/);
    expect(() => accept()).toThrow(AcceptRefusedError);
    expect(() => accept()).toThrow(/No run marker/);
    expect(readManifest(paths).entries).toEqual({});
    expect(accept(true).added).toEqual([A]);
  });

  it("refuses after an uncommitted change under src/", () => {
    markRun();
    write(path.join(repo, "src"), "app.ts", Buffer.from("v2"));
    expect(() => accept()).toThrow(/Uncommitted changes/);
    expect(accept(true).added).toEqual([A]);
  });

  it("refuses after a new untracked file under src/", () => {
    markRun();
    write(path.join(repo, "src"), "new.ts", Buffer.from("new"));
    expect(() => accept()).toThrow(/Uncommitted changes/);
  });

  it("refuses after HEAD moves", () => {
    markRun();
    write(repo, "README.md", Buffer.from("readme 2"));
    git("commit", "-q", "-am", "next");
    expect(() => accept()).toThrow(/HEAD moved/);
  });

  it("refuses if the code changed during the run", () => {
    const start = computeTreeState(repo);
    write(path.join(repo, "src"), "app.ts", Buffer.from("v2"));
    writeRunMarker(results, start, new Date(), computeTreeState(repo));
    write(path.join(repo, "src"), "app.ts", Buffer.from("v1"));
    expect(readRunMarker(results)?.changedDuringRun).toBe(true);
    expect(() => accept()).toThrow(/changed while the run/);
  });

  it("ignores changes outside src/, and staging", () => {
    write(path.join(repo, "src"), "app.ts", Buffer.from("dirty"));
    markRun();
    write(repo, "README.md", Buffer.from("edited docs"));
    git("add", "src/app.ts");
    expect(checkRunMarker(results, repo).ok).toBe(true);
  });

  it("treats a malformed marker as missing", () => {
    write(results, RUN_MARKER_FILE, Buffer.from("{not json"));
    expect(readRunMarker(results)).toBeUndefined();
    expect(() => accept()).toThrow(/No run marker/);
  });
});

// ---------------------------------------------------------------------------
// Store hints and undo support
// ---------------------------------------------------------------------------

describe("store hints", () => {
  beforeEach(() => {
    const before1 = snapshotBeforeUpdate(paths);
    playwrightWrites("a.png", png("a1"));
    recordUpdateFromSnapshot(paths, before1, new Date("2026-01-01T00:00:00Z"));
    const before2 = snapshotBeforeUpdate(paths);
    playwrightWrites("b.png", png("b1"));
    recordUpdateFromSnapshot(paths, before2, new Date("2026-02-01T00:00:00Z"));
  });

  it("summarizes count, size, oldest and previous backup", () => {
    expect(storeSummary(paths)).toEqual({
      active: 2,
      bytes: png("a1").length + png("b1").length,
      oldestAcceptedAt: "2026-01-01T00:00:00.000Z",
      previousCount: 1,
      previousUpdatedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("shows the oldest entry and previous backup in status", () => {
    const report = statusReport(paths);
    expect(report).toContain("oldest accepted 2026-01-01T00:00:00.000Z");
    expect(report).toContain(
      "previous backup: 1 snapshot(s) from 2026-02-01T00:00:00.000Z"
    );
  });

  it("saves and restores an entry", () => {
    const saved = saveEntry(paths, "a.png");
    expect(saved?.png).toEqual(png("a1"));
    expect(saveEntry(paths, "nope.png")).toBeNull();
    drop(paths, { names: ["a.png"] });
    restoreEntry(paths, "a.png", saved!);
    expect(read(paths.storeDir, "a.png")).toEqual(png("a1"));
    expect(readManifest(paths).entries["a.png"]).toEqual(saved?.entry);
    expect(resolveLocal(paths).valid).toEqual(["a.png", "b.png"]);
  });
});
