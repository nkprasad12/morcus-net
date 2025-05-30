/* istanbul ignore file */

import { assertEqual, checkPresent } from "@/common/assert";
import type { BundleOptions } from "@/bundler/utils";
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import {
  compressJsOutputs,
  typeCheckCommon,
  type CommonPlugin,
} from "@/bundler/plugin_utils";

export interface RenameOptions {
  renameMap: Map<string, string>;
}

export type InjectData = "outputName";
export interface InjectBuildInfoOptions {
  /** The entrypoint to inject info into. */
  target: string;
  /**
   * The replacements to make. The `placeholder` should be the string to replace, while the `replacement`
   * should be the data about the entrypoint that should replace the placeholder.
   */
  replacements: {
    placeholder: string;
    replacement: [string, InjectData];
  }[];
}

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

export function injectBuildInfo(
  options: InjectBuildInfoOptions
): esbuild.Plugin {
  return {
    name: "injectBuildInfo",
    setup(build) {
      build.onEnd((result) => {
        const metafile = checkPresent(result.metafile);
        const outputs = checkPresent(metafile.outputs);
        const entryPointToOutput = new Map<string, string>();
        for (const outputName in outputs) {
          const output = metafile.outputs[outputName];
          // For this to work, we assume every output has exactly one entrypoint.
          // If we have bundle splitting, we'd need to also figure out which chunks
          // to also do the replacement in.
          const entrypoint = checkPresent(output.entryPoint);
          entryPointToOutput.set(entrypoint, outputName);
        }
        const targetFile = checkPresent(entryPointToOutput.get(options.target));
        console.log(`Injecting info into ${targetFile}`);
        let contents = fs.readFileSync(targetFile).toString();
        for (const item of options.replacements) {
          assertEqual(item.replacement[1], "outputName");
          const fullPath = entryPointToOutput.get(item.replacement[0]);
          const basename = path.basename(checkPresent(fullPath));
          contents = contents.replaceAll(item.placeholder, basename);
          console.log(`${item.placeholder} -> ${basename}`);
        }
        fs.writeFileSync(targetFile, contents);
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

async function compressResults(result: esbuild.BuildResult) {
  const metafile = result.metafile;
  if (metafile === undefined) {
    return;
  }
  compressJsOutputs(Object.keys(metafile.outputs));
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
