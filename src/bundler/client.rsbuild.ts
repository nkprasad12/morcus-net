/* istanbul ignore file */

import {
  createRsbuild,
  type RsbuildConfig,
  type RsbuildPlugin,
} from "@rsbuild/core";
import * as fs from "fs";
import * as path from "path";
import { V2_BROWSERSLIST } from "@/web/ui/browser_targets.common";
import {
  checkV2BundleBudget,
  checkV2ChunkDuplication,
  formatV2BundleSizeReport,
} from "@/bundler/client_bundle_budget";
import {
  V2_CHUNK_ENTRIES,
  V2_JS_ENTRY_NAMES,
  getV2BuildDir,
  type V2AssetManifest,
} from "@/bundler/client_build_contract";
import { compressOutputs } from "@/bundler/plugin_utils";

/**
 * Rsbuild plugin that writes `build/client/manifest.json` mapping logical asset
 * names (`common.js`, `dict.js`, `reader.js`, `external.js`, `corpus.js`,
 * `app.css`) to their content-hashed output filenames, removes the dummy JS
 * stub emitted for the standalone `app.css` entry, enforces zero module
 * duplication across `dependOn` chunks, (when `minify` is enabled) enforces
 * the V2 bundle size budget (`client_bundle_budget.ts`), and (when `precompress`
 * is enabled) writes `.br` / `.gz` siblings of every manifest asset.
 */
function v2ManifestPlugin(
  outputDir: string,
  enforceBudget: boolean,
  precompress: boolean
): RsbuildPlugin {
  return {
    name: "morcus:v2-manifest",
    setup(api) {
      api.onAfterBuild(async ({ stats }) => {
        if (!fs.existsSync(outputDir)) {
          return;
        }
        const files = fs.readdirSync(outputDir);
        const manifest: V2AssetManifest = {};

        for (const file of files) {
          for (const entryName of V2_JS_ENTRY_NAMES) {
            if (file.startsWith(`${entryName}.`) && file.endsWith(".js")) {
              manifest[`${entryName}.js`] = file;
            }
          }
          if (file.startsWith("app.") && file.endsWith(".css")) {
            manifest["app.css"] = file;
          } else if (file.startsWith("app.") && file.endsWith(".js")) {
            // Remove the dummy JS file Rsbuild emits for the standalone app.css entry
            fs.unlinkSync(path.join(outputDir, file));
          }
        }

        fs.writeFileSync(
          path.join(outputDir, "manifest.json"),
          JSON.stringify(manifest, null, 2) + "\n"
        );

        if (stats) {
          const statsJson = stats.toJson({
            chunks: true,
            chunkModules: true,
            nestedModules: true,
          });
          const dupCheck = checkV2ChunkDuplication(statsJson);
          if (dupCheck.errors.length > 0) {
            throw new Error(
              `UI V2 chunk duplication check failed:\n  - ${dupCheck.errors.join(
                "\n  - "
              )}`
            );
          }
        }

        if (enforceBudget) {
          const report = checkV2BundleBudget(outputDir, manifest);
          console.log(formatV2BundleSizeReport(report));
          if (report.exceeded) {
            throw new Error(
              `UI V2 bundle budget check failed:\n  - ${report.errors.join(
                "\n  - "
              )}`
            );
          }
        }

        if (precompress) {
          // Only the hashed assets the browser fetches: `critical.*` is
          // inlined into `<head>`, and `manifest.json` is never served.
          await compressOutputs(
            Object.values(manifest).map((file) => path.join(outputDir, file))
          );
        }
      });
    },
  };
}

interface V2BuildOptions {
  /**
   * Write `.br` / `.gz` siblings of each hashed asset for
   * `preCompressedMiddleware` (`web/web_server.ts`). Defaults to `minify`: every minified
   * build (production and `./morcus.sh web`) is precompressed.
   */
  precompress?: boolean;
}

function createV2RsbuildConfig(
  minify: boolean = false,
  options: V2BuildOptions = {}
): RsbuildConfig {
  const outputDir = getV2BuildDir();
  const precompress = options.precompress ?? minify;
  return {
    // Express serves `public/` at the root (`web_server.ts`); don't also copy
    // it into `build/client/` (where `/assets/*` would serve a second copy).
    server: {
      publicDir: false,
    },
    source: {
      entry: {
        ...Object.fromEntries(
          Object.entries(V2_CHUNK_ENTRIES).map(([name, spec]) => [
            name,
            {
              import: [spec.import, ...(spec.shared ?? [])],
              dependOn: spec.dependOn,
            },
          ])
        ),
        app: "./src/web/ui/app.css",
        critical: "./src/web/ui/shell/critical_theme.client.ts",
      },
    },
    output: {
      // Explicit browser support baseline (Baseline 2023+); shared with
      // stylelint-plugin-use-baseline via src/web/ui/browser_targets.common.ts.
      overrideBrowserslist: [...V2_BROWSERSLIST],
      distPath: {
        root: outputDir,
        js: "",
        css: "",
      },
      filename: {
        // `critical.js` and `critical.css` are read from disk by fixed name
        // and inlined into `<head>` (`asset_manifest.server.ts`); the other
        // assets are served over HTTP with `Cache-Control: immutable` and need
        // a content hash in the URL so deployments bust caches cleanly.
        js: (pathData) =>
          pathData.chunk?.name === "critical"
            ? "[name].js"
            : "[name].[contenthash:8].js",
        css: (pathData) =>
          pathData.chunk?.name === "critical"
            ? "[name].css"
            : "[name].[contenthash:8].css",
      },
      cleanDistPath: true,
      minify,
      sourceMap: {
        js: minify ? false : "cheap-module-source-map",
        css: !minify,
      },
    },
    plugins: [v2ManifestPlugin(outputDir, minify, precompress)],
    tools: {
      htmlPlugin: false,
      rspack: {
        optimization: {
          splitChunks: false,
        },
      },
    },
  };
}

export async function buildV2Bundle(
  minify: boolean = false,
  options: V2BuildOptions = {}
): Promise<void> {
  const rsbuild = await createRsbuild({
    rsbuildConfig: createV2RsbuildConfig(minify, options),
  });
  await rsbuild.build();
}

if (require.main === module) {
  buildV2Bundle(process.argv.includes("--minify"))
    .then(() => {
      console.log("Successfully built UI V2 assets into build/client/");
    })
    .catch((err) => {
      console.error("Failed to build UI V2 assets:", err);
      process.exit(1);
    });
}
