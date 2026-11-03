import { execFileSync } from "node:child_process";

export const REGISTRY_PREFIX = "ghcr.io/nkprasad12";

export function run(cmd: string, args: readonly string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function runInherit(cmd: string, args: readonly string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

export function tryRun(cmd: string, args: readonly string[]): string | null {
  try {
    return run(cmd, args);
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function imageExistsInRegistry(imageRef: string): boolean {
  return tryRun("docker", ["manifest", "inspect", imageRef]) !== null;
}

/**
 * The digest (e.g. `sha256:...`) of the manifest `imageRef` points at, or
 * null if it isn't in the registry.
 */
export function inspectDigest(imageRef: string): string | null {
  return tryRun("docker", [
    "buildx",
    "imagetools",
    "inspect",
    imageRef,
    "--format",
    "{{.Manifest.Digest}}",
  ]);
}

/**
 * The raw JSON of the manifest `imageRef` points at (an image manifest or a
 * manifest list), or null if it isn't in the registry.
 */
export function inspectRawManifest(imageRef: string): string | null {
  return tryRun("docker", [
    "buildx",
    "imagetools",
    "inspect",
    imageRef,
    "--raw",
  ]);
}

/**
 * Whether a ref whose manifest has digest `refDigest` and raw JSON
 * `refRawManifest` serves exactly the image manifest `imageDigest`.
 *
 * Helper images are pushed as single-platform image manifests, but
 * `imagetools create -t <ref> <image>` (how `promote` moves `:latest`) wraps
 * such a manifest in a one-entry manifest list, which has a digest of its
 * own. So the ref serves the image if it is that manifest, or a manifest list
 * whose only entry is that manifest.
 */
export function servesImage(
  refDigest: string,
  refRawManifest: string,
  imageDigest: string
): boolean {
  if (refDigest === imageDigest) {
    return true;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(refRawManifest);
  } catch {
    return false;
  }
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("manifests" in manifest) ||
    !Array.isArray(manifest.manifests) ||
    manifest.manifests.length !== 1
  ) {
    return false;
  }
  const entry: unknown = manifest.manifests[0];
  return (
    typeof entry === "object" &&
    entry !== null &&
    "digest" in entry &&
    entry.digest === imageDigest
  );
}
