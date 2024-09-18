/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import type { BundleOptions } from "@/esbuild/utils";
import { runCommand } from "@/scripts/script_utils";
import esbuild from "esbuild";
import fs from "fs";
import { gzipSync } from "zlib";

export interface RenameOptions {
  renameMap: Map<string, string>;
}

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

export function renamePlugin(options: RenameOptions): esbuild.Plugin {
  return {
    name: "nameOutputs",
    setup(build) {
      build.onEnd((result) => {
        const metafile = checkPresent(result.metafile);
        const outputs = checkPresent(metafile.outputs);
        for (const outputName in outputs) {
          const output = metafile.outputs[outputName];
          if (output.entryPoint === undefined) {
            continue;
          }
          const targetName = options.renameMap.get(output.entryPoint);
          if (targetName === undefined) {
            continue;
          }
          fs.renameSync(outputName, targetName);
          console.log(`Renamed: ${outputName} -> ${targetName}`);
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

export function compressPlugin(): esbuild.Plugin {
  return {
    name: "compressJs",
    setup(build) {
      build.onEnd((result) => compressResults(result));
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
    const size = (data.bytes / 1024).toFixed(2);
    console.log("entryPoint: " + data.entryPoint);
    console.log(`output: ${output} [${size} kB]\n`);
    if (options?.analyzeBundle) {
      console.log(esbuild.analyzeMetafileSync(metafile));
      const metaPath = `${data.entryPoint}.esbuild.meta.json`;
      fs.writeFileSync(metaPath, JSON.stringify(metafile));
    }
  }
}

function compressResults(result: esbuild.BuildResult) {
  const metafile = result.metafile;
  if (metafile === undefined) {
    return;
  }
  for (const output in metafile.outputs) {
    if (!output.endsWith(".js")) {
      continue;
    }
    const outFile = `${output}.gz`;
    const compressed = gzipSync(fs.readFileSync(output));
    const size = (compressed.byteLength / 1024).toFixed(2);
    console.log(`compressed: ${outFile} [${size} kB]`);
    fs.writeFileSync(outFile, compressed);
  }
}
