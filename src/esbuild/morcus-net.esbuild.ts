/* istanbul ignore file */

import fs from "fs";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import { definePlugin } from "esbuild-plugin-define";
import clear from "esbuild-plugin-output-reset";
import { BundleOptions, runBundler } from "@/esbuild/utils";
import { printStatsPlugin, typeCheckPlugin } from "@/esbuild/plugins";

const OUT_DIR = "build/client";
const ENTRY_POINT = "src/web/client/root.tsx";

const envOptions = BundleOptions.get();

function getHash(): string {
  const hash = fs.readFileSync("morcusnet.commit.txt").toString();
  console.log(`Client commit hash: "${hash}"`);
  return hash;
}

const options = {
  entryPoints: [ENTRY_POINT],
  bundle: true,
  minify: envOptions.isProduction,
  entryNames: "[dir]/Root.[hash]",
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
          entryPoints: [ENTRY_POINT],
          filename: "index.html",
          htmlTemplate: "./src/web/client/root.html",
          scriptLoading: "defer",
        },
      ],
    }),
  ].concat(envOptions.typeCheck ? typeCheckPlugin(envOptions) : []),
};

runBundler(options, envOptions);
