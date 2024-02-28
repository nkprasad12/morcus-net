/* istanbul ignore file */

import esbuild from "esbuild";
import fs from "fs";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import { definePlugin } from "esbuild-plugin-define";
import clear from "esbuild-plugin-output-reset";

const OUT_DIR = "genfiles_static/";
const analyze = process.env.ANALYZE_BUNDLE === "1";
const isProduction = process.env.NODE_ENV === "production";
const watch = process.env.WATCH === "1";

const printStatsPlugin: esbuild.Plugin = {
  name: "printStats",
  setup(build) {
    let startTime: number | undefined = undefined;
    build.onStart(() => {
      startTime = performance.now();
    });
    build.onEnd((result) => {
      if (startTime !== undefined) {
        const runtime = (performance.now() - startTime).toFixed(1);
        console.log(`\nBuild completed in ${runtime} ms`);
        startTime = undefined;
        printBuildResult(result);
      }
    });
  },
};

function getHash(): string {
  const hash = fs.readFileSync("morcusnet.commit.txt").toString();
  console.log(`Client commit hash: "${hash}"`);
  return hash;
}

function printBuildResult(result: esbuild.BuildResult) {
  const metafile = result.metafile;
  if (metafile === undefined) {
    return;
  }
  for (const output in metafile.outputs) {
    const data = metafile.outputs[output];
    const size = (data.bytes / 1024).toFixed(1);
    console.log("entryPoint: " + data.entryPoint);
    console.log(`output: ${output} [${size} kB]\n`);
  }
  if (analyze) {
    console.log(esbuild.analyzeMetafileSync(metafile));
    fs.writeFileSync("esbuild.meta.json", JSON.stringify(metafile));
  }
}

const options = {
  entryPoints: ["src/web/client/root.tsx"],
  bundle: true,
  minify: isProduction,
  entryNames: "[dir]/Root.[hash]",
  metafile: true,
  outdir: OUT_DIR,
  publicPath: "/",
  plugins: [
    printStatsPlugin,
    clear,
    definePlugin({
      COMMIT_HASH: getHash(),
      BUILD_DATE: new Date().toString(),
      DEFAULT_EXPERIMENTAL_MODE: !isProduction,
    }),
    htmlPlugin({
      files: [
        {
          entryPoints: ["src/web/client/root.tsx"],
          filename: "index.html",
          htmlTemplate: "./src/web/client/root.html",
          scriptLoading: "defer",
        },
      ],
    }),
  ],
};

async function runWatch() {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Started esbuild watch!");
}

if (watch) {
  runWatch().catch(console.warn);
} else {
  esbuild.build(options).catch(console.warn);
}
