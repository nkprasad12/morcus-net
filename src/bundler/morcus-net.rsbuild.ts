/* istanbul ignore file */

import { rspack, type RsbuildConfig, createRsbuild } from "@rsbuild/core";
import { pluginPreact } from "@rsbuild/plugin-preact";

import { BundleOptions, getHash } from "@/bundler/utils";
import {
  compress,
  injectBuildInfo,
  typeCheck,
  type InjectBuildInfoOptions,
} from "@/bundler/rsbuild_plugins";

const OUT_DIR = "build/client";
const SPA_ROOT = "./src/web/client/root.tsx";
const SERVICE_WORKER_ROOT = "./src/web/client/offline/serviceworker.ts";
const SERVICE_WORKER_OUTPUT = "serviceworker-template.js";
const INJECT_BUILD_INFO_OPTIONS: InjectBuildInfoOptions = {
  target: SERVICE_WORKER_OUTPUT,
  placeholder: '"@output-client-bundle-js-files@"',
  output: "serviceworker.js",
};

const envOptions = BundleOptions.get();

const webAppConfig: RsbuildConfig = {
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
  plugins: [pluginPreact({ prefreshEnabled: false })],
  performance: {
    bundleAnalyze: envOptions.analyzeBundle
      ? { analyzerMode: "server", openAnalyzer: true }
      : undefined,
    chunkSplit: {
      // Split off vendor code into its own chunk. At the time of writing, the last
      // update to vendor code was 9 months ago but there were several updates within
      // our codebase in that span.
      //
      // Note that this is not a pure win - on a cold load (with nothing cached), this
      // increases the data transferred by ~2.5 kB (+3.x%).
      // However, when we update the app but not our dependencies, this saves users from
      // having to redownload the vendor code (~20 kB, or about 25% of the total bundle size).
      strategy: "single-vendor",
    },
  },
};

const serviceWorkerConfig: RsbuildConfig = {
  source: {
    entry: {
      serviceWorker: {
        import: SERVICE_WORKER_ROOT,
        html: false,
      },
    },
  },
  output: {
    minify: envOptions.minify,
    filename: {
      js: SERVICE_WORKER_OUTPUT,
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
  // Plugins run once per build
  plugins: [],
  performance: {
    bundleAnalyze: envOptions.analyzeBundle
      ? { analyzerMode: "server", openAnalyzer: true }
      : undefined,
    chunkSplit: {
      strategy: "all-in-one",
    },
  },
};

const rsbuildConfig: RsbuildConfig = {
  environments: {
    app: webAppConfig,
    serviceworker: serviceWorkerConfig,
  },
  plugins: [
    // These happen after the full build, so we don't want to register them on each environment.
    injectBuildInfo(INJECT_BUILD_INFO_OPTIONS),
    ...(envOptions.compress ? [compress()] : []),
    ...(envOptions.typeCheck ? [typeCheck(envOptions)] : []),
  ],
};

createRsbuild({ rsbuildConfig }).then((rsbuild) =>
  rsbuild.build({ watch: envOptions.watch })
);
