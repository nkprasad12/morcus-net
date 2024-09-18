import { pack } from "@/common/bytedata/packing";
import fs from "fs";
import path from "path";
import { gzipSync } from "zlib";

export function packCompressedChunks(
  input: object[],
  name: string,
  outDir: string,
  numChunks: number
) {
  const chunkSize = Math.floor(input.length / numChunks);
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < numChunks; i++) {
    const start = chunkSize * i;
    const end = i === numChunks - 1 ? input.length : chunkSize * (i + 1);
    const chunk = JSON.stringify(input.slice(start, end));
    chunks.push(gzipSync(chunk, { level: 9 }));
  }
  const outpath = path.join(outDir, `${name}.json.gz.chunked`);
  fs.writeFileSync(outpath, Buffer.from(pack(chunks)));
  return outpath;
}
