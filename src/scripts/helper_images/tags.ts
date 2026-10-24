import { createHash } from "node:crypto";
import { hashFiles, withBuildContext } from "@/scripts/helper_images/context";
import { REGISTRY_PREFIX } from "@/scripts/helper_images/docker";
import {
  EXPECTED_IMAGES,
  type ExpectedImage,
} from "@/scripts/helper_images/expected_tags";
import {
  getHelperImage,
  type HelperImageName,
} from "@/scripts/helper_images/images";

const EXPECTED_TAGS_PATH = "src/scripts/helper_images/expected_tags.ts";

function shortHash(hash: string): string {
  return hash.slice(0, 40);
}

export interface ImageContext {
  readonly contextDir: string;
  /** Full image reference, `<registry>/<name>:tree-<hash>`. */
  readonly tag: string;
  readonly expected: ExpectedImage;
}

/**
 * Compares an image's computed build context with its checked-in entry in
 * `expected_tags.ts`. Returns `null` if they match, or an explanation (with
 * the values to paste if the change is intended) if they don't.
 */
export function describeMismatch(
  name: HelperImageName,
  actual: ExpectedImage,
  expected: ExpectedImage | undefined
): string | null {
  if (
    expected !== undefined &&
    expected.tag === actual.tag &&
    JSON.stringify(expected.files) === JSON.stringify(actual.files)
  ) {
    return null;
  }
  const lines = [
    `${name}'s build context doesn't match ${EXPECTED_TAGS_PATH}.`,
  ];
  if (expected === undefined) {
    lines.push("  (no entry yet)");
  } else {
    const added = actual.files.filter((f) => !expected.files.includes(f));
    const removed = expected.files.filter((f) => !actual.files.includes(f));
    for (const f of added) lines.push(`  files: + ${f}`);
    for (const f of removed) lines.push(`  files: - ${f}`);
    lines.push(`  expected tag: ${expected.tag}`);
  }
  lines.push(`  actual tag:   ${actual.tag}`);
  lines.push(
    `If ${name} should change (and be redeployed on the next main release),`,
    `set its entry in ${EXPECTED_TAGS_PATH} to:`,
    `  "${name}": {`,
    `    files: ${JSON.stringify(actual.files)},`,
    `    tag: "${actual.tag}",`,
    `  },`
  );
  return lines.join("\n");
}

/**
 * Assembles image `name`'s build context, checks it against
 * `expected_tags.ts`, and calls `use` with it and its content-addressed tag
 * (`tree-<hash of context + build step>`). The tag changes only when the
 * files Docker builds from change, and every such change must be confirmed
 * by editing `expected_tags.ts`. Throws if they don't match.
 */
export function withImageContext<T>(
  name: HelperImageName,
  use: (context: ImageContext) => T
): T {
  return withBuildContext(
    getHelperImage(name).prepareContext,
    (contextDir, hash, files) => {
      const actual: ExpectedImage = { files, tag: `tree-${shortHash(hash)}` };
      const mismatch = describeMismatch(name, actual, EXPECTED_IMAGES[name]);
      if (mismatch !== null) {
        throw new Error(mismatch);
      }
      return use({
        contextDir,
        tag: `${REGISTRY_PREFIX}/${name}:${actual.tag}`,
        expected: actual,
      });
    }
  );
}

/** Computes the actual context files and tag without checking them. */
export function computeImage(name: HelperImageName): ExpectedImage {
  return withBuildContext(
    getHelperImage(name).prepareContext,
    (_, hash, files) => ({
      files,
      tag: `tree-${shortHash(hash)}`,
    })
  );
}

export function imageTag(name: HelperImageName): string {
  return withImageContext(name, (context) => context.tag);
}

/**
 * Marker tag recording that the image at `tag` passed the current smoke
 * test. When only a smoke test changes, the image tag stays the same but this
 * one doesn't, so the existing image gets re-tested.
 */
export function testedTag(name: HelperImageName, tag: string): string {
  const testHash = hashFiles(getHelperImage(name).smokeTestInputs);
  const combined = createHash("sha256")
    .update(`${tag}\n${testHash}\n`)
    .digest("hex");
  return `${REGISTRY_PREFIX}/${name}:tested-${shortHash(combined)}`;
}
