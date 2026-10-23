/**
 * The `docker build` step shared by every helper image.
 *
 * This file is an input to every helper image's tag (see `images.ts`):
 * editing it rebuilds, and on the next `main` release redeploys, all of them.
 * Keep anything that doesn't affect how images are built out of this file.
 */

import { run, runInherit } from "@/scripts/helper_images/docker";

export function dockerBuild(contextDir: string, tag: string): void {
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY || "nkprasad12/morcus-net";
  const revision = run("git", ["rev-parse", "HEAD"]);
  const created = new Date().toISOString();
  runInherit("docker", [
    "build",
    contextDir,
    "--tag",
    tag,
    "--label",
    `org.opencontainers.image.source=${serverUrl}/${repo}`,
    "--label",
    `org.opencontainers.image.revision=${revision}`,
    "--label",
    `org.opencontainers.image.created=${created}`,
  ]);
}
