import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  type BaselinePaths,
  acceptFromEffective,
  checkpoint,
  drop,
  gitBlobId,
  materializeEffective,
  readManifest,
  resolutionSummary,
  resolveLocal,
  statusReport,
} from "@/scripts/visual_diff/local_baselines";
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
