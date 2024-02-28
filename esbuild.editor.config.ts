/* istanbul ignore file */

import esbuild from "esbuild";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import clear from "esbuild-plugin-output-reset";

const OUT_DIR = "genfiles_static/";

const options = {
  entryPoints: ["./src/common/lewis_and_short/editor/ls_interactive_view.tsx"],
  bundle: true,
  entryNames: "[dir]/Editor.[hash]",
  metafile: true,
  outdir: OUT_DIR,
  plugins: [
    clear,
    htmlPlugin({
      files: [
        {
          entryPoints: [
            "./src/common/lewis_and_short/editor/ls_interactive_view.tsx",
          ],
          filename: "ls_editor_index.html",
          htmlTemplate: "./src/common/lewis_and_short/editor/ls_editor.html",
        },
      ],
    }),
  ],
};

esbuild.build(options).catch(console.warn);
