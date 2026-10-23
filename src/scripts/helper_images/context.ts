/**
 * Builds and hashes Docker build contexts.
 *
 * Each helper image is built from a context directory assembled here, and its
 * tag is a hash of exactly that directory (plus the `docker build` step). So
 * the tag covers everything the image can contain by construction: `COPY`
 * can't read outside the context, and nothing in the context escapes the
 * hash. There's no hand-maintained list of inputs to forget to update.
 */

import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { run } from "@/scripts/helper_images/docker";

/** Shared `docker build` step; part of every image's tag. */
export const BUILD_STEP_PATH = "src/scripts/helper_images/build.ts";

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Copies the files git would commit under `repoDir` (tracked, or untracked
 * but not ignored) into `outDir`, preserving relative paths and modes. Stray
 * ignored files (e.g. `__pycache__`) never reach the image or its tag.
 */
export function copyRepoDir(repoDir: string, outDir: string): void {
  const files = run("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    repoDir,
  ])
    .split("\0")
    .filter((f) => f.length > 0 && existsSync(f));
  if (files.length === 0) {
    throw new Error(`No files found under '${repoDir}'.`);
  }
  for (const file of files) {
    const dest = join(outDir, relative(repoDir, file));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
    chmodSync(dest, statSync(file).mode);
  }
}

/** Relative paths of all files under `dir`, sorted. */
export function listFiles(dir: string): string[] {
  return listFilesUnder(dir, dir).sort();
}

function listFilesUnder(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesUnder(full, base));
    } else if (entry.isFile()) {
      out.push(relative(base, full));
    } else {
      throw new Error(`Unsupported file type in build context: ${full}`);
    }
  }
  return out;
}

/**
 * Hashes a directory's contents: each file's relative path, executable bit,
 * and content. Independent of file timestamps and directory listing order.
 */
export function hashDirectory(dir: string): string {
  const lines = listFiles(dir).map((rel) => {
    const full = join(dir, rel);
    const exec = (statSync(full).mode & 0o111) !== 0 ? "x" : "-";
    return `${exec} ${sha256(readFileSync(full))} ${rel}`;
  });
  return sha256(`${lines.join("\n")}\n`);
}

/** Hashes the contents of the given repo files (e.g. smoke tests). */
export function hashFiles(paths: readonly string[]): string {
  const lines = [...paths].sort().map((p) => `${sha256(readFileSync(p))} ${p}`);
  return sha256(`${lines.join("\n")}\n`);
}

/**
 * Runs `prepare` to assemble a build context in a temp directory, then calls
 * `use` with the directory, its tag hash (context + build step), and the
 * context's file list. The directory is removed afterwards.
 */
export function withBuildContext<T>(
  prepare: (outDir: string) => void,
  use: (contextDir: string, hash: string, files: readonly string[]) => T
): T {
  const outDir = mkdtempSync(join(tmpdir(), "helper-image-context-"));
  try {
    prepare(outDir);
    const hash = sha256(
      `context ${hashDirectory(outDir)}\nbuild ${hashFiles([
        BUILD_STEP_PATH,
      ])}\n`
    );
    return use(outDir, hash, listFiles(outDir));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}
