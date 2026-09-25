import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

export interface V2BundleBudget {
  readonly maxJsRawBytes: number;
  readonly maxJsGzipBytes: number;
  readonly maxCssRawBytes: number;
  readonly maxCssGzipBytes: number;
  readonly maxCombinedRawBytes: number;
  readonly maxCombinedGzipBytes: number;
}

/**
 * Production bundle size budget for UI V2 assets (minified). Sizes are KiB.
 *
 * Current baseline (2026-09-25, after reader swipe navigation):
 *   v2_bundle.js: 118.8 kB raw / 32.9 kB gzip
 *   v2.css:       114.9 kB raw / 19.1 kB gzip
 *   Combined:     233.7 kB raw / 52.0 kB gzip
 *
 * Ceilings provide headroom to absorb routine fixes and features without
 * false positives, while hard-blocking major regressions or accidental imports
 * (e.g. un-tree-shaken heavy modules).
 *
 * The JS ceilings were raised on 2026-09-25 (from 115 / 32) after the reader
 * wake lock pushed the single shared bundle over. Everything still ships as
 * one bundle to every page; see "Bundle splitting strategy" in
 * src/web/v2/CODE_HEALTH.md before raising these again.
 */
export const V2_BUNDLE_BUDGET: V2BundleBudget = {
  maxJsRawBytes: 125 * 1024,
  maxJsGzipBytes: 35 * 1024,
  maxCssRawBytes: 125 * 1024,
  maxCssGzipBytes: 22 * 1024,
  maxCombinedRawBytes: 245 * 1024,
  maxCombinedGzipBytes: 55 * 1024,
};

export interface V2AssetSizeInfo {
  readonly file: string;
  readonly rawBytes: number;
  readonly gzipBytes: number;
}

export interface V2BundleSizeReport {
  readonly js?: V2AssetSizeInfo;
  readonly css?: V2AssetSizeInfo;
  readonly combinedRawBytes: number;
  readonly combinedGzipBytes: number;
  readonly exceeded: boolean;
  readonly errors: readonly string[];
}

export interface V2AssetManifestInput {
  readonly "v2.js"?: string;
  readonly "v2.css"?: string;
}

function checkAssetBudget(
  outDir: string,
  label: "JS" | "CSS",
  manifestKey: "v2.js" | "v2.css",
  filename: string | undefined,
  maxRawBytes: number,
  maxGzipBytes: number,
  errors: string[]
): V2AssetSizeInfo | undefined {
  if (!filename) {
    errors.push(`Manifest missing '${manifestKey}' entry`);
    return undefined;
  }

  const assetPath = path.join(outDir, filename);
  if (!fs.existsSync(assetPath)) {
    errors.push(`${label} asset not found on disk: ${assetPath}`);
    return undefined;
  }

  const content = fs.readFileSync(assetPath);
  const rawBytes = content.byteLength;
  const gzipBytes = zlib.gzipSync(content).byteLength;

  if (rawBytes > maxRawBytes) {
    errors.push(
      `${label} raw size ${(rawBytes / 1024).toFixed(1)} kB exceeds budget ${(
        maxRawBytes / 1024
      ).toFixed(1)} kB`
    );
  }
  if (gzipBytes > maxGzipBytes) {
    errors.push(
      `${label} gzip size ${(gzipBytes / 1024).toFixed(1)} kB exceeds budget ${(
        maxGzipBytes / 1024
      ).toFixed(1)} kB`
    );
  }

  return { file: filename, rawBytes, gzipBytes };
}

/**
 * Evaluates the built UI V2 assets on disk against the bundle budget.
 */
export function checkV2BundleBudget(
  outDir: string,
  manifest: V2AssetManifestInput,
  budget: V2BundleBudget = V2_BUNDLE_BUDGET
): V2BundleSizeReport {
  const errors: string[] = [];

  const js = checkAssetBudget(
    outDir,
    "JS",
    "v2.js",
    manifest["v2.js"],
    budget.maxJsRawBytes,
    budget.maxJsGzipBytes,
    errors
  );

  const css = checkAssetBudget(
    outDir,
    "CSS",
    "v2.css",
    manifest["v2.css"],
    budget.maxCssRawBytes,
    budget.maxCssGzipBytes,
    errors
  );

  const combinedRawBytes = (js?.rawBytes ?? 0) + (css?.rawBytes ?? 0);
  const combinedGzipBytes = (js?.gzipBytes ?? 0) + (css?.gzipBytes ?? 0);

  if (combinedRawBytes > budget.maxCombinedRawBytes) {
    errors.push(
      `Combined raw size ${(combinedRawBytes / 1024).toFixed(
        1
      )} kB exceeds budget ${(budget.maxCombinedRawBytes / 1024).toFixed(1)} kB`
    );
  }
  if (combinedGzipBytes > budget.maxCombinedGzipBytes) {
    errors.push(
      `Combined gzip size ${(combinedGzipBytes / 1024).toFixed(
        1
      )} kB exceeds budget ${(budget.maxCombinedGzipBytes / 1024).toFixed(
        1
      )} kB`
    );
  }

  return {
    js,
    css,
    combinedRawBytes,
    combinedGzipBytes,
    exceeded: errors.length > 0,
    errors,
  };
}

export function formatV2BundleSizeReport(
  report: V2BundleSizeReport,
  budget: V2BundleBudget = V2_BUNDLE_BUDGET
): string {
  const jsStr = report.js
    ? `${(report.js.rawBytes / 1024).toFixed(1)} kB raw / ${(
        report.js.gzipBytes / 1024
      ).toFixed(1)} kB gzip`
    : "missing";
  const cssStr = report.css
    ? `${(report.css.rawBytes / 1024).toFixed(1)} kB raw / ${(
        report.css.gzipBytes / 1024
      ).toFixed(1)} kB gzip`
    : "missing";
  const combStr = `${(report.combinedRawBytes / 1024).toFixed(1)} kB raw / ${(
    report.combinedGzipBytes / 1024
  ).toFixed(1)} kB gzip`;

  const lines = [
    "UI V2 Bundle Budget (Minified):",
    `  JS:       ${jsStr.padEnd(28)} (budget: < ${(
      budget.maxJsRawBytes / 1024
    ).toFixed(1)} kB raw / < ${(budget.maxJsGzipBytes / 1024).toFixed(
      1
    )} kB gzip)`,
    `  CSS:      ${cssStr.padEnd(28)} (budget: < ${(
      budget.maxCssRawBytes / 1024
    ).toFixed(1)} kB raw / < ${(budget.maxCssGzipBytes / 1024).toFixed(
      1
    )} kB gzip)`,
    `  Combined: ${combStr.padEnd(28)} (budget: < ${(
      budget.maxCombinedRawBytes / 1024
    ).toFixed(1)} kB raw / < ${(budget.maxCombinedGzipBytes / 1024).toFixed(
      1
    )} kB gzip)`,
  ];
  return lines.join("\n");
}
