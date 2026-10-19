/**
 * Build provenance: which external inputs a production build used.
 *
 * Prod builds download dictionary and library sources from upstream branch
 * HEADs and clone repos at HEAD, so the same morcus-net commit can produce
 * different content on a rebuild. The build ID covers the commit *and* those
 * inputs, and is what `?v=` cache keys use in production (see
 * `getBuildVersion` in `web/ui/core/server/build_version.server.ts`).
 *
 * `script_utils.ts` records each input as the pipeline fetches it; the last
 * step of `prod_build_steps.ts` writes the result with
 * {@link writeBuildProvenance}.
 *
 * Inputs are recorded as git object IDs (a file's blob SHA-1, a clone's HEAD)
 * rather than an arbitrary hash, so each one can be looked up upstream. The
 * hashes identify content; nothing here relies on them being cryptographic.
 */

import { createHash } from "crypto";
import { createReadStream } from "fs";
import { stat, writeFile } from "fs/promises";
import { spawnSync } from "child_process";
import {
  BUILD_PROVENANCE_FILE,
  type BuildProvenance,
} from "@/web/ui/core/server/build_version.server";

/** Hex characters of the build ID: 48 bits, plenty for a few builds a month. */
const BUILD_ID_LENGTH = 12;

/** The inputs recorded so far in this process, keyed by URL. */
const recordedInputs = new Map<string, string>();

/**
 * The git blob ID of a file: what `git hash-object <path>` prints, and the
 * `sha` the GitHub contents API reports for it.
 */
export async function gitBlobSha1(path: string): Promise<string> {
  const { size } = await stat(path);
  const hash = createHash("sha1");
  hash.update(`blob ${size}\0`);
  for await (const chunk of createReadStream(path)) {
    // No encoding was set, so every chunk is a Buffer.
    if (!Buffer.isBuffer(chunk)) throw new Error(`Unexpected chunk in ${path}`);
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/** The commit checked out in `dir`. */
export function gitHead(dir: string): string {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "HEAD"]);
  const head = result.stdout?.toString().trim() ?? "";
  if (result.status !== 0 || head.length === 0) {
    throw new Error(`Could not read HEAD of ${dir}`);
  }
  return head;
}

/** Records a downloaded file. Call right after the download, before cleanup. */
export async function recordDownload(url: string, path: string): Promise<void> {
  recordedInputs.set(url, `blob:${await gitBlobSha1(path)}`);
}

/** Records a cloned repo. Call right after the clone, before cleanup. */
export function recordClone(url: string, dir: string): void {
  recordedInputs.set(url, `commit:${gitHead(dir)}`);
}

/** A snapshot of the inputs recorded so far, sorted by URL. */
export function recordedBuildInputs(): Record<string, string> {
  return sortedRecord(recordedInputs);
}

/** Forgets every recorded input (tests). */
export function clearRecordedBuildInputs(): void {
  recordedInputs.clear();
}

function sortedRecord(
  entries: ReadonlyMap<string, string> | Readonly<Record<string, string>>
): Record<string, string> {
  const pairs =
    entries instanceof Map ? Array.from(entries) : Object.entries(entries);
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(pairs);
}

/**
 * A short ID for a build of `commit` from `inputs`. Deterministic and
 * independent of the order inputs were recorded in.
 */
export function computeBuildId(
  commit: string,
  inputs: Readonly<Record<string, string>>
): string {
  const canonical = JSON.stringify({ commit, inputs: sortedRecord(inputs) });
  return createHash("sha1")
    .update(canonical)
    .digest("hex")
    .slice(0, BUILD_ID_LENGTH);
}

/** The provenance of a build of `commit` from `inputs`. */
export function buildProvenance(
  commit: string,
  inputs: Readonly<Record<string, string>>
): BuildProvenance {
  const sortedInputs = sortedRecord(inputs);
  return {
    commit,
    inputs: sortedInputs,
    buildId: computeBuildId(commit, sortedInputs),
  };
}

/**
 * Writes {@link BUILD_PROVENANCE_FILE} for this process's build. Run as the
 * last pipeline step, after every input has been fetched; `COMMIT_ID` is set
 * by the `writeCommitId` step at the start.
 */
export async function writeBuildProvenance(
  path: string = BUILD_PROVENANCE_FILE
): Promise<BuildProvenance> {
  const provenance = buildProvenance(
    process.env.COMMIT_ID ?? "",
    recordedBuildInputs()
  );
  await writeFile(path, JSON.stringify(provenance, null, 2) + "\n");
  console.log(
    `Build ID ${provenance.buildId} (commit ${
      provenance.commit || "unknown"
    },` + ` ${Object.keys(provenance.inputs).length} inputs)`
  );
  return provenance;
}
