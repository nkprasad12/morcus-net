import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  AcceptRefusedError,
  type BaselinePaths,
  acceptFromActuals,
  acceptFromEffective,
  checkpoint,
  drop,
  gitBlobId,
  materializeEffective,
  readManifest,
  resolutionSummary,
  resolveLocal,
  restoreEntry,
  saveEntry,
  staleHint,
  statusReport,
  storeSummary,
} from "@/scripts/visual_diff/local_baselines";
import {
  RUN_MARKER_FILE,
  checkRunMarker,
  computeTreeState,
  readRunMarker,
  writeRunMarker,
} from "@/scripts/visual_diff/run_marker";
import { collectLocalEntries } from "@/scripts/visual_diff/visual_diff";

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

/** Simulates Playwright's `--update-snapshots` writing into the effective dir. */
function playwrightWrites(name: string, content: Buffer) {
  write(paths.effectiveDir, name, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "local-baselines-test-"));
  paths = {
    snapshotDir: path.join(root, "snaps"),
    storeDir: path.join(root, ".visual-baselines", "local"),
    effectiveDir: path.join(root, ".cache", "effective"),
  };
  write(paths.snapshotDir, "a.png", png("a0"));
  write(paths.snapshotDir, "b.png", png("b0"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("gitBlobId", () => {
  it("matches git hash-object", () => {
    const file = path.join(root, "x.bin");
    fs.writeFileSync(file, png("hello"));
    const expected = execFileSync("git", ["hash-object", file], {
      encoding: "utf-8",
    }).trim();
    expect(gitBlobId(png("hello"))).toBe(expected);
  });
});

describe("materializeEffective", () => {
  it("copies the checkpoint when there is no local store", () => {
    const r = materializeEffective(paths);
    expect(r).toEqual({ valid: [], stale: [], missing: [] });
    expect(fs.readdirSync(paths.effectiveDir).sort()).toEqual([
      "a.png",
      "b.png",
    ]);
    expect(read(paths.effectiveDir, "a.png")).toEqual(png("a0"));
  });

  it("clears leftovers from a previous run", () => {
    write(paths.effectiveDir, "old.png", png("old"));
    materializeEffective(paths);
    expect(fs.existsSync(path.join(paths.effectiveDir, "old.png"))).toBe(false);
  });

  it("does not write through to the checkpoint", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    expect(read(paths.snapshotDir, "a.png")).toEqual(png("a0"));
  });
});

describe("acceptFromEffective", () => {
  it("stores changed and new images, and leaves the checkpoint alone", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("new.png", png("n1"));

    const result = acceptFromEffective(paths, new Date("2026-01-02T03:04:05Z"));

    expect(result).toEqual({
      added: ["a.png", "new.png"],
      updated: [],
      reverted: [],
    });
    expect(read(paths.storeDir, "a.png")).toEqual(png("a1"));
    expect(read(paths.snapshotDir, "a.png")).toEqual(png("a0"));
    expect(fs.existsSync(path.join(paths.storeDir, "b.png"))).toBe(false);
    const manifest = readManifest(paths);
    expect(manifest.entries["a.png"]).toMatchObject({
      acceptedAt: "2026-01-02T03:04:05.000Z",
      checkpointBlob: gitBlobId(png("a0")),
    });
    expect(manifest.entries["new.png"].checkpointBlob).toBeNull();
  });

  it("overlays valid local entries on the next run", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    acceptFromEffective(paths);

    const r = materializeEffective(paths);
    expect(r.valid).toEqual(["a.png"]);
    expect(read(paths.effectiveDir, "a.png")).toEqual(png("a1"));
    expect(read(paths.effectiveDir, "b.png")).toEqual(png("b0"));
  });

  it("is a no-op when nothing changed", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    acceptFromEffective(paths);
    const first = readManifest(paths);

    materializeEffective(paths);
    const result = acceptFromEffective(paths, new Date(0));
    expect(result).toEqual({ added: [], updated: [], reverted: [] });
    expect(readManifest(paths)).toEqual(first);
  });

  it("updates an existing entry with a newer image", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    acceptFromEffective(paths);

    materializeEffective(paths);
    playwrightWrites("a.png", png("a2"));
    expect(acceptFromEffective(paths).updated).toEqual(["a.png"]);
    expect(read(paths.storeDir, "a.png")).toEqual(png("a2"));
  });

  it("removes an entry whose image went back to the checkpoint", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    acceptFromEffective(paths);

    materializeEffective(paths);
    playwrightWrites("a.png", png("a0"));
    expect(acceptFromEffective(paths).reverted).toEqual(["a.png"]);
    expect(readManifest(paths).entries).toEqual({});
    expect(fs.existsSync(path.join(paths.storeDir, "a.png"))).toBe(false);
  });

  it("keeps stale entries that this run did not touch", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    acceptFromEffective(paths);
    write(paths.snapshotDir, "a.png", png("a-upstream"));

    materializeEffective(paths);
    expect(acceptFromEffective(paths)).toEqual({
      added: [],
      updated: [],
      reverted: [],
    });
    expect(resolveLocal(paths).stale).toEqual(["a.png"]);
  });

  it("replaces a stale entry when the run produces a new image", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    acceptFromEffective(paths);
    write(paths.snapshotDir, "a.png", png("a-upstream"));

    materializeEffective(paths);
    playwrightWrites("a.png", png("a2"));
    expect(acceptFromEffective(paths).updated).toEqual(["a.png"]);
    expect(resolveLocal(paths).valid).toEqual(["a.png"]);
    expect(readManifest(paths).entries["a.png"].checkpointBlob).toBe(
      gitBlobId(png("a-upstream"))
    );
  });
});

