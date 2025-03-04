/* istanbul ignore file */

import fs from "fs";

export interface BundleOptions {
  minify: boolean;
  watch: boolean;
  analyzeBundle: boolean;
  typeCheck: boolean;
  compress: boolean;
}

export namespace BundleOptions {
  export function get(): BundleOptions {
    return {
      minify: process.env.MINIFY === "1",
      watch: process.env.WATCH === "1",
      analyzeBundle: process.env.ANALYZE_BUNDLE === "1",
      typeCheck: process.env.RUN_TSC === "1",
      compress: process.env.COMPRESS === "1",
    };
  }
}

export function getHash(): string {
  const hash = fs.readFileSync("build/morcusnet.commit.txt").toString();
  console.log(`Client commit hash: "${hash}"`);
  return hash;
}
