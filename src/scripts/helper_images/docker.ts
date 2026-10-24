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

export function inspectDigest(imageRef: string): string | null {
  return tryRun("docker", [
    "buildx",
    "imagetools",
    "inspect",
    imageRef,
    "--format",
    "{{json .Manifest.Digest}}",
  ]);
}