describe("resolveLocal", () => {
  beforeEach(() => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("new.png", png("n1"));
    acceptFromEffective(paths);
  });

  it("marks an entry stale once its checkpoint changes", () => {
    write(paths.snapshotDir, "a.png", png("a-upstream"));
    const r = materializeEffective(paths);
    expect(r).toEqual({ valid: ["new.png"], stale: ["a.png"], missing: [] });
    expect(read(paths.effectiveDir, "a.png")).toEqual(png("a-upstream"));
  });

  it("marks a new-scenario entry stale once a checkpoint appears", () => {
    write(paths.snapshotDir, "new.png", png("n-upstream"));
    expect(resolveLocal(paths).stale).toEqual(["new.png"]);
  });

  it("marks an override stale when the checkpoint file is deleted", () => {
    fs.rmSync(path.join(paths.snapshotDir, "a.png"));
    expect(resolveLocal(paths).stale).toEqual(["a.png"]);
  });

  it("reports manifest entries without a PNG as missing", () => {
    fs.rmSync(path.join(paths.storeDir, "a.png"));
    expect(resolveLocal(paths).missing).toEqual(["a.png"]);
  });

  it("summarizes the resolution", () => {
    write(paths.snapshotDir, "a.png", png("a-upstream"));
    expect(resolutionSummary(resolveLocal(paths))).toMatch(
      /^1 local baseline\(s\) active, 1 stale/
    );
    expect(
      resolutionSummary({ valid: [], stale: [], missing: [] })
    ).toBeUndefined();
  });

  it("lists entries in the status report", () => {
    write(paths.snapshotDir, "a.png", png("a-upstream"));
    const report = statusReport(paths);
    expect(report).toContain("1 active, 1 stale");
    expect(report).toMatch(/Active[^\n]*:\n {2}new\.png {2}\[new,/);
    expect(report).toMatch(/Stale[^\n]*:\n {2}a\.png {2}\[override,/);
  });
});

describe("checkpoint", () => {
  beforeEach(() => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("b.png", png("b1"));
    playwrightWrites("new.png", png("n1"));
    acceptFromEffective(paths);
  });

  it("promotes every valid entry and empties the store", () => {
    const result = checkpoint(paths);
    expect(result).toEqual({
      promoted: ["a.png", "b.png", "new.png"],
      skippedStale: [],
    });
    expect(read(paths.snapshotDir, "a.png")).toEqual(png("a1"));
    expect(read(paths.snapshotDir, "new.png")).toEqual(png("n1"));
    expect(readManifest(paths).entries).toEqual({});
    expect(materializeEffective(paths).valid).toEqual([]);
  });

  it("promotes only the named entries", () => {
    expect(checkpoint(paths, ["b.png"]).promoted).toEqual(["b.png"]);
    expect(read(paths.snapshotDir, "a.png")).toEqual(png("a0"));
    expect(Object.keys(readManifest(paths).entries)).toEqual([
      "a.png",
      "new.png",
    ]);
  });

  it("skips stale entries", () => {
    write(paths.snapshotDir, "a.png", png("a-upstream"));
    const result = checkpoint(paths);
    expect(result.skippedStale).toEqual(["a.png"]);
    expect(read(paths.snapshotDir, "a.png")).toEqual(png("a-upstream"));
    expect(Object.keys(readManifest(paths).entries)).toEqual(["a.png"]);
  });

  it("rejects unknown names", () => {
    expect(() => checkpoint(paths, ["nope.png"])).toThrow(/nope\.png/);
  });
});

describe("drop", () => {
  beforeEach(() => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("b.png", png("b1"));
    acceptFromEffective(paths);
  });

  it("drops named entries", () => {
    expect(drop(paths, { names: ["a.png"] })).toEqual(["a.png"]);
    expect(Object.keys(readManifest(paths).entries)).toEqual(["b.png"]);
    expect(fs.existsSync(path.join(paths.storeDir, "a.png"))).toBe(false);
  });

  it("drops stale and missing entries", () => {
    write(paths.snapshotDir, "a.png", png("a-upstream"));
    expect(drop(paths, { stale: true })).toEqual(["a.png"]);
    expect(Object.keys(readManifest(paths).entries)).toEqual(["b.png"]);
  });

  it("drops everything", () => {
    expect(drop(paths, { all: true })).toEqual(["a.png", "b.png"]);
    expect(readManifest(paths).entries).toEqual({});
  });

  it("rejects unknown names", () => {
    expect(() => drop(paths, { names: ["nope.png"] })).toThrow(/nope\.png/);
  });
});

