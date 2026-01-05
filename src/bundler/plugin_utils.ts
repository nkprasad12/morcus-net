/* istanbul ignore file */

import chalk from "chalk";
import fs from "fs";
import { brotliCompress, gzip, constants } from "zlib";
import { promisify } from "node:util";

import { assert, checkPresent } from "@/common/assert";
import { runCommand } from "@/scripts/script_utils";
import { exhaustiveGuard } from "@/common/misc_utils";
import { arrayMapBy } from "@/common/data_structures/collect_map";

export interface CommonPlugin {
  name: string;
  onBuildStart?: () => void;
  onBuildEnd?: () => void;
}

export interface TypeCheckOptions {
  watch: boolean;
}

export function typeCheckCommon(options?: TypeCheckOptions): CommonPlugin {
  let tscPromise: Promise<number> | undefined = undefined;
  return {
    name: "typeCheck",
    onBuildStart: () => {
      tscPromise = runCommand("npx tsc")
        .catch(() => 1)
        .then((rc) => rc ?? 1);
    },
    onBuildEnd: async () => {
      const returnCode = await checkPresent(tscPromise);
      const success = returnCode === 0;
      if (success) {
        console.log("Checked types successfully!");
      }
      if (!success && !options?.watch) {
        process.exit(1);
      }
    },
  };
}

type CompressionAlgorithm = "gz" | "br";

interface CompressedFileInfo {
  originalKb: number;
  compressedKb: number;
  compressionMs: number;
  outputFile: string;
  inputFile: string;
  algorithm: CompressionAlgorithm;
}

const runGzip = (buf: Buffer) => promisify(gzip)(buf, { level: 9 });
const runBrotli = (buf: Buffer) =>
  promisify(brotliCompress)(buf, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });

function getCompressor(
  algorithm: CompressionAlgorithm
): (buf: Buffer) => Promise<Buffer> {
  switch (algorithm) {
    case "gz":
      return runGzip;
    case "br":
      return runBrotli;
  }
  exhaustiveGuard(algorithm);
}

async function compressFile(
  buffer: Buffer,
  fileName: string,
  algorithm: CompressionAlgorithm
): Promise<CompressedFileInfo> {
  const compressor = getCompressor(algorithm);
  const outFile = `${fileName}.${algorithm}`;
  const start = performance.now();
  const compressed = await compressor(buffer);
  const elapsed = performance.now() - start;
  await fs.promises.writeFile(outFile, compressed);
  return {
    originalKb: buffer.byteLength / 1000,
    compressedKb: compressed.byteLength / 1000,
    compressionMs: elapsed,
    outputFile: outFile,
    inputFile: fileName,
    algorithm,
  };
}

function formatCompressionResults(results: CompressedFileInfo[]) {
  if (results.length === 0) {
    return;
  }
  const outputDir =
    results[0].outputFile.split("/").slice(0, -1).join("/") + "/";
  console.log(`Wrote compressed files:`);
  for (const result of results) {
    assert(result.outputFile.startsWith(outputDir));
    const outputName = result.outputFile.slice(outputDir.length);
    console.log(`- ${chalk.gray(outputDir)}${chalk.cyan(outputName)}`);
  }

  console.log(`\n${chalk.yellow("Compression summary")}`);
  const byOriginal = arrayMapBy(results, (r) => r.inputFile);
  const rows: string[][] = [];
  for (const [inputFile, results] of byOriginal.map) {
    assert(inputFile.startsWith(outputDir));
    const inputName = inputFile.slice(outputDir.length);
    const inputSize = results[0].originalKb.toFixed(1);
    const parts = [`${chalk.cyan(inputName)}`, `${inputSize} kB raw`];
    for (const result of results) {
      const ratio = (result.compressedKb / result.originalKb) * 100;
      const ratioStr = ratio.toFixed(1) + "%";
      const compressedSize = result.compressedKb.toFixed(1);
      const coreStr = `${compressedSize} kB ${result.algorithm}`;
      const timing = `in ${result.compressionMs.toFixed(1)} ms`;
      const metadata = chalk.gray(`(${ratioStr}) ${timing}`);
      parts.push(`${chalk.green(coreStr)} ${metadata}`);
    }
    rows.push(parts);
  }
  const colWidths: number[] = [];
  for (const row of rows) {
    row.forEach((col, idx) => {
      colWidths[idx] = Math.max(colWidths[idx] ?? 0, col.length);
    });
  }
  for (const row of rows) {
    const padded = row.map(
      (col, idx) => col + " ".repeat(colWidths[idx] - col.length)
    );
    console.log(padded.join("   "));
  }
}

export async function compressJsOutputs(outputs: string[]) {
  const resultsPromise = Promise.all(
    outputs
      .filter((f) => f.endsWith(".js"))
      .map(async (jsFile) => {
        const raw = await fs.promises.readFile(jsFile);
        return Promise.all([
          compressFile(raw, jsFile, "gz"),
          compressFile(raw, jsFile, "br"),
        ]);
      })
  );
  formatCompressionResults((await resultsPromise).flat());
}
