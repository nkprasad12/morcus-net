import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import { createCleanDir } from "@/utils/file_utils";

// Logical asset name -> its emitted (content-hashed) filename under `build/v2`.
type V2AssetManifest = Partial<Record<"v2.js" | "v2.css", string>>;

export async function buildV2Bundle(minify: boolean = false): Promise<void> {
  const outDir = path.resolve(process.cwd(), "build/v2");
  const jsEntry = path.resolve(process.cwd(), "src/web/v2/client/v2_bundle.ts");
  const cssEntry = path.resolve(process.cwd(), "src/web/v2/v2.css");
  const criticalCssEntry = path.resolve(
    process.cwd(),
    "src/web/v2/v2-critical.css"
  );

  // Avoid accumulating stale hashed assets from previous builds.
  await createCleanDir(outDir);

  const criticalCss = await esbuild.transform(
    fs.readFileSync(criticalCssEntry, "utf8"),
    { loader: "css", minify }
  );
  fs.writeFileSync(path.join(outDir, "critical.css"), criticalCss.code);

  const result = await esbuild.build({
    entryPoints: [jsEntry, cssEntry],
    bundle: true,
    format: "esm",
    target: "es2020",
    minify,
    outdir: outDir,
    entryNames: "[name]-[hash]",
    sourcemap: true,
    metafile: true,
  });

  writeManifest(result.metafile, outDir, { js: jsEntry, css: cssEntry });
}

function writeManifest(
  metafile: esbuild.Metafile,
  outDir: string,
  entries: { js: string; css: string }
): void {
  const jsEntryRelative = path.relative(process.cwd(), entries.js);
  const cssEntryRelative = path.relative(process.cwd(), entries.css);

  const manifest: V2AssetManifest = {};
  for (const [outputPath, output] of Object.entries(metafile.outputs)) {
    if (output.entryPoint === jsEntryRelative) {
      manifest["v2.js"] = path.basename(outputPath);
    } else if (output.entryPoint === cssEntryRelative) {
      manifest["v2.css"] = path.basename(outputPath);
    }
  }
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}

if (require.main === module) {
  buildV2Bundle(process.argv.includes("--minify"))
    .then(() => console.log("Built build/v2/v2.js successfully."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
