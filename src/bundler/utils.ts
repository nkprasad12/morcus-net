/* istanbul ignore file */

export interface BundleOptions {
  minify: boolean;
  watch: boolean;
  analyzeBundle: boolean;
  typeCheck: boolean;
}

export namespace BundleOptions {
  export function get(): BundleOptions {
    return {
      minify: process.env.MINIFY === "1",
      watch: process.env.WATCH === "1",
      analyzeBundle: process.env.ANALYZE_BUNDLE === "1",
      typeCheck: process.env.RUN_TSC === "1",
    };
  }
}
