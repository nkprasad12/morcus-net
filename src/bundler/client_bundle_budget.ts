import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import {
  V2_JS_CHUNKS,
  V2_CHUNK_ENTRIES,
  V2_JS_ENTRY_NAMES,
  V2_ROUTES,
  v2RouteScripts,
  type V2AssetManifest,
  type V2AssetName,
  type V2JsChunkName,
  type V2JsEntryName,
  type V2Route,
} from "@/bundler/client_build_contract";

export interface V2ChunkBudget {
  readonly maxRawBytes: number;
  readonly maxGzipBytes: number;
}

export interface V2BundleBudget {
  readonly chunks: Readonly<Record<V2JsChunkName, V2ChunkBudget>>;
  /**
   * Total JS each route fetches (the sum of `v2RouteScripts(route)`). CSS is
   * left out because every route loads the same `app.css`, and the idle
   * `dict.js` prefetch on reader pages is left out because it isn't on the
   * critical path.
   */
  readonly routes: Readonly<Record<V2Route, V2ChunkBudget>>;
  readonly maxCssGzipBytes: number;
  readonly maxCriticalJsRawBytes: number;
  readonly maxCriticalJsGzipBytes: number;
}

/**
 * Maximum allowed raw and gzip-compressed asset sizes (in bytes) for UI V2.
 *
 * Enforced on minified production builds (`client.rsbuild.ts --minify`) and in E2E
 * bundle validation (`browser_e2e.test.ts`).
 *
 * Per-chunk ceilings provide small headroom to absorb routine fixes without
 * false positives while blocking major regressions or accidental imports (e.g.
 * un-tree-shaken heavy modules). Per-route ceilings sit slightly below the sum
 * of each route's chunk ceilings so several chunks drifting up together still
 * trip a check.
 */
export const V2_BUNDLE_BUDGET: V2BundleBudget = {
  chunks: {
    "common.js": {
      // Raised from 60 / 20.5 for the app-wide Appearance menu (#598), then
      // from 61.5 / 21 when it took over the anchored dialog from reader.js.
      maxRawBytes: 62.5 * 1024,
      maxGzipBytes: 21.5 * 1024,
    },
    "reader.js": {
      // Lowered from 50 / 14 when the reader dialogs moved to native <dialog>,
      // then from 46 / 13.5 when the anchored dialog moved to common.js. Gzip
      // raised back to 13.5 for the library's saved-spot controls and "In
      // progress" filter (the library view ships in this chunk).
      maxRawBytes: 44 * 1024,
      maxGzipBytes: 13.5 * 1024,
    },
    "dict.js": {
      maxRawBytes: 32 * 1024,
      maxGzipBytes: 10 * 1024,
    },
    "corpus.js": {
      maxRawBytes: 20 * 1024,
      maxGzipBytes: 7 * 1024,
    },
    "external.js": {
      maxRawBytes: 12 * 1024,
      maxGzipBytes: 5 * 1024,
    },
    "macronizer.js": {
      maxRawBytes: 16 * 1024,
      maxGzipBytes: 6 * 1024,
    },
  },
  routes: {
    // Raised for the Appearance menu in common.js (#598): about, corpus and
    // macronizer. Library and external were lowered again (below their
    // originals) when the reader dialogs moved to native <dialog>. About and
    // dicts were raised again when the anchored dialog moved to common.js and
    // the highlight slider returned to the dictionary settings.
    about: { maxRawBytes: 62.5 * 1024, maxGzipBytes: 21.5 * 1024 },
    dicts: { maxRawBytes: 90 * 1024, maxGzipBytes: 30.5 * 1024 },
    corpus: { maxRawBytes: 77.5 * 1024, maxGzipBytes: 27 * 1024 },
    library: { maxRawBytes: 104 * 1024, maxGzipBytes: 34 * 1024 },
    external: { maxRawBytes: 114 * 1024, maxGzipBytes: 38 * 1024 },
    macronizer: { maxRawBytes: 76.5 * 1024, maxGzipBytes: 26 * 1024 },
  },
  maxCssGzipBytes: 25 * 1024,
  // critical.js is a fixed-size pre-paint applier (core/dom/prepaint.client.ts):
  // owners in the bundle compute values and it only copies them, so adding a
  // pre-paint preference must not grow it (~300 B raw / ~237 B gzip). Do not
  // raise these to fit per-preference logic; move that logic into the owner
  // instead (see "Pre-paint is a scarce budget" in src/web/ui/docs/PREFERENCES.md).
  maxCriticalJsRawBytes: 450,
  maxCriticalJsGzipBytes: 350,
};

