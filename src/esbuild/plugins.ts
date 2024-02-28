/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import type { BundleOptions } from "@/esbuild/utils";
import { runCommand } from "@/scripts/script_utils";
import esbuild from "esbuild";
import fs from "fs";

export function typeCheckPlugin(options?: BundleOptions): esbuild.Plugin {
  return {
    name: "typeCheck",
    setup(build) {
      let tscPromise: Promise<number> | undefined = undefined;
      build.onStart(() => {
        tscPromise = runCommand("npx tsc")
          .catch(() => 1)
          .then((rc) => rc ?? 1);
      });
      build.onEnd(async () => {
        const returnCode = await checkPresent(tscPromise);
        const success = returnCode === 0;
        if (success) {
          console.log("Checked types successfully!");
        }
        if (!success && !options?.watch) {
          process.exit(1);
        }
      });
    },
  };
}

export function printStatsPlugin(options?: BundleOptions): esbuild.Plugin {
  return {
    name: "printStats",
    setup(build) {
      let startTime: number | undefined = undefined;
      build.onStart(() => {
        startTime = performance.now();
      });
      build.onEnd((result) => {
        if (startTime !== undefined) {
          const runtime = (performance.now() - startTime).toFixed(1);
          console.log(`\nBuild completed in ${runtime} ms`);
          startTime = undefined;
          printBuildResult(result, options);
        }
      });
    },
  };
}

function printBuildResult(
  result: esbuild.BuildResult,
  options?: BundleOptions
) {
  const metafile = result.metafile;
  if (metafile === undefined) {
    return;
  }
  for (const output in metafile.outputs) {
    const data = metafile.outputs[output];
    const size = (data.bytes / 1024).toFixed(1);
    console.log("entryPoint: " + data.entryPoint);
    console.log(`output: ${output} [${size} kB]\n`);
    if (options?.analyzeBundle) {
      console.log(esbuild.analyzeMetafileSync(metafile));
      const metaPath = `${data.entryPoint}.esbuild.meta.json`;
      fs.writeFileSync(metaPath, JSON.stringify(metafile));
    }
  }
}
