/**
 * The helper Docker images that run alongside the main Morcus server in
 * `src/devops/docker-compose.yaml`.
 *
 * Each image is built from the context its `prepareContext` assembles, and
 * its tag is a hash of that context (see `tags.ts`). Promotion to `:latest`
 * (and so a Watchtower redeploy) only happens when the tag changes, i.e. only
 * when what Docker would build changes. Nothing in this file needs to be kept
 * in sync with the image's inputs.
 */

import { copyRepoDir } from "@/scripts/helper_images/context";
import { smokeTestLatincy } from "@/scripts/helper_images/smoke_tests/latincy";
import { smokeTestProxy } from "@/scripts/helper_images/smoke_tests/proxy";

const DIR = "src/scripts/helper_images";
const DOCKER_HELPERS = `${DIR}/docker.ts`;

export interface HelperImage {
  /** Writes the image's complete Docker build context into `outDir`. */
  readonly prepareContext: (outDir: string) => void;
  /** Repo files for the smoke test (see `testedTag` in `tags.ts`). */
  readonly smokeTestInputs: readonly string[];
  readonly smokeTest: (imageRef: string) => Promise<void>;
}

export const HELPER_IMAGES = {
  "morcus-proxy": {
    prepareContext: (outDir) => copyRepoDir("src/devops/reverse_proxy", outDir),
    smokeTestInputs: [`${DIR}/smoke_tests/proxy.ts`, DOCKER_HELPERS],
    smokeTest: smokeTestProxy,
  },
  "morcus-latincy": {
    prepareContext: (outDir) => copyRepoDir("src/py/latincy/image", outDir),
    smokeTestInputs: [`${DIR}/smoke_tests/latincy.ts`, DOCKER_HELPERS],
    smokeTest: smokeTestLatincy,
  },
} satisfies Record<string, HelperImage>;

export type HelperImageName = keyof typeof HELPER_IMAGES;

export function isHelperImageName(value: string): value is HelperImageName {
  return Object.prototype.hasOwnProperty.call(HELPER_IMAGES, value);
}

export const ALL_HELPER_IMAGE_NAMES: readonly HelperImageName[] =
  Object.keys(HELPER_IMAGES).filter(isHelperImageName);

export function getHelperImage(name: HelperImageName): HelperImage {
  return HELPER_IMAGES[name];
}
