import * as fs from "fs";
import * as path from "path";

export type V2AssetName = "v2.js" | "v2.css";
export type V2AssetManifest = Partial<Record<V2AssetName, string>>;

let cachedManifest: V2AssetManifest | undefined;
let cachedCriticalCss: string | undefined;
let cachedCriticalJs: string | undefined;

const MANIFEST_PATH = path.resolve(process.cwd(), "build/v2/manifest.json");

function loadManifest(): V2AssetManifest {
  if (process.env.NODE_ENV === "test") {
    cachedManifest = undefined;
  }
  if (cachedManifest !== undefined) {
    return cachedManifest;
  }
  try {
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
    return parsed;
  } catch {
    return { "v2.js": "v2.js", "v2.css": "v2.css" };
  }
}

/** Resolves the content-hashed URL for a UI V2 asset; falls back gracefully if not yet built. */
export function getV2AssetHref(name: V2AssetName): string {
  const filename = loadManifest()[name] ?? name;
  return `/v2/assets/${filename}`;
}

export function getV2CriticalCss(): string {
  if (cachedCriticalCss === undefined) {
    const criticalCssPath = path.resolve(
      process.cwd(),
      "build/v2/critical.css"
    );
    try {
      cachedCriticalCss = fs.readFileSync(criticalCssPath, "utf8");
    } catch {
      return "";
    }
  }
  return cachedCriticalCss;
}

export function getV2CriticalJs(): string {
  if (cachedCriticalJs === undefined) {
    const criticalJsPath = path.resolve(process.cwd(), "build/v2/critical.js");
    try {
      cachedCriticalJs = fs.readFileSync(criticalJsPath, "utf8");
    } catch {
      return "";
    }
  }
  return cachedCriticalJs;
}