describe("collectLocalEntries", () => {
  it("compares valid local entries against the checkpoint", () => {
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    playwrightWrites("b.png", png("b1"));
    playwrightWrites("new.png", png("n1"));
    acceptFromEffective(paths);
    write(paths.snapshotDir, "b.png", png("b-upstream"));

    const { entries, stale } = collectLocalEntries(paths);

    expect(stale).toEqual(["b.png"]);
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
    write(paths.snapshotDir, A, png("a0"));
  });

  it("adds changed and new snapshots, and leaves the checkpoint alone", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"), png("a0"));
    playwrightFails(results, "n-js-dark", "MobileSafari", png("n1"));

    const result = accept([A, NEW], new Date("2026-01-02T03:04:05Z"));

    expect(result).toEqual({
      added: [A, NEW],
      updated: [],
      reverted: [],
      unchanged: [],
    });
    expect(read(paths.storeDir, A)).toEqual(png("a1"));
    expect(read(paths.storeDir, NEW)).toEqual(png("n1"));
    expect(read(paths.snapshotDir, A)).toEqual(png("a0"));
    const manifest = readManifest(paths);
    expect(manifest.entries[A]).toMatchObject({
      acceptedAt: "2026-01-02T03:04:05.000Z",
      checkpointBlob: gitBlobId(png("a0")),
    });
    expect(manifest.entries[NEW].checkpointBlob).toBeNull();
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
  });

  it("reverts to the checkpoint when the actual matches it", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    accept([A]);
    playwrightFails(results, "a-js-light", "chromium", png("a0"));

    expect(accept([A]).reverted).toEqual([A]);
    expect(readManifest(paths).entries).toEqual({});
    expect(fs.existsSync(path.join(paths.storeDir, A))).toBe(false);
  });

  it("reports images that are already accepted, or match the checkpoint, as unchanged", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    accept([A]);
    const before = readManifest(paths);
    expect(accept([A], new Date(0)).unchanged).toEqual([A]);
    expect(readManifest(paths)).toEqual(before);

    drop(paths, { all: true });
    playwrightFails(results, "a-js-light", "chromium", png("a0"));
    expect(accept([A]).unchanged).toEqual([A]);
    expect(readManifest(paths).entries).toEqual({});
  });

  it("replaces a stale entry", () => {
    playwrightFails(results, "a-js-light", "chromium", png("a1"));
    accept([A]);
    write(paths.snapshotDir, A, png("a-upstream"));
    expect(resolveLocal(paths).stale).toEqual([A]);

    expect(accept([A]).updated).toEqual([A]);
    expect(resolveLocal(paths).valid).toEqual([A]);
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
    fs.writeFileSync(path.join(repo, ".gitignore"), "/test-results/\n");
    write(path.join(repo, "src"), "app.ts", Buffer.from("v1"));
    write(repo, "README.md", Buffer.from("readme"));
    git("add", ".");
    git("commit", "-q", "-m", "init");
    // Paths inside the repo, like the real layout.
    paths = {
      snapshotDir: path.join(repo, "src", "snaps"),
      storeDir: path.join(repo, ".visual-baselines", "local"),
      effectiveDir: path.join(repo, ".cache", "effective"),
    };
    write(paths.snapshotDir, A, png("a0"));
    git("add", ".");
    git("commit", "-q", "-m", "snaps");
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
    materializeEffective(paths);
    playwrightWrites("a.png", png("a1"));
    acceptFromEffective(paths, new Date("2026-01-01T00:00:00Z"));
    materializeEffective(paths);
    playwrightWrites("b.png", png("b1"));
    acceptFromEffective(paths, new Date("2026-02-01T00:00:00Z"));
  });

  it("summarizes count, size, oldest and stale entries", () => {
    expect(storeSummary(paths)).toEqual({
      active: 2,
      stale: [],
      bytes: png("a1").length + png("b1").length,
      oldestAcceptedAt: "2026-01-01T00:00:00.000Z",
    });
    write(paths.snapshotDir, "a.png", png("a-upstream"));
    expect(storeSummary(paths)).toMatchObject({
      active: 1,
      stale: ["a.png"],
      oldestAcceptedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("shows the oldest entry, and a one-line stale warning, in status", () => {
    expect(statusReport(paths)).toContain(
      "2 not checkpointed · oldest accepted 2026-01-01T00:00:00.000Z"
    );
    expect(statusReport(paths)).not.toContain("no longer apply");
    write(paths.snapshotDir, "a.png", png("a-upstream"));
    expect(statusReport(paths)).toContain(
      "⚠ 1 stale: they no longer apply; `./morcus.sh visual-baselines drop --stale`"
    );
    expect(staleHint(0)).toBeUndefined();
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
