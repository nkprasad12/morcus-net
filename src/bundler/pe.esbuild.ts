import * as esbuild from "esbuild";
import * as path from "path";

export async function buildPeBundle(minify: boolean = false): Promise<void> {
  const outDir = path.resolve(process.cwd(), "build/pe");
  await esbuild.build({
    entryPoints: [
      path.resolve(process.cwd(), "src/web/pe/client/pe_bundle.ts"),
    ],
    bundle: true,
    format: "esm",
    target: "es2020",
    minify,
    outfile: path.join(outDir, "pe.js"),
    sourcemap: true,
  });
}

if (require.main === module) {
  buildPeBundle(process.argv.includes("--minify"))
    .then(() => console.log("Built build/pe/pe.js successfully."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
