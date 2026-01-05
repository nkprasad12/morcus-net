/* istanbul ignore file */

import {
  type CommonPlugin,
  typeCheckCommon,
  compressJsOutputs,
} from "@/bundler/plugin_utils";
import type { BundleOptions } from "@/bundler/utils";
import type { RsbuildPlugin } from "@rsbuild/core";

function convertPlugin(plugin: CommonPlugin): RsbuildPlugin {
  return {
    name: plugin.name,
    setup: (api) => {
      if (plugin.onBuildStart) {
        api.onBeforeBuild(plugin.onBuildStart);
      }
      if (plugin.onBuildEnd) {
        api.onAfterBuild(plugin.onBuildEnd);
      }
    },
  };
}

export function typeCheck(options?: BundleOptions): RsbuildPlugin {
  return convertPlugin(typeCheckCommon(options));
}

export function compress(): RsbuildPlugin {
  return {
    name: "compressJs",
    setup: (api) => {
      api.onAfterBuild(async (a) => {
        if (a.stats === undefined) {
          throw new Error("No stats available.");
        }
        if (!("compilation" in a.stats)) {
          throw new Error("No compilation available in stats.");
        }
        const compilation = a.stats.compilation;

        const outputs = new Set<string>();
        for (const [_, entrypoint] of compilation.entrypoints) {
          for (const chunk of entrypoint.chunks) {
            // The main chunks.
            chunk.files.forEach((f) => outputs.add(f));
          }
          for (const child of entrypoint.childrenIterable) {
            // The child chunks. Rsbuild seems to use this for chunks that are
            // fetched after the initial load.
            child.getFiles().forEach((f) => outputs.add(f));
          }
        }
        await compressJsOutputs(
          Array.from(outputs).map((f) => `${api.context.distPath}/${f}`)
        );
      });
    },
  };
}
