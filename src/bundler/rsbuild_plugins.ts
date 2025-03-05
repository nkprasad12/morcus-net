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
        const entrypoints: Map<string, Record<string, any>> =
          // @ts-expect-error
          a.stats?.compilation.entrypoints;
        const outputs: string[] = [];
        for (const [_, entrypoint] of entrypoints) {
          for (const chunk of entrypoint.chunks) {
            for (const file of chunk.files) {
              outputs.push(`${api.context.distPath}/${file}`);
            }
          }
        }
        await compressJsOutputs(outputs);
      });
    },
  };
}
