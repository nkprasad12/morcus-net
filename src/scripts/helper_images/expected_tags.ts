/**
 * The checked-in build context of each helper image.
 *
 * Changing an entry here is the explicit decision to change that image: on
 * the next `main` release it will be promoted to `:latest` and redeployed by
 * Watchtower. CI (`cli.ts build-and-*`) and `images.test.ts` fail if an
 * image's actual context doesn't match its entry, and print the values to
 * use if the change is intended. This file is not part of any build context.
 */

import type { HelperImageName } from "@/scripts/helper_images/images";

export interface ExpectedImage {
  /** Files in the image's Docker build context, sorted. */
  readonly files: readonly string[];
  /** `tree-<hash>` of the build context and `build.ts`. */
  readonly tag: string;
}

export const EXPECTED_IMAGES: Readonly<Record<HelperImageName, ExpectedImage>> =
  {
    "morcus-proxy": {
      files: ["Dockerfile", "nginx.conf"],
      tag: "tree-da9b386b14098e4fcb57710e74611fb10c0010b2",
    },
    "morcus-latincy": {
      files: ["Dockerfile", "__init__.py", "latincy_server.py"],
      tag: "tree-715469217e9a37f4d4a24159b8f602c54a98d659",
    },
    "morcus-pruner": {
      files: ["Dockerfile", "pruner.js"],
      tag: "tree-4f8912b92a8264db575cd097c0ab40573c652244",
    },
  };
