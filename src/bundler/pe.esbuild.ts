import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import { createCleanDir } from "@/utils/file_utils";

// Logical asset name -> its emitted (content-hashed) filename under `build/pe`.
type PeAssetManifest = Partial<Record<"pe.js" | "pe.css", string>>;

export async function buildPeBundle(minify: boolean = false): Promise<void> {
  const outDir = path.resolve(process.cwd(), "build/pe");
  const jsEntry = path.resolve(process.cwd(), "src/web/pe/client/pe_bundle.ts");
  const cssEntry = path.resolve(process.cwd(), "src/web/pe/pe.css");
  const criticalCssEntry = path.resolve(
    process.cwd(),
    "src/web/pe/pe-critical.css"
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

  const manifest: PeAssetManifest = {};
  for (const [outputPath, output] of Object.entries(metafile.outputs)) {
    if (output.entryPoint === jsEntryRelative) {
      manifest["pe.js"] = path.basename(outputPath);
    } else if (output.entryPoint === cssEntryRelative) {
      manifest["pe.css"] = path.basename(outputPath);
    }
  }
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}

if (require.main === module) {
  buildPeBundle(process.argv.includes("--minify"))
    .then(() => console.log("Built build/pe/pe.js successfully."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
