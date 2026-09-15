import * as fs from "fs";
import * as path from "path";

export type V2AssetName = "v2.js" | "v2.css";
export type V2AssetManifest = Partial<Record<V2AssetName, string>>;

let cachedManifest: V2AssetManifest | undefined;
let cachedManifestMtime = 0;
let cachedCriticalCss: string | undefined;
let cachedCriticalCssMtime = 0;
let cachedCriticalJs: string | undefined;
let cachedCriticalJsMtime = 0;

const MANIFEST_PATH = path.resolve(process.cwd(), "build/v2/manifest.json");
const CRITICAL_CSS_PATH = path.resolve(process.cwd(), "build/v2/critical.css");
const CRITICAL_JS_PATH = path.resolve(process.cwd(), "build/v2/critical.js");

function loadManifest(): V2AssetManifest {
  try {
    const stat = fs.statSync(MANIFEST_PATH);
    if (cachedManifest !== undefined && stat.mtimeMs === cachedManifestMtime) {
      return cachedManifest;
    }
    const raw: unknown = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const parsed: V2AssetManifest = {};
    if (typeof raw === "object" && raw !== null) {
      if ("v2.js" in raw && typeof raw["v2.js"] === "string") {
        parsed["v2.js"] = raw["v2.js"];
      }
      if ("v2.css" in raw && typeof raw["v2.css"] === "string") {
        parsed["v2.css"] = raw["v2.css"];
      }
    }
    cachedManifest = parsed;
    cachedManifestMtime = stat.mtimeMs;
    return parsed;
  } catch {
    return cachedManifest ?? { "v2.js": "v2.js", "v2.css": "v2.css" };
  }
}

/** Resolves the content-hashed URL for a UI V2 asset; falls back gracefully if not yet built. */
export function getV2AssetHref(name: V2AssetName): string {
  const filename = loadManifest()[name] ?? name;
  return `/v2/assets/${filename}`;
}

export function getV2CriticalCss(): string {
  try {
    const stat = fs.statSync(CRITICAL_CSS_PATH);
    if (
      cachedCriticalCss !== undefined &&
      stat.mtimeMs === cachedCriticalCssMtime
    ) {
      return cachedCriticalCss;
    }
    cachedCriticalCss = fs.readFileSync(CRITICAL_CSS_PATH, "utf8");
    cachedCriticalCssMtime = stat.mtimeMs;
    return cachedCriticalCss;
  } catch {
    return cachedCriticalCss ?? "";
  }
}

export function getV2CriticalJs(): string {
  try {
    const stat = fs.statSync(CRITICAL_JS_PATH);
    if (
      cachedCriticalJs !== undefined &&
      stat.mtimeMs === cachedCriticalJsMtime
    ) {
      return cachedCriticalJs;
    }
    cachedCriticalJs = fs.readFileSync(CRITICAL_JS_PATH, "utf8");
    cachedCriticalJsMtime = stat.mtimeMs;
    return cachedCriticalJs;
  } catch {
    return cachedCriticalJs ?? "";
  }
}
