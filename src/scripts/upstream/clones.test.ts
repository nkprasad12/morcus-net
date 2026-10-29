import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  PINNED_BRANCH,
  cloneStatuses,
  decideSync,
  describeStatus,
  isAtPin,
  locateClone,
  syncClone,
  type SyncInputs,
} from "@/scripts/upstream/clones";
import type { UpstreamSource } from "@/scripts/upstream/lock";
import {
  cloneInto,
  commit,
  makeSandbox,
  sh,
  type Sandbox,
} from "@/scripts/upstream/test_helpers";

describe("decideSync", () => {
  const base: SyncInputs = {
    branch: "main",
    managedBranches: new Set([PINNED_BRANCH, "main"]),
    dirty: false,
    headIsPin: false,
    localOnlyInHead: 0,
    localOnlyInPinnedBranch: 0,
  };

  it("does nothing when already on the pinned branch at the pin", () => {
    const inputs = { ...base, branch: PINNED_BRANCH, headIsPin: true };
    expect(decideSync(inputs)).toEqual({ action: "none" });
  });

  it("moves clean clones on managed branches or detached HEADs", () => {
    expect(decideSync(base)).toEqual({ action: "move" });
    expect(decideSync({ ...base, branch: undefined })).toEqual({
      action: "move",
    });
    // At the pin, but not yet on the pinned branch.
    expect(decideSync({ ...base, headIsPin: true })).toEqual({
      action: "move",
    });
  });

  it("leaves anything that could lose local work", () => {
    const leaves = (inputs: Partial<SyncInputs>) =>
      decideSync({ ...base, ...inputs }).action === "leave";
    expect(leaves({ branch: "fix-typo" })).toBe(true);
    expect(leaves({ dirty: true })).toBe(true);
    expect(leaves({ localOnlyInHead: 1 })).toBe(true);
    expect(leaves({ localOnlyInPinnedBranch: 2 })).toBe(true);
  });
});

