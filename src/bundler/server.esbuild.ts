/* istanbul ignore file */

import esbuild from "esbuild";
import { BundleOptions } from "@/bundler/utils";
import { printStatsPlugin, typeCheckPlugin } from "@/bundler/esbuild_plugins";
import { runBundler } from "@/bundler/run_esbuild";

const OUT_FILE = "build/server.js";
const ENTRY_POINT = "src/start_server.ts";

const envOptions = BundleOptions.get();

const options: esbuild.BuildOptions = {
  entryPoints: [ENTRY_POINT],
  bundle: true,
  platform: "node",
  external: ["bun:sqlite"],
  outfile: OUT_FILE,
  define: {
    "process.env.MAIN": '"start"',
  },
  plugins: [printStatsPlugin(envOptions)].concat(
    envOptions.typeCheck ? typeCheckPlugin(envOptions) : []
  ),
};

runBundler(options, envOptions);