/** Fixed (unhashed) filename of the inlined critical script. */
export const CRITICAL_JS_FILE = "critical.js";

export interface V2AssetSizeInfo {
  readonly file: string;
  readonly rawBytes: number;
  readonly gzipBytes: number;
}

export interface V2SizeTotal {
  readonly rawBytes: number;
  readonly gzipBytes: number;
}

/**
 * Sums the sizes of the chunks `route` loads, or `undefined` if any of them
 * is missing from `chunks`.
 */
export function sumRouteSizes(
  route: V2Route,
  chunks: Partial<Record<V2JsChunkName, V2SizeTotal>>
): V2SizeTotal | undefined {
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const chunkName of v2RouteScripts(route)) {
    const info = chunks[chunkName];
    if (!info) return undefined;
    rawBytes += info.rawBytes;
    gzipBytes += info.gzipBytes;
  }
  return { rawBytes, gzipBytes };
}

export interface V2BundleSizeReport {
  readonly chunks: Partial<Record<V2JsChunkName, V2AssetSizeInfo>>;
  /** Missing for a route when one of its chunks is missing. */
  readonly routes: Partial<Record<V2Route, V2SizeTotal>>;
  readonly css?: V2AssetSizeInfo;
  /** Not part of the fetched chunks: it's inlined, not fetched. */
  readonly criticalJs?: V2AssetSizeInfo;
  readonly totalJsRawBytes: number;
  readonly totalJsGzipBytes: number;
  readonly exceeded: boolean;
  readonly errors: readonly string[];
}

/** Bytes below 1 KiB (the critical script), KiB with one decimal above. */
function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}

function checkAssetBudget(
  outDir: string,
  label: string,
  manifestKey: V2AssetName | "critical.js",
  filename: string | undefined,
  limits: { readonly maxRawBytes?: number; readonly maxGzipBytes: number },
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

  if (limits.maxRawBytes !== undefined && rawBytes > limits.maxRawBytes) {
    errors.push(
      `${label} raw size ${formatSize(rawBytes)} exceeds budget ${formatSize(
        limits.maxRawBytes
      )}`
    );
  }
  if (gzipBytes > limits.maxGzipBytes) {
    errors.push(
      `${label} gzip size ${formatSize(gzipBytes)} exceeds budget ${formatSize(
        limits.maxGzipBytes
      )}`
    );
  }

  return { file: filename, rawBytes, gzipBytes };
}

/**
 * Evaluates the built UI V2 assets on disk against the bundle budget.
 */
export function checkV2BundleBudget(
  outDir: string,
  manifest: V2AssetManifest,
  budget: V2BundleBudget = V2_BUNDLE_BUDGET
): V2BundleSizeReport {
  const errors: string[] = [];
  const chunks: Partial<Record<V2JsChunkName, V2AssetSizeInfo>> = {};
  let totalJsRawBytes = 0;
  let totalJsGzipBytes = 0;

  for (const chunkName of V2_JS_CHUNKS) {
    const chunkBudget = budget.chunks[chunkName];
    const info = checkAssetBudget(
      outDir,
      chunkName,
      chunkName,
      manifest[chunkName],
      chunkBudget,
      errors
    );
    if (info) {
      chunks[chunkName] = info;
      totalJsRawBytes += info.rawBytes;
      totalJsGzipBytes += info.gzipBytes;
    }
  }

  const routes: Partial<Record<V2Route, V2SizeTotal>> = {};
  for (const route of V2_ROUTES) {
    const total = sumRouteSizes(route, chunks);
    if (!total) continue;
    routes[route] = total;
    const routeBudget = budget.routes[route];
    const label = `Route '${route}' (${v2RouteScripts(route).join(" + ")})`;
    if (total.rawBytes > routeBudget.maxRawBytes) {
      errors.push(
        `${label} raw total ${formatSize(
          total.rawBytes
        )} exceeds budget ${formatSize(routeBudget.maxRawBytes)}`
      );
    }
    if (total.gzipBytes > routeBudget.maxGzipBytes) {
      errors.push(
        `${label} gzip total ${formatSize(
          total.gzipBytes
        )} exceeds budget ${formatSize(routeBudget.maxGzipBytes)}`
      );
    }
  }

  const css = checkAssetBudget(
    outDir,
    "CSS",
    "app.css",
    manifest["app.css"],
    { maxGzipBytes: budget.maxCssGzipBytes },
    errors
  );

  const criticalJs = checkAssetBudget(
    outDir,
    "Critical JS",
    "critical.js",
    CRITICAL_JS_FILE,
    {
      maxRawBytes: budget.maxCriticalJsRawBytes,
      maxGzipBytes: budget.maxCriticalJsGzipBytes,
    },
    errors
  );

  return {
    chunks,
    routes,
    css,
    criticalJs,
    totalJsRawBytes,
    totalJsGzipBytes,
    exceeded: errors.length > 0,
    errors,
  };
}

