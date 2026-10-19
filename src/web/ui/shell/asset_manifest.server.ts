import * as fs from "fs";
import * as path from "path";
import {
  V2_ASSET_NAMES,
  getV2BuildDir,
  type V2AssetManifest,
  type V2AssetName,
} from "@/bundler/client_build_contract";

let cachedManifest: V2AssetManifest | undefined;
let cachedManifestMtime = 0;
let cachedCriticalCss: string | undefined;
let cachedCriticalCssMtime = 0;
let cachedCriticalJs: string | undefined;
let cachedCriticalJsMtime = 0;

function buildFile(name: string): string {
  return path.join(getV2BuildDir(), name);
}

function loadManifest(): V2AssetManifest {
  try {
    const manifestPath = buildFile("manifest.json");
    const stat = fs.statSync(manifestPath);
    if (cachedManifest !== undefined && stat.mtimeMs === cachedManifestMtime) {
      return cachedManifest;
    }
    const raw: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const parsed: V2AssetManifest = {};
    if (typeof raw === "object" && raw !== null) {
      for (const assetName of V2_ASSET_NAMES) {
        const val: unknown = Reflect.get(raw, assetName);
        if (typeof val === "string") {
          parsed[assetName] = val;
        }
      }
    }
    cachedManifest = parsed;
    cachedManifestMtime = stat.mtimeMs;
    return parsed;
  } catch {
    // Not built yet: `getV2AssetHref` falls back to the unhashed names.
    return cachedManifest ?? {};
  }
}

/** Resolves the content-hashed URL for a UI V2 asset; falls back gracefully if not yet built. */
export function getV2AssetHref(name: V2AssetName): string {
  const filename = loadManifest()[name] ?? name;
  return `/assets/${filename}`;
}

export function getV2CriticalCss(): string {
  try {
    const stat = fs.statSync(buildFile("critical.css"));
    if (
      cachedCriticalCss !== undefined &&
      stat.mtimeMs === cachedCriticalCssMtime
    ) {
      return cachedCriticalCss;
    }
    cachedCriticalCss = fs.readFileSync(buildFile("critical.css"), "utf8");
    cachedCriticalCssMtime = stat.mtimeMs;
    return cachedCriticalCss;
  } catch {
    return cachedCriticalCss ?? "";
  }
}

export function getV2CriticalJs(): string {
  try {
    const stat = fs.statSync(buildFile("critical.js"));
    if (
      cachedCriticalJs !== undefined &&
      stat.mtimeMs === cachedCriticalJsMtime
    ) {
      return cachedCriticalJs;
    }
    cachedCriticalJs = fs.readFileSync(buildFile("critical.js"), "utf8");
    cachedCriticalJsMtime = stat.mtimeMs;
    return cachedCriticalJs;
  } catch {
    return cachedCriticalJs ?? "";
  }
}
