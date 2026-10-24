/* istanbul ignore file */

import type { BundleOptions } from "@/bundler/utils";
import esbuild from "esbuild";
import fs from "fs";
import { typeCheckCommon, type CommonPlugin } from "@/bundler/plugin_utils";

function convertPlugin(plugin: CommonPlugin): esbuild.Plugin {
  return {
    name: plugin.name,
    setup(build) {
      if (plugin.onBuildStart) {
        build.onStart(plugin.onBuildStart);
      }
      if (plugin.onBuildEnd) {
        build.onEnd(plugin.onBuildEnd);
      }
    },
  };
}

export function typeCheckPlugin(options?: BundleOptions): esbuild.Plugin {
  return convertPlugin(typeCheckCommon(options));
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
  if (options?.analyzeBundle) {
    console.log(esbuild.analyzeMetafileSync(metafile));
  }
  for (const output in metafile.outputs) {
    const data = metafile.outputs[output];
    const size = (data.bytes / 1000).toFixed(2);
    console.log("entryPoint: " + data.entryPoint);
    console.log(`output: ${output} [${size} kB]\n`);
    if (options?.analyzeBundle) {
      const metaPath = `${data.entryPoint}.esbuild.meta.json`;
      fs.writeFileSync(metaPath, JSON.stringify(metafile));
    }
  }
}