export function formatV2BundleSizeReport(
  report: V2BundleSizeReport,
  budget: V2BundleBudget = V2_BUNDLE_BUDGET
): string {
  const lines = ["UI V2 Bundle Budget (Minified):"];

  for (const chunkName of V2_JS_CHUNKS) {
    const info = report.chunks[chunkName];
    const chunkBudget = budget.chunks[chunkName];
    const sizeStr = info
      ? `${(info.rawBytes / 1024).toFixed(1)} kB raw / ${(
          info.gzipBytes / 1024
        ).toFixed(1)} kB gzip`
      : "missing";
    lines.push(
      `  ${(chunkName + ":").padEnd(13)} ${sizeStr.padEnd(28)} (budget: < ${(
        chunkBudget.maxRawBytes / 1024
      ).toFixed(1)} kB raw / < ${(chunkBudget.maxGzipBytes / 1024).toFixed(
        1
      )} kB gzip)`
    );
  }

  lines.push("  Per-route JS:");
  for (const route of V2_ROUTES) {
    const total = report.routes[route];
    const routeBudget = budget.routes[route];
    const sizeStr = total
      ? `${(total.rawBytes / 1024).toFixed(1)} kB raw / ${(
          total.gzipBytes / 1024
        ).toFixed(1)} kB gzip`
      : "missing";
    lines.push(
      `    ${(route + ":").padEnd(11)} ${sizeStr.padEnd(28)} (budget: < ${(
        routeBudget.maxRawBytes / 1024
      ).toFixed(1)} kB raw / < ${(routeBudget.maxGzipBytes / 1024).toFixed(
        1
      )} kB gzip)`
    );
  }

  const cssStr = report.css
    ? `${(report.css.rawBytes / 1024).toFixed(1)} kB raw / ${(
        report.css.gzipBytes / 1024
      ).toFixed(1)} kB gzip`
    : "missing";
  lines.push(
    `  ${"CSS:".padEnd(13)} ${cssStr.padEnd(28)} (budget: < ${(
      budget.maxCssGzipBytes / 1024
    ).toFixed(1)} kB gzip)`
  );

  const criticalStr = report.criticalJs
    ? `${formatSize(report.criticalJs.rawBytes)} raw / ${formatSize(
        report.criticalJs.gzipBytes
      )} gzip`
    : "missing";
  lines.push(
    `  ${"Critical:".padEnd(13)} ${criticalStr.padEnd(
      28
    )} (budget: <= ${formatSize(
      budget.maxCriticalJsRawBytes
    )} raw / <= ${formatSize(budget.maxCriticalJsGzipBytes)} gzip, inlined)`
  );

  return lines.join("\n");
}

interface RspackStatsModuleLike {
  readonly name?: string;
  readonly nameForCondition?: string;
  readonly identifier?: string;
  readonly moduleType?: string;
  readonly modules?: readonly RspackStatsModuleLike[];
}

interface RspackStatsChunkLike {
  readonly names?: readonly string[];
  readonly modules?: readonly RspackStatsModuleLike[];
}

export interface RspackStatsCompilationLike {
  readonly chunks?: readonly RspackStatsChunkLike[];
}

