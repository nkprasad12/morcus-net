/* istanbul ignore file */

import fs from "fs";

import {
  type CommonPlugin,
  typeCheckCommon,
  compressJsOutputs,
} from "@/bundler/plugin_utils";
import type { BundleOptions } from "@/bundler/utils";
import { assert } from "@/common/assert";
import type { OnAfterBuildFn, RsbuildPlugin } from "@rsbuild/core";
import chalk from "chalk";

function convertPlugin(plugin: CommonPlugin): RsbuildPlugin {
  return {
    name: plugin.name,
    setup: (api) => {
      if (plugin.onBuildStart) {
        api.onBeforeBuild(plugin.onBuildStart);
      }
      if (plugin.onBuildEnd) {
        api.onAfterBuild(plugin.onBuildEnd);
      }
    },
  };
}

export function typeCheck(options?: BundleOptions): RsbuildPlugin {
  return convertPlugin(typeCheckCommon(options));
}

export interface InjectBuildInfoOptions {
  /** The output file to inject build info into. */
  target: string;
  /** The placeholder string to be replaced with build info. */
  placeholder: string;
  /**
   * The output file to write the modified contents to.
   * Note that for watch mode to work correctly, this must be different from `target`; otherwise,
   * if the build info changes but the target file does not, the placeholder will have been injected in
   * the last build, and the file will not be rebuilt, so the previous build info will remain.
   */
  output: string;
}

export function injectBuildInfo(
  options: InjectBuildInfoOptions
): RsbuildPlugin {
  return {
    name: "injectBuildInfo",
    setup: (api) => {
      api.onAfterBuild((a) => {
        assert(options.target.endsWith(".js"), "Target must be a .js file");
        const targetFile = `${api.context.distPath}/${options.target}`;
        const outputFiles = outputJsFiles(a).filter((f) =>
          f.endsWith(".client-bundle.js")
        );
        assert(outputFiles.length > 0, "No output files found");
        const stringifiedOutputs = JSON.stringify(outputFiles);

        const header = `Injecting build info into ${chalk.underline(
          options.target
        )}`;
        console.log(`${chalk.blue(header)}`);
        const replaceMessage = `Replacing ${chalk.yellow(
          options.placeholder
        )} with ${chalk.green(stringifiedOutputs)}`;
        console.log(replaceMessage);
        const originalContents = fs.readFileSync(targetFile).toString();
        const newContents = originalContents.replaceAll(
          options.placeholder,
          stringifiedOutputs
        );
        assert(originalContents !== newContents, "No replacements made");
        const outputFile = `${api.context.distPath}/${options.output}`;
        fs.writeFileSync(outputFile, newContents);
        console.log(
          `Wrote modified file to ${chalk.gray(
            api.context.distPath + "/"
          )}${chalk.cyan(options.output)}\n`
        );
      });
    },
  };
}

function outputJsFiles(a: Parameters<OnAfterBuildFn>[0]): string[] {
  if (a.stats === undefined) {
    throw new Error("No stats available.");
  }
  const compilations =
    "compilation" in a.stats
      ? [a.stats.compilation]
      : a.stats.stats.map((s) => s.compilation);
  const outputs = new Set<string>();
  for (const compilation of compilations) {
    for (const [_, entrypoint] of compilation.entrypoints) {
      for (const chunk of entrypoint.chunks) {
        // The main chunks.
        chunk.files.forEach((f) => outputs.add(f));
      }
      for (const child of entrypoint.childrenIterable) {
        // The child chunks. Rsbuild seems to use this for chunks that are
        // fetched after the initial load.
        child.getFiles().forEach((f) => outputs.add(f));
      }
    }
  }
  return Array.from(outputs).filter(
    (f) => f.endsWith(".js") && !f.endsWith("template.js")
  );
}

export function compress(): RsbuildPlugin {
  return {
    name: "compressJs",
    setup: (api) => {
      api.onAfterBuild((a) =>
        compressJsOutputs(
          outputJsFiles(a).map((f) => `${api.context.distPath}/${f}`)
        )
      );
    },
  };
}
