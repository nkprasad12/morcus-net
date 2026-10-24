/**
 * Builds the `morcus-pruner` Docker build context: the esbuild bundle of
 * `pruner_main.ts` (`pruner.js`) plus its Dockerfile.
 *
 * The image's tag hashes this generated context, not the sources, so anything
 * that changes the bundle (pruner code, anything it imports, the locked
 * `mongodb` / `esbuild` versions, these esbuild options) changes the tag, and
 * edits that don't (unit tests, comments esbuild strips) don't.
 */

import { copyFileSync } from "node:fs";
import { join } from "node:path";
import esbuild from "esbuild";

export const PRUNER_SOURCE_DIR = "src/devops/pruner";

export function preparePrunerContext(outDir: string): void {
  esbuild.buildSync({
    entryPoints: [join(PRUNER_SOURCE_DIR, "pruner_main.ts")],
    bundle: true,
    platform: "node",
    outfile: join(outDir, "pruner.js"),
  });
  copyFileSync(
    join(PRUNER_SOURCE_DIR, "Dockerfile"),
    join(outDir, "Dockerfile")
  );
}
