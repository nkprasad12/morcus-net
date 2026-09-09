import * as fs from "fs";
import * as path from "path";

export type V2AssetName = "v2.js" | "v2.css";
export type V2AssetManifest = Partial<Record<V2AssetName, string>>;

let cachedManifest: V2AssetManifest | undefined;
let cachedCriticalCss: string | undefined;
let cachedCriticalJs: string | undefined;

function loadManifest(): V2AssetManifest {
  if (cachedManifest !== undefined) {
    const jsFilename = cachedManifest["v2.js"];
    const cssFilename = cachedManifest["v2.css"];
    if (
      (jsFilename &&
        !fs.existsSync(path.resolve(process.cwd(), "build/v2", jsFilename))) ||
      (cssFilename &&
        !fs.existsSync(path.resolve(process.cwd(), "build/v2", cssFilename)))
    ) {
      cachedManifest = undefined;
    }
  }
  if (cachedManifest === undefined) {
    const manifestPath = path.resolve(process.cwd(), "build/v2/manifest.json");
    try {
      const parsed: V2AssetManifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8")
      );
      cachedManifest = parsed;
      return parsed;
    } catch {
      return { "v2.js": "v2.js", "v2.css": "v2.css" };
    }
  }
  return cachedManifest;
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
