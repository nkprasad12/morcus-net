/* istanbul ignore file */

import fs from "fs";
import path from "path";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import { definePlugin } from "esbuild-plugin-define";
import clear from "esbuild-plugin-output-reset";
import { BundleOptions, runBundler } from "@/esbuild/utils";
import {
  compressPlugin,
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
  plugins: [
    printStatsPlugin(envOptions),
    clear,
    definePlugin({
      COMMIT_HASH: getHash(),
      BUILD_DATE: new Date().toString(),
      DEFAULT_EXPERIMENTAL_MODE: !envOptions.isProduction,
    }),
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
    renamePlugin({
      renameMap: new Map([
        [SERVICE_WORKER_ROOT, path.join(OUT_DIR, "serviceworker.js")],
      ]),
    }),
  ]
    .concat(envOptions.typeCheck ? typeCheckPlugin(envOptions) : [])
    .concat(envOptions.compress ? compressPlugin() : []),
};

runBundler(options, envOptions);
