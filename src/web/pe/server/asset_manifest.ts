import * as fs from "fs";
import * as path from "path";

type PeAssetName = "pe.js" | "pe.css";
type PeAssetManifest = Partial<Record<PeAssetName, string>>;

let cachedManifest: PeAssetManifest | undefined;

function loadManifest(): PeAssetManifest {
  if (cachedManifest === undefined) {
    const manifestPath = path.resolve(process.cwd(), "build/pe/manifest.json");
    const parsed: PeAssetManifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf8")
    );
    cachedManifest = parsed;
    return parsed;
  }
  return cachedManifest;
}

/** Resolves the content-hashed URL for a PE asset; throws if `build/pe` hasn't been built (see `--build_pe`). */
export function getPeAssetHref(name: PeAssetName): string {
  const filename = loadManifest()[name];
  if (!filename) {
    throw new Error(`No entry for "${name}" in build/pe/manifest.json`);
  }
  return `/pe/assets/${filename}`;
}
