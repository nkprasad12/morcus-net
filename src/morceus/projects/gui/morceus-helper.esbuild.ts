/* istanbul ignore file */

import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import clear from "esbuild-plugin-output-reset";
import esbuild from "esbuild";
import { type BuildOptions } from "esbuild";

const OUT_DIR = "build/devtools/morceus-helper";
const SPA_ROOT = "src/morceus/projects/gui/morceus_helper_root.tsx";

const options: BuildOptions = {
  entryPoints: [SPA_ROOT],
  bundle: true,
  entryNames: "[dir]/[name].[hash]",
  metafile: true,
  outdir: OUT_DIR,
  publicPath: "/",
  plugins: [
    clear,
    htmlPlugin({
      files: [
        {
          entryPoints: [SPA_ROOT],
          filename: "index.html",
          htmlTemplate: "./src/morceus/projects/gui/morceus_helper_root.html",
          scriptLoading: "defer",
        },
      ],
    }),
  ],
};

export function buildMorceusHelper() {
  return esbuild.build(options);
}
