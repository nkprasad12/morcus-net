/* istanbul ignore file */

import { spawnSync } from "child_process";
import { rmSync, writeFileSync } from "fs";

const COMMIT_ID_FILE = "morcusnet.commit.txt";

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
  console.log(`Storing commit hash: "${id}"`);
  writeFileSync(COMMIT_ID_FILE, id);
}
