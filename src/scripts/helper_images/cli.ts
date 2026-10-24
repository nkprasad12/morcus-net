/**
 * Builds, smoke-tests, pushes, and promotes the helper Docker images listed
 * in `images.ts`.
 *
 * Usage:
 *   npm run tsnp src/scripts/helper_images/cli.ts -- build-and-test <image>
 *   npm run tsnp src/scripts/helper_images/cli.ts -- build-and-push <image>
 *   npm run tsnp src/scripts/helper_images/cli.ts -- promote [--dry-run]
 *
 * `build-and-*` assembles the image's build context, hashes it into a
 * content-addressed tag (`tree-<hash>`, see `tags.ts`), and builds from that
 * same context only if the tag isn't in the registry yet. If the image exists
 * but hasn't passed the current smoke test (no matching `tested-<hash>` tag),
 * it pulls and re-tests the existing image instead of rebuilding it.
 *
 * Every command first checks each image's build context against
 * `expected_tags.ts` and fails on a mismatch, so changing an image is always
 * an explicit, reviewed edit.
 *
 * `promote` (run on pushes to `main`) points each image's `:latest` at its
 * current tag once that tag has passed the current smoke test, so `:latest`
 * only moves (and Watchtower only redeploys) when the image changed.
 * `promote --dry-run` (run on pushes to `dev`) reports what the next `main`
 * release would promote, without changing anything.
 */

import { dockerBuild } from "@/scripts/helper_images/build";
import {
  imageExistsInRegistry,
  inspectDigest,
  REGISTRY_PREFIX,
  runInherit,
  sleep,
} from "@/scripts/helper_images/docker";
import {
  ALL_HELPER_IMAGE_NAMES,
  getHelperImage,
  isHelperImageName,
  type HelperImageName,
} from "@/scripts/helper_images/images";
import {
  imageTag,
  testedTag,
  withImageContext,
} from "@/scripts/helper_images/tags";

/**
 * Digest of the 2026-01-25 `morcus-latincy` image containing spaCy 3.8.11 and
 * the `la_core_web_lg` 3.8.0 model (preserved under `:archive-2026-01-25`).
 */
const LATINCY_ARCHIVE_TAG = "archive-2026-01-25";
const LATINCY_ARCHIVE_DIGEST =
  "sha256:553342482a1924b92e6645d425d4689d7e1d20131d6b12397af40e3a3912818c";

/**
 * Ensures `morcus-latincy:archive-2026-01-25` exists in GHCR so the base image
 * referenced by `src/py/latincy/image/Dockerfile` is never garbage-collected.
 */
function ensureLatincyArchiveTag(): void {
  const repo = `${REGISTRY_PREFIX}/morcus-latincy`;
  const archiveRef = `${repo}:${LATINCY_ARCHIVE_TAG}`;
  if (imageExistsInRegistry(archiveRef)) {
    return;
  }
  console.log(
    `Creating archive tag ${archiveRef} -> ${LATINCY_ARCHIVE_DIGEST}`
  );
  runInherit("docker", [
    "buildx",
    "imagetools",
    "create",
    "-t",
    archiveRef,
    `${repo}@${LATINCY_ARCHIVE_DIGEST}`,
  ]);
}

async function buildHelperImage(
  name: HelperImageName,
  shouldPush: boolean
): Promise<void> {
  if (shouldPush && name === "morcus-latincy") {
    ensureLatincyArchiveTag();
  }

  // The context only exists inside this callback, so build from it here:
  // the image is built from exactly the files its tag was computed from.
  const state = withImageContext(name, ({ contextDir, tag }) => {
    const tested = testedTag(name, tag);
    const imageExists = imageExistsInRegistry(tag);
    if (imageExists && imageExistsInRegistry(tested)) {
      return null;
    }
    if (!imageExists) {
      console.log(`Building ${tag}...`);
      dockerBuild(contextDir, tag);
    }
    return { tag, tested, imageExists };
  });
  if (state === null) {
    console.log(`${name} already exists and passed the current smoke test.`);
    return;
  }
  const { tag, tested, imageExists } = state;

  if (imageExists) {
    console.log(
      `${tag} already exists, but its smoke test changed; re-testing it.`
    );
    runInherit("docker", ["pull", tag]);
  }

  await getHelperImage(name).smokeTest(tag);

  if (!shouldPush) {
    console.log(
      `Smoke test passed for ${tag} (PR mode; skipping registry push).`
    );
    return;
  }

  if (!imageExists) {
    console.log(`Pushing ${tag}...`);
    runInherit("docker", ["push", tag]);
  }
  console.log(`Marking ${tag} as tested (${tested})...`);
  runInherit("docker", ["buildx", "imagetools", "create", "-t", tested, tag]);
}

