import {
  createRsbuild,
  type RsbuildConfig,
  type RsbuildPlugin,
} from "@rsbuild/core";
import * as path from "path";
import * as fs from "fs";

// Logical asset name -> its emitted (content-hashed) filename under `build/v2`.
export type V2AssetManifest = Partial<Record<"v2.js" | "v2.css", string>>;

function v2ManifestPlugin(outDir: string): RsbuildPlugin {
  return {
    name: "v2-manifest-plugin",
    setup(api) {
      api.onAfterBuild(() => {
        const manifest: V2AssetManifest = {};
        if (!fs.existsSync(outDir)) return;

        const files = fs.readdirSync(outDir);
        for (const file of files) {
          if (file.startsWith("v2_bundle.") && file.endsWith(".js")) {
            manifest["v2.js"] = file;
          } else if (file.startsWith("v2.") && file.endsWith(".css")) {
            manifest["v2.css"] = file;
          }

          // Clean up 0-byte dummy js files produced by webpack/rspack for pure-CSS entries
          if (
            file.startsWith("v2.") &&
            (file.endsWith(".js") || file.endsWith(".js.map"))
          ) {
            fs.unlinkSync(path.join(outDir, file));
          }
        }

        fs.writeFileSync(
          path.join(outDir, "manifest.json"),
          JSON.stringify(manifest, null, 2)
        );
      });
    },
  };
}

export function getV2RsbuildConfig(minify: boolean = false): RsbuildConfig {
  const outDir = path.resolve(process.cwd(), "build/v2");

  return {
    source: {
      entry: {
        v2_bundle: "./src/web/v2/client/v2_bundle.ts",
        v2: "./src/web/v2/v2.css",
        critical: "./src/web/v2/client/critical.ts",
      },
    },
    output: {
      distPath: {
        root: outDir,
        js: "",
        css: "",
      },
      filename: {
        js: (pathData) => {
          return pathData.chunk && pathData.chunk.name === "critical"
            ? "critical.js"
            : "[name].[contenthash].js";
        },
        css: (pathData) => {
          return pathData.chunk && pathData.chunk.name === "critical"
            ? "critical.css"
            : "[name].[contenthash].css";
        },
      },
      cleanDistPath: true,
      minify,
      sourceMap: true,
    },
    server: {
      publicDir: false,
    },
    tools: {
      htmlPlugin: false,
    },
    plugins: [v2ManifestPlugin(outDir)],
  };
}

export async function buildV2Bundle(minify: boolean = false): Promise<void> {
  const rsbuild = await createRsbuild({
    rsbuildConfig: getV2RsbuildConfig(minify),
  });
  await rsbuild.build();
}

if (require.main === module) {
  buildV2Bundle(process.argv.includes("--minify"))
    .then(() => console.log("Built UI V2 assets successfully via Rsbuild."))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
