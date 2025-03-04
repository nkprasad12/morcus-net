import { rspack, type RsbuildConfig, createRsbuild } from "@rsbuild/core";
import { pluginPreact } from "@rsbuild/plugin-preact";
import { BundleOptions, getHash } from "@/bundler/utils";
import { compress, typeCheck } from "@/bundler/rsbuild_plugins";

const OUT_DIR = "build/client";
const SPA_ROOT = "./src/web/client/root.tsx";

const envOptions = BundleOptions.get();

const rsbuildConfig: RsbuildConfig = {
  source: {
    entry: {
      index: SPA_ROOT,
    },
  },
  output: {
    minify: envOptions.minify,
    filename: {
      js: "[name].[contenthash].client-bundle.js",
    },
    // Clears the output directory before building.
    cleanDistPath: true,
    legalComments: "inline",
    distPath: {
      root: OUT_DIR,
      // Send everyone to the same output directory.
      js: "",
      jsAsync: "",
    },
  },
  server: {
    // Prevent rsbuild from copying the contents of /public to the output directory.
    publicDir: false,
  },
  tools: {
    rspack: {
      target: ["web", "es2018"],
      plugins: [new rspack.DefinePlugin({ COMMIT_HASH: `"${getHash()}"` })],
    },
  },
  html: {
    template: "./src/web/client/root.html",
    scriptLoading: "defer",
  },
  // It is also possible to use `resolve.alias` to make Preact work, but the
  // plugin has a 1% smaller bundle size.
  // - `prefreshEnabled` doesn't seem to work.
  plugins: [pluginPreact({ prefreshEnabled: false })]
    .concat(envOptions.compress ? [compress()] : [])
    .concat(envOptions.typeCheck ? [typeCheck(envOptions)] : []),
  performance: {
    bundleAnalyze: envOptions.analyzeBundle
      ? { analyzerMode: "server", openAnalyzer: true }
      : undefined,
    chunkSplit: {
      // For now, prevent splitting.
      strategy: "all-in-one",
    },
  },
};

createRsbuild({ rsbuildConfig }).then((rsbuild) =>
  rsbuild.build({ watch: envOptions.watch })
);
