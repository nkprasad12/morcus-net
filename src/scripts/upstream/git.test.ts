import {
  checkContainsContent,
  countLocalOnlyCommits,
  findRemote,
} from "@/scripts/upstream/git";
import {
  cloneInto,
  commit,
  makeSandbox,
  sh,
  type Sandbox,
} from "@/scripts/upstream/test_helpers";

describe("checkContainsContent", () => {
  let sandbox: Sandbox;
  let dir: string;

  beforeEach(() => {
    sandbox = makeSandbox();
    dir = sandbox.upstream;
  });
  afterEach(() => sandbox.cleanup());

  it("accepts the same commit and descendants", () => {
    const later = commit(dir, "later", { "other.txt": "x" });
    expect(checkContainsContent(dir, sandbox.base, sandbox.base).kind).toBe(
      "same"
    );
    expect(checkContainsContent(dir, sandbox.base, later).kind).toBe(
      "descendant"
    );
  });

  it("accepts a squash of the old pin's commits", () => {
    sh(dir, "checkout", "-q", "-b", "fix");
    commit(dir, "fix 1", { "data.txt": "A\nb\nc\n" });
    const fix = commit(dir, "fix 2", { "data.txt": "A\nb\nC\n" });
    // Upstream squash-merges the fix onto a main that moved on.
    sh(dir, "checkout", "-q", "main");
    commit(dir, "unrelated", { "other.txt": "x" });
    sh(dir, "merge", "-q", "--squash", "fix");
    sh(dir, "commit", "-q", "-m", "squashed fix");
    const squashed = sh(dir, "rev-parse", "HEAD");
    expect(checkContainsContent(dir, fix, squashed).kind).toBe("contains");
  });

  it("rejects a new pin that lacks the old pin's fix", () => {
    sh(dir, "checkout", "-q", "-b", "fix-a");
    const fixA = commit(dir, "fix a", { "data.txt": "A\nb\nc\n" });
    sh(dir, "checkout", "-q", "-b", "fix-b", sandbox.base);
    const fixB = commit(dir, "fix b", { "data.txt": "a\nb\nC\n" });
    const check = checkContainsContent(dir, fixA, fixB);
    expect(check.kind).toBe("drops");
    expect(check.kind === "drops" && check.diffstat).toContain("data.txt");
  });

  it("reports conflicting edits", () => {
    sh(dir, "checkout", "-q", "-b", "ours");
    const ours = commit(dir, "ours", { "data.txt": "OURS\nb\nc\n" });
    sh(dir, "checkout", "-q", "-b", "theirs", sandbox.base);
    const theirs = commit(dir, "theirs", { "data.txt": "THEIRS\nb\nc\n" });
    expect(checkContainsContent(dir, ours, theirs).kind).toBe("conflicts");
  });
});

describe("git helpers", () => {
  let sandbox: Sandbox;
  afterEach(() => sandbox.cleanup());

  it("finds the remote for a repo URL and counts local-only commits", () => {
    sandbox = makeSandbox();
    const dir = cloneInto(sandbox, "foo");
    expect(findRemote(dir, sandbox.remote)).toBe("origin");
    expect(findRemote(dir, "/elsewhere.git")).toBeUndefined();
    expect(countLocalOnlyCommits(dir, "HEAD")).toBe(0);
    commit(dir, "local", { "data.txt": "local" });
    expect(countLocalOnlyCommits(dir, "HEAD")).toBe(1);
  });
});