describe("clones", () => {
  let sandbox: Sandbox;
  let source: UpstreamSource;
  const env = (value?: string) => (value === undefined ? {} : { FOO: value });

  beforeEach(() => {
    sandbox = makeSandbox();
    source = {
      repo: sandbox.remote,
      branch: "main",
      commit: sandbox.base,
      env: "FOO",
      file: "data.txt",
    };
  });
  afterEach(() => sandbox.cleanup());

  describe("locateClone", () => {
    it("finds the default clone from its env var, or without one", () => {
      const dir = cloneInto(sandbox, "foo");
      const fromEnv = locateClone(
        "foo",
        source,
        env(path.join(dir, "data.txt")),
        sandbox.morcusDir
      );
      expect(fromEnv).toMatchObject({ kind: "clone", custom: false });
      const noEnv = locateClone("foo", source, env(), sandbox.morcusDir);
      expect(noEnv).toMatchObject({ kind: "clone", envUnset: true });
    });

    it("hints at a default clone that differs only in case", () => {
      const dir = cloneInto(sandbox, "Foo");
      const location = locateClone("foo", source, env(), sandbox.morcusDir);
      if (location.kind === "clone") {
        // Case-insensitive filesystem: the default path resolves anyway.
        return;
      }
      expect(location).toMatchObject({ kind: "missing", caseMismatch: dir });
    });

    it("flags clones elsewhere, files outside clones, and missing paths", () => {
      const elsewhere = cloneInto(sandbox, "elsewhere");
      expect(
        locateClone(
          "foo",
          source,
          env(path.join(elsewhere, "data.txt")),
          sandbox.morcusDir
        )
      ).toMatchObject({ kind: "clone", custom: true });

      const loose = path.join(sandbox.morcusDir, "data.txt");
      writeFileSync(loose, "downloaded");
      expect(
        locateClone("foo", source, env(loose), sandbox.morcusDir).kind
      ).toBe("not-a-clone");

      expect(
        locateClone("foo", source, env("/nope/data.txt"), sandbox.morcusDir)
          .kind
      ).toBe("missing");
    });

    it("finds the clone when the env var points at another file in it", () => {
      const dir = cloneInto(sandbox, "foo");
      const other = path.join(dir, "sub");
      mkdirSync(other);
      writeFileSync(path.join(other, "other.txt"), "x");
      expect(
        locateClone(
          "foo",
          source,
          env(path.join(other, "other.txt")),
          sandbox.morcusDir
        )
      ).toMatchObject({ kind: "clone", dir, custom: false });
    });

    it("doesn't match a file name that only ends the same way", () => {
      const dir = cloneInto(sandbox, "foo");
      writeFileSync(path.join(dir, "my-data.txt"), "x");
      // `my-data.txt` ends with `data.txt`, but isn't it.
      expect(
        locateClone(
          "foo",
          source,
          env(path.join(dir, "my-data.txt")),
          sandbox.morcusDir
        )
      ).toMatchObject({ kind: "clone", dir });
    });
  });

  describe("syncClone", () => {
    function sync() {
      return syncClone("foo", source, env(), sandbox.morcusDir);
    }

    it("moves a fresh clone to the pin, then leaves it", () => {
      const dir = cloneInto(sandbox, "foo");
      expect(sync().outcome).toBe("moved");
      expect(sh(dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe(PINNED_BRANCH);
      expect(sync().outcome).toBe("ok");
    });

    it("fetches a pin the clone doesn't have yet", () => {
      const dir = cloneInto(sandbox, "foo");
      expect(sync().outcome).toBe("moved");
      source.commit = commit(sandbox.upstream, "newer", { "data.txt": "new" });
      sh(sandbox.upstream, "push", "-q", "origin", "main");
      expect(sync().outcome).toBe("moved");
      expect(sh(dir, "rev-parse", "HEAD")).toBe(source.commit);
    });

    it("moves a clone that's just behind on the tracked branch", () => {
      const dir = cloneInto(sandbox, "foo");
      source.commit = commit(sandbox.upstream, "newer", { "data.txt": "new" });
      sh(sandbox.upstream, "push", "-q", "origin", "main");
      expect(sync().outcome).toBe("moved");
      // The tracked branch itself is untouched.
      expect(sh(dir, "rev-parse", "main")).toBe(sandbox.base);
    });

    it("never moves local work", () => {
      const dir = cloneInto(sandbox, "foo");
      sync();

      sh(dir, "checkout", "-q", "-b", "fix-typo");
      expect(sync()).toMatchObject({ outcome: "left" });
      expect(sync().message).toContain("fix-typo");

      sh(dir, "checkout", "-q", PINNED_BRANCH);
      const before = sh(dir, "rev-parse", "HEAD");
      source.commit = commit(sandbox.upstream, "newer", { "x.txt": "x" });
      sh(sandbox.upstream, "push", "-q", "origin", "main");
      writeFileSync(path.join(dir, "data.txt"), "edited");
      expect(sync().message).toContain("uncommitted");
      expect(sh(dir, "rev-parse", "HEAD")).toBe(before);
      sh(dir, "checkout", "-q", "--", "data.txt");

      const local = commit(dir, "oops, on the pinned branch", {
        "data.txt": "local",
      });
      expect(sync().message).toContain("only locally");
      expect(sh(dir, "rev-parse", "HEAD")).toBe(local);
    });

    it("doesn't manage clones at custom paths", () => {
      const elsewhere = cloneInto(sandbox, "elsewhere");
      const result = syncClone(
        "foo",
        source,
        env(path.join(elsewhere, "data.txt")),
        sandbox.morcusDir
      );
      expect(result.outcome).toBe("left");
      expect(sh(elsewhere, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    });
  });

  describe("status", () => {
    it("describes how each clone compares to its pin", () => {
      const dir = cloneInto(sandbox, "foo");
      const lock = { sources: { foo: source } };
      const status = () => cloneStatuses(lock, env(), sandbox.morcusDir)[0];
      expect(isAtPin(status())).toBe(true);
      expect(describeStatus(status())).toContain("at pin");

      commit(dir, "local", { "data.txt": "local" });
      expect(isAtPin(status())).toBe(false);
      expect(describeStatus(status())).toContain("1 ahead of pin");

      source.commit = "f".repeat(40);
      expect(describeStatus(status())).toContain("pin not fetched");
    });
  });
});
