/* istanbul ignore file */

import { spawnSync } from "child_process";
import { rmSync, writeFileSync, existsSync, mkdirSync } from "fs";

const COMMIT_ID_FILE = "build/morcusnet.commit.txt";

function calculateCommitId(): string {
  // The Docker build excludes `.git` via `.dockerignore` and passes the commit
  // hash via the `SOURCE_VERSION` build arg / environment variable instead.
  const fromEnv = process.env.SOURCE_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const { stdout } = spawnSync("git", ["rev-parse", "HEAD"]);
  const fromGit = stdout?.toString().trim();
  if (!fromGit) {
    throw new Error(
      "Could not determine commit ID from SOURCE_VERSION or `git rev-parse HEAD`."
    );
  }
  return fromGit;
}

export function writeCommitId() {
  const id = calculateCommitId();
  try {
    rmSync(COMMIT_ID_FILE);
  } catch {}
  if (!existsSync("build")) {
    mkdirSync("build");
  }
  console.log(`Storing commit hash: "${id}"`);
  writeFileSync(COMMIT_ID_FILE, id);
  // Save this for other build steps in the process.
  process.env.COMMIT_ID = id;
}
