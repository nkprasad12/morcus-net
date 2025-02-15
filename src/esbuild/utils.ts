/* istanbul ignore file */

import esbuild from "esbuild";

export interface BundleOptions {
  minify: boolean;
  watch: boolean;
  analyzeBundle: boolean;
  typeCheck: boolean;
  compress: boolean;
}

export namespace BundleOptions {
  export function get(): BundleOptions {
    return {
      minify: process.env.MINIFY === "1",
      watch: process.env.WATCH === "1",
      analyzeBundle: process.env.ANALYZE_BUNDLE === "1",
      typeCheck: process.env.RUN_TSC === "1",
      compress: process.env.COMPRESS === "1",
    };
  }
}

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
