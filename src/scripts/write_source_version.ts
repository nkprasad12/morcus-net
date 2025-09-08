/* istanbul ignore file */

import { spawnSync } from "child_process";
import { rmSync, writeFileSync, existsSync, mkdirSync } from "fs";

const COMMIT_ID_FILE = "build/morcusnet.commit.txt";

function calculateCommitId(): string {
  // The Heroku build environment removes git metadata, but provides
  // commit information via environment variable instead.
  if (process.env.SOURCE_VERSION !== undefined) {
    return process.env.SOURCE_VERSION.trim();
  }
  const { stdout } = spawnSync("git", ["rev-parse", "HEAD"]);
  return stdout.toString().trim();
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