/**
 * How long `promote` waits for an image's `tested-` tag. It's created by the
 * same commit's `dev` push, which may still be running (a latincy re-test
 * pulls a large image).
 */
const TESTED_TAG_WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 10 * 1000;

async function waitForDigest(ref: string, deadline: number): Promise<string> {
  for (;;) {
    const digest = inspectDigest(ref);
    if (digest) {
      return digest;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `${ref} not found in registry. It's created only after the image passes its current smoke test on dev; check the dev CI run for this commit.`
      );
    }
    console.log(`Waiting for ${ref} to appear in registry...`);
    await sleep(POLL_MS);
  }
}

/**
 * Points each image's `:latest` at its current tag, but only once that tag
 * has passed the current smoke test (its `tested-` tag exists). With
 * `dryRun`, only reports what would happen and changes nothing.
 */
async function promoteAll(dryRun: boolean): Promise<void> {
  const deadline = Date.now() + TESTED_TAG_WAIT_MS;
  for (const name of ALL_HELPER_IMAGE_NAMES) {
    const repo = `${REGISTRY_PREFIX}/${name}`;
    const candidate = imageTag(name);
    const tested = testedTag(name, candidate);
    const latest = `${repo}:latest`;
    const previous = `${repo}:previous`;

    if (dryRun) {
      const testedDigest = inspectDigest(tested);
      const candidateDigest = inspectDigest(candidate);
      const latestDigest = inspectDigest(latest);
      if (!testedDigest || !candidateDigest) {
        throw new Error(
          `${name}: ${
            candidateDigest ? tested : candidate
          } is not in the registry.`
        );
      }
      console.log(
        candidateDigest === latestDigest
          ? `${name}: up to date (${candidate}).`
          : `${name}: WOULD PROMOTE ${candidate} -> ${latest} (redeploys on the next main release).`
      );
      continue;
    }

    await waitForDigest(tested, deadline);
    const candidateDigest = await waitForDigest(candidate, deadline);
    const latestDigest = inspectDigest(latest);
    if (candidateDigest === latestDigest) {
      console.log(
        `${latest} is already at ${candidate} (${candidateDigest}); skipping.`
      );
      continue;
    }
    if (latestDigest) {
      console.log(`Backing up ${latest} -> ${previous}`);
      runInherit("docker", [
        "buildx",
        "imagetools",
        "create",
        "-t",
        previous,
        latest,
      ]);
    }
    console.log(`Promoting ${candidate} -> ${latest}`);
    runInherit("docker", [
      "buildx",
      "imagetools",
      "create",
      "-t",
      latest,
      candidate,
    ]);
  }
}

async function main(): Promise<void> {
  const [, , command, arg] = process.argv;
  const names = ALL_HELPER_IMAGE_NAMES.join("|");
  if (command === "build-and-test" || command === "build-and-push") {
    if (!arg || !isHelperImageName(arg)) {
      throw new Error(`Usage: cli.ts ${command} <${names}>`);
    }
    await buildHelperImage(arg, command === "build-and-push");
  } else if (command === "promote") {
    if (arg !== undefined && arg !== "--dry-run") {
      throw new Error("Usage: cli.ts promote [--dry-run]");
    }
    await promoteAll(arg === "--dry-run");
  } else {
    throw new Error(
      `Usage: cli.ts {build-and-test|build-and-push} <${names}> | promote [--dry-run]`
    );
  }
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
