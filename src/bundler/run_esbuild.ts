/* istanbul ignore file */

import esbuild from "esbuild";

import type { BundleOptions } from "@/bundler/utils";

export function runBundler(
  buildOptions: esbuild.BuildOptions,
  envOptions?: BundleOptions
) {
  if (envOptions?.watch) {
    runWatch(buildOptions).catch(console.warn);
  } else {
    esbuild.build(buildOptions).catch(console.warn);
  }
}

async function runWatch(buildOptions: esbuild.BuildOptions) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Started esbuild watch!");
}
