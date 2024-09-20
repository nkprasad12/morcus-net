import { pack } from "@/common/bytedata/packing";
import fs from "fs";
import path from "path";
import { gzipSync } from "zlib";

/**
 * Packs the input objects into `gzip`ped chunks.
 *
 * Each chunk can be individually decompressed.
 *
 * @returns the output path of the packed data if `name` and `outDir` are specified,
 * or the packed data itself if not.
 */
export function packCompressedChunks(
  input: object[],
  numChunks: number,
  name: string,
  outDir: string
): string;
export function packCompressedChunks(
  input: object[],
  numChunks: number
): ArrayBuffer;
export function packCompressedChunks(
  input: object[],
  numChunks: number,
  name?: string,
  outDir?: string
): string | ArrayBuffer {
  const chunkSize = Math.floor(input.length / numChunks);
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < numChunks; i++) {
    const start = chunkSize * i;
    const end = i === numChunks - 1 ? input.length : chunkSize * (i + 1);
    const chunk = JSON.stringify(input.slice(start, end));
    chunks.push(gzipSync(chunk, { level: 9 }));
  }
  const packed = pack(chunks);
  if (name === undefined || outDir === undefined) {
    return packed;
  }
  const outpath = path.join(outDir, `${name}.json.gz.chunked`);
  fs.writeFileSync(outpath, Buffer.from(packed));
  return outpath;
}
