/* istanbul ignore file */

import fs from "fs";
import { brotliCompress, gzip, constants } from "zlib";
import { promisify } from "node:util";

import { checkPresent } from "@/common/assert";
import { runCommand } from "@/scripts/script_utils";

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

async function compressFile(
  buffer: Buffer,
  fileName: string,
  ext: string,
  compressor: (buf: Buffer) => Promise<Buffer>
) {
  const outFile = `${fileName}.${ext}`;
  const start = performance.now();
  const compressed = await compressor(buffer);
  const elapsed = (performance.now() - start).toFixed(2);
  const size = (compressed.byteLength / 1000).toFixed(2);
  console.log(`${ext} compressed: ${outFile} [${size} kB, ${elapsed} ms]`);
  return fs.promises.writeFile(outFile, compressed);
}

export async function compressJsOutputs(outputs: string[]) {
  for (const output of outputs) {
    if (!output.endsWith(".js")) {
      continue;
    }
    const rawFile = await fs.promises.readFile(output);
    await Promise.all([
      compressFile(rawFile, output, "gz", (buf) =>
        promisify(gzip)(buf, { level: 9 })
      ),
      compressFile(rawFile, output, "br", (buf) =>
        promisify(brotliCompress)(buf, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        })
      ),
    ]);
  }
}
