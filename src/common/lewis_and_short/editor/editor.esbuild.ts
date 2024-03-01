/* istanbul ignore file */

import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import clear from "esbuild-plugin-output-reset";
import { BundleOptions, runBundler } from "@/esbuild/utils";
import { printStatsPlugin } from "@/esbuild/plugins";

const OUT_DIR = "genfiles_static/";
const ENTRY_POINT = "src/common/lewis_and_short/editor/ls_interactive_view.tsx";

const envOptions = BundleOptions.get();

const options = {
  entryPoints: [ENTRY_POINT],
  bundle: true,
  entryNames: "[dir]/Editor.[hash]",
  metafile: true,
  outdir: OUT_DIR,
  publicPath: "/",
  plugins: [
    printStatsPlugin(envOptions),
    clear,
    htmlPlugin({
      files: [
        {
          entryPoints: [ENTRY_POINT],
          filename: "ls_editor_index.html",
          htmlTemplate: "src/common/lewis_and_short/editor/ls_editor.html",
          scriptLoading: "defer",
        },
      ],
    }),
  ],
};

runBundler(options, envOptions);
