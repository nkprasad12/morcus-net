/* istanbul ignore file */

import fs from "fs";
import path from "path";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import clear from "esbuild-plugin-output-reset";
import { BundleOptions, runBundler } from "@/esbuild/utils";
import {
  compressPlugin,
  injectBuildInfo,
  printStatsPlugin,
  renamePlugin,
  typeCheckPlugin,
} from "@/esbuild/plugins";
import { type BuildOptions } from "esbuild";

const OUT_DIR = "build/client";
const SPA_ROOT = "src/web/client/root.tsx";
const SERVICE_WORKER_ROOT = "src/web/client/offline/serviceworker.ts";

const envOptions = BundleOptions.get();

function getHash(): string {
  const hash = fs.readFileSync("build/morcusnet.commit.txt").toString();
  console.log(`Client commit hash: "${hash}"`);
  return hash;
}

const options: BuildOptions = {
  entryPoints: [SPA_ROOT, SERVICE_WORKER_ROOT],
  bundle: true,
  minify: envOptions.isProduction,
  entryNames: "[dir]/[name].[hash]",
  metafile: true,
  outdir: OUT_DIR,
  publicPath: "/",
  define: {
    COMMIT_HASH: `"${getHash()}"`,
    BUILD_DATE: `"${new Date().toString()}"`,
    DEFAULT_EXPERIMENTAL_MODE: `${!envOptions.isProduction}`,
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
    injectBuildInfo({
      target: SERVICE_WORKER_ROOT,
      replacements: [
        {
          placeholder: "@bundle-with-hash-placeholder.js@",
          replacement: [SPA_ROOT, "outputName"],
        },
      ],
    }),
    ...(envOptions.compress ? [compressPlugin()] : []),
    renamePlugin({
      renameMap: new Map([
        [SERVICE_WORKER_ROOT, path.join(OUT_DIR, "serviceworker.js")],
      ]),
    }),
    ...(envOptions.typeCheck ? [typeCheckPlugin(envOptions)] : []),
  ],
};

runBundler(options, envOptions);
