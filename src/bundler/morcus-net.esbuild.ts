/* istanbul ignore file */

import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import clear from "esbuild-plugin-output-reset";
import { BundleOptions, getHash } from "@/bundler/utils";
import {
  compressPlugin,
  printStatsPlugin,
  typeCheckPlugin,
} from "@/bundler/esbuild_plugins";
import { type BuildOptions } from "esbuild";
import { runBundler } from "@/bundler/run_esbuild";

const OUT_DIR = "build/client";
const SPA_ROOT = "src/web/client/root.tsx";

const envOptions = BundleOptions.get();

const options: BuildOptions = {
  entryPoints: [SPA_ROOT],
  bundle: true,
  minify: envOptions.minify,
  // We need the `client-bundle` suffix because that's the prefix we use
  // to set the `immutable` cache control header in the server.
  entryNames: "[dir]/[name].[hash].client-bundle",
  metafile: true,
  alias: {
    react: "preact/compat",
    "react-dom/test-utils": "preact/test-utils",
    "react-dom": "preact/compat",
    "react/jsx-runtime": "preact/jsx-runtime",
  },
  outdir: OUT_DIR,
  publicPath: "/",
  define: {
    COMMIT_HASH: `"${getHash()}"`,
  },
  plugins: [
    printStatsPlugin(envOptions),
    clear,
    htmlPlugin({
      files: [
        {
          entryPoints: [SPA_ROOT],
          filename: "index.html",
          htmlTemplate: "./src/web/client/root.html",
          scriptLoading: "defer",
        },
      ],
    }),
    ...(envOptions.compress ? [compressPlugin()] : []),
    ...(envOptions.typeCheck ? [typeCheckPlugin(envOptions)] : []),
  ],
};

runBundler(options, envOptions);
