import * as fs from "fs";
import * as path from "path";

export type V2AssetName = "v2.js" | "v2.css";
export type V2AssetManifest = Partial<Record<V2AssetName, string>>;

let cachedManifest: V2AssetManifest | undefined;
let cachedCriticalCss: string | undefined;

function loadManifest(): V2AssetManifest {
  if (cachedManifest !== undefined) {
    const jsFilename = cachedManifest["v2.js"];
    if (
      jsFilename &&
      !fs.existsSync(path.resolve(process.cwd(), "build/v2", jsFilename))
    ) {
      cachedManifest = undefined;
    }
  }
  if (cachedManifest === undefined) {
    const manifestPath = path.resolve(process.cwd(), "build/v2/manifest.json");
    const parsed: V2AssetManifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8")
    );
    cachedManifest = parsed;
    return parsed;
  }
  return cachedManifest;
}

/** Resolves the content-hashed URL for a UI V2 asset; throws if `build/v2` hasn't been built (see `--build_v2`). */
export function getV2AssetHref(name: V2AssetName): string {
  const filename = loadManifest()[name];
  if (!filename) {
    throw new Error(`No entry for "${name}" in build/v2/manifest.json`);
  }
  return `/v2/assets/${filename}`;
}

export function getV2CriticalCss(): string {
  if (cachedCriticalCss === undefined) {
    const criticalCssPath = path.resolve(
      process.cwd(),
      "build/v2/critical.css"
    );
    cachedCriticalCss = fs.readFileSync(criticalCssPath, "utf8");
  }
  return cachedCriticalCss;
}