function collectLeafSourceModules(
  modules: readonly RspackStatsModuleLike[] | undefined,
  into: Set<string>
): void {
  if (!modules) return;
  for (const mod of modules) {
    if (mod.modules && mod.modules.length > 0) {
      collectLeafSourceModules(mod.modules, into);
      continue;
    }
    if (
      mod.moduleType === "runtime" ||
      mod.moduleType?.startsWith("css") ||
      mod.name?.startsWith("webpack/runtime/")
    ) {
      continue;
    }
    const rawId = mod.nameForCondition ?? mod.name ?? mod.identifier;
    if (!rawId) continue;
    // Ignore concatenated summary headers if leaf modules were not expanded
    if (rawId.includes(" + ") && rawId.endsWith(" modules")) continue;
    if (rawId.endsWith(".css")) continue;
    into.add(rawId);
  }
}

/**
 * Verifies that Rspack's `dependOn` chunk graph produces every expected JS
 * entry chunk (`V2_JS_ENTRY_NAMES`) and that no source module is duplicated
 * across multiple JS chunks.
 *
 * Why this guardrail is needed: Rspack's `dependOn: "common"` only deduplicates
 * modules that are reachable from `common` through a used import (a bare
 * import of a side-effect-free module doesn't count). If two feature chunks
 * import a shared helper that `common` doesn't use, Rspack silently
 * duplicates that helper into both feature chunks unless caught here. The
 * fix is to list it in the ancestor's `V2ChunkEntrySpec.shared`.
 */
export function checkV2ChunkDuplication(stats: RspackStatsCompilationLike): {
  chunkModules: Record<V2JsEntryName, string[]>;
  errors: string[];
} {
  const errors: string[] = [];
  const chunkModules: Record<V2JsEntryName, string[]> = {
    common: [],
    reader: [],
    dict: [],
    corpus: [],
    external: [],
    macronizer: [],
  };
  const moduleToChunks = new Map<string, V2JsEntryName[]>();

  const chunks = stats.chunks ?? [];
  const seenEntries = new Set<V2JsEntryName>();

  for (const chunk of chunks) {
    const entryName = V2_JS_ENTRY_NAMES.find((n) => chunk.names?.includes(n));
    if (!entryName) continue;
    seenEntries.add(entryName);

    const leafSet = new Set<string>();
    collectLeafSourceModules(chunk.modules, leafSet);
    const sorted = [...leafSet].sort();
    chunkModules[entryName] = sorted;

    if (sorted.length === 0) {
      errors.push(`Chunk '${entryName}' contains 0 source modules.`);
    }

    for (const modPath of sorted) {
      let owners = moduleToChunks.get(modPath);
      if (!owners) {
        owners = [];
        moduleToChunks.set(modPath, owners);
      }
      owners.push(entryName);
    }
  }

  for (const entryName of V2_JS_ENTRY_NAMES) {
    if (!seenEntries.has(entryName)) {
      errors.push(`Expected JS chunk '${entryName}' missing from build stats.`);
    }
  }

  for (const [modPath, owners] of moduleToChunks.entries()) {
    if (owners.length > 1) {
      const ancestor = nearestCommonAncestor(owners);
      errors.push(
        `Module '${modPath}' is duplicated across chunks [${owners.join(
          ", "
        )}]. Add it to \`V2_CHUNK_ENTRIES.${ancestor}.shared\` in ` +
          `src/bundler/client_build_contract.ts (${ancestor} is the nearest ` +
          `entry every one of these chunks depends on), so it is an entry ` +
          `module of ${ancestor}.js and ships once. An \`import\` from ` +
          `'${V2_CHUNK_ENTRIES[ancestor].import}' is not enough: Rspack ` +
          `drops imports of side-effect-free modules whose exports that ` +
          `chunk doesn't use.`
      );
    }
  }

  return { chunkModules, errors };
}

/** `entry` followed by each of its `dependOn` ancestors, nearest first. */
function dependOnChain(entry: V2JsEntryName): V2JsEntryName[] {
  const chain: V2JsEntryName[] = [];
  let cursor: V2JsEntryName | undefined = entry;
  while (cursor !== undefined) {
    chain.push(cursor);
    cursor = V2_CHUNK_ENTRIES[cursor].dependOn;
  }
  return chain;
}

/**
 * The nearest entry that every chunk in `owners` depends on (or is). Falls
 * back to `common`, the root of the graph.
 */
function nearestCommonAncestor(
  owners: readonly V2JsEntryName[]
): V2JsEntryName {
  const [first, ...rest] = owners;
  const others = rest.map((o) => new Set(dependOnChain(o)));
  return (
    dependOnChain(first).find((c) => others.every((s) => s.has(c))) ?? "common"
  );
}
