#!/usr/bin/env node
// Checks that every pin in upstream_sources.lock.json has its
// `morcus-pin/<sha>` tag on its repo, which keeps the pinned commit reachable
// (see README.md in this directory). Dependency-free, so CI can run it before
// installing anything and fail fast, before the Docker build.
//
// Usage: node src/scripts/upstream/verify_pins.mjs [lock file]

import { execFile } from "child_process";
import { readFileSync } from "fs";
import { promisify } from "util";

const lockPath = process.argv[2] ?? "upstream_sources.lock.json";
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
const ATTEMPTS = 3;

/** `git ls-remote`, retried: CI runners occasionally see transient errors. */
async function lsRemote(repo, ref) {
  for (let attempt = 1; ; attempt++) {
    try {
      const { stdout } = await promisify(execFile)(
        "git",
        ["ls-remote", repo, ref],
        { env }
      );
      return stdout;
    } catch (err) {
      if (attempt >= ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function check([name, source]) {
  const tag = `morcus-pin/${source.commit}`;
  try {
    const stdout = await lsRemote(source.repo, `refs/tags/${tag}`);
    if (stdout.split(/\s/)[0] === source.commit) return `${name}: ok`;
    throw new Error(
      `${source.repo} has no tag ${tag}. Run \`./morcus.sh upstream tag ${name}\`.`
    );
  } catch (err) {
    throw new Error(`${name}: ${err.message.trim()}`);
  }
}

const results = await Promise.allSettled(
  Object.entries(lock.sources).map(check)
);
let failed = false;
for (const result of results) {
  if (result.status === "fulfilled") {
    console.log(result.value);
  } else {
    console.error(result.reason.message);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
