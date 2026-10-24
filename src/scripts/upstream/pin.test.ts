import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { pinTag, type UpstreamLock } from "@/scripts/upstream/lock";
import {
  CONFIRM_ABOVE_COMMITS,
  pinSources,
  tagPins,
  type PinOptions,
} from "@/scripts/upstream/pin";
import {
  cloneInto,
  commit,
  makeSandbox,
  sh,
  type Sandbox,
} from "@/scripts/upstream/test_helpers";

describe("pinSources", () => {
  let sandbox: Sandbox;
  let lockDir: string;
  let lockPath: string;
  let clone: string;
  let options: PinOptions;
  let logSpy: jest.SpyInstance;

  function writeLock(commitSha: string): void {
    const lock: UpstreamLock = {
      sources: {
        foo: {
          repo: sandbox.remote,
          branch: "main",
          commit: commitSha,
          env: "FOO",
          file: "data.txt",
        },
      },
    };
    writeFileSync(lockPath, JSON.stringify(lock));
  }

  function pinned(): string {
    return JSON.parse(readFileSync(lockPath, "utf8")).sources.foo.commit;
  }

  function remoteTags(): string {
    return sh(sandbox.upstream, "ls-remote", "--tags", "origin");
  }

  /** Pushes a branch with one commit off `from` to the remote. */
  function pushBranch(
    name: string,
    from: string,
    files: Record<string, string>
  ): string {
    sh(clone, "checkout", "-q", "-b", name, from);
    const sha = commit(clone, name, files);
    sh(clone, "push", "-q", "origin", name);
    return sha;
  }

  beforeEach(() => {
    sandbox = makeSandbox();
    lockDir = mkdtempSync(path.join(tmpdir(), "upstream-lock-"));
    lockPath = path.join(lockDir, "lock.json");
    writeLock(sandbox.base);
    clone = cloneInto(sandbox, "foo");
    options = {
      lockPath,
      env: {},
      morcusDir: sandbox.morcusDir,
      confirm: () => Promise.resolve(false),
    };
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(lockDir, { recursive: true, force: true });
    sandbox.cleanup();
  });

  it("pins a pushed fix branch, tags it, and updates the lock", async () => {
    const fix = pushBranch("fix", sandbox.base, { "data.txt": "fixed" });
    expect(await pinSources([{ name: "foo", ref: "fix" }], options)).toBe(true);
    expect(pinned()).toBe(fix);
    expect(remoteTags()).toContain(`refs/tags/${pinTag(fix)}`);
  });

  it("pins the tracked branch by default", async () => {
    const newer = commit(sandbox.upstream, "newer", { "x.txt": "x" });
    sh(sandbox.upstream, "push", "-q", "origin", "main");
    expect(await pinSources([{ name: "foo" }], options)).toBe(true);
    expect(pinned()).toBe(newer);
  });

  it("uses the remote branch when the local one is stale", async () => {
    // The local `main` is still at base; the remote moved on.
    const newer = commit(sandbox.upstream, "newer", { "x.txt": "x" });
    sh(sandbox.upstream, "push", "-q", "origin", "main");
    expect(await pinSources([{ name: "foo", ref: "main" }], options)).toBe(
      true
    );
    expect(pinned()).toBe(newer);
  });

  it("warns when it picks the remote branch over a local one behind it", async () => {
    const fix = pushBranch("fix", sandbox.base, { "data.txt": "fixed" });
    // The local branch was reset back, but not force-pushed.
    sh(clone, "reset", "-q", "--hard", sandbox.base);
    expect(await pinSources([{ name: "foo", ref: "fix" }], options)).toBe(true);
    expect(pinned()).toBe(fix);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain(`used 'origin/fix'`);
    expect(output).toContain("1 behind");
  });

  it("refuses a commit only on a branch deleted from the remote", async () => {
    pushBranch("gone", sandbox.base, { "data.txt": "gone" });
    // Deleted on the remote; the clone still has `origin/gone` until a prune.
    sh(sandbox.upstream, "push", "-q", "origin", "--delete", "gone");
    sh(clone, "checkout", "-q", "main");
    sh(clone, "branch", "-q", "-D", "gone");
    expect(
      await pinSources([{ name: "foo", ref: "origin/gone" }], options)
    ).toBe(false);
    expect(pinned()).toBe(sandbox.base);
  });

  it("lists replaced commits on a rollback", async () => {
    const fix = pushBranch("fix", sandbox.base, { "data.txt": "fixed" });
    writeLock(fix);
    const allowDrop = { ...options, allowDrop: true };
    expect(await pinSources([{ name: "foo", ref: "main" }], allowDrop)).toBe(
      true
    );
    expect(pinned()).toBe(sandbox.base);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("+0 / -1 commits");
    expect(output).toMatch(/- [0-9a-f]+ fix/);
  });

  it("refuses a commit that isn't on the remote", async () => {
    sh(clone, "checkout", "-q", "-b", "local-only");
    commit(clone, "unpushed", { "data.txt": "local" });
    expect(
      await pinSources([{ name: "foo", ref: "local-only" }], options)
    ).toBe(false);
    expect(pinned()).toBe(sandbox.base);
  });

  it("refuses to drop the current pin's fix unless told to", async () => {
    const fixA = pushBranch("fix-a", sandbox.base, { "data.txt": "A\nb\nc\n" });
    const fixB = pushBranch("fix-b", sandbox.base, { "data.txt": "a\nb\nC\n" });
    writeLock(fixA);
    sh(clone, "push", "-q", "origin", `${fixA}:refs/tags/${pinTag(fixA)}`);

    expect(await pinSources([{ name: "foo", ref: "fix-b" }], options)).toBe(
      false
    );
    expect(pinned()).toBe(fixA);

    const allowDrop = { ...options, allowDrop: true };
    expect(await pinSources([{ name: "foo", ref: "fix-b" }], allowDrop)).toBe(
      true
    );
    expect(pinned()).toBe(fixB);
  });

  it("accepts a squash-merged version of the current pin", async () => {
    const fix = pushBranch("fix", sandbox.base, { "data.txt": "fixed" });
    writeLock(fix);
    // Upstream squash-merges the fix.
    sh(sandbox.upstream, "fetch", "-q", "origin", "fix");
    sh(sandbox.upstream, "merge", "-q", "--squash", "FETCH_HEAD");
    sh(sandbox.upstream, "commit", "-q", "-m", "squashed");
    sh(sandbox.upstream, "push", "-q", "origin", "main");
    expect(await pinSources([{ name: "foo", ref: "main" }], options)).toBe(
      true
    );
    expect(pinned()).toBe(sh(sandbox.upstream, "rev-parse", "HEAD"));
  });

  it("asks before pinning many new commits", async () => {
    sh(clone, "checkout", "-q", "-b", "big");
    for (let i = 0; i <= CONFIRM_ABOVE_COMMITS; i++) {
      commit(clone, `commit ${i}`, { "data.txt": `${i}` });
    }
    sh(clone, "push", "-q", "origin", "big");
    const big = sh(clone, "rev-parse", "HEAD");

    expect(await pinSources([{ name: "foo", ref: "big" }], options)).toBe(
      false
    );
    expect(pinned()).toBe(sandbox.base);

    const yes = { ...options, confirm: () => Promise.resolve(true) };
    expect(await pinSources([{ name: "foo", ref: "big" }], yes)).toBe(true);
    expect(pinned()).toBe(big);
  });

  it("changes nothing in a dry run", async () => {
    const fix = pushBranch("fix", sandbox.base, { "data.txt": "fixed" });
    const dryRun = { ...options, dryRun: true };
    expect(await pinSources([{ name: "foo", ref: "fix" }], dryRun)).toBe(true);
    expect(pinned()).toBe(sandbox.base);
    expect(remoteTags()).not.toContain(pinTag(fix));
  });

  it("changes nothing if any source fails", async () => {
    pushBranch("fix", sandbox.base, { "data.txt": "fixed" });
    const requests = [{ name: "foo", ref: "fix" }, { name: "nope" }];
    expect(await pinSources(requests, options)).toBe(false);
    expect(pinned()).toBe(sandbox.base);
  });

  it("tags existing pins", () => {
    expect(tagPins([], options)).toBe(true);
    expect(remoteTags()).toContain(pinTag(sandbox.base));
    // Already tagged: still fine.
    expect(tagPins(["foo"], options)).toBe(true);
  });
});
