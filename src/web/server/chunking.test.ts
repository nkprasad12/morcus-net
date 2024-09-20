import fs from "fs";
import { createCleanDir, safeRmDir } from "@/utils/file_utils";
import { packCompressedChunks } from "@/web/server/chunking";
import { unpack } from "@/common/bytedata/packing";
import { gunzipSync } from "zlib";

const TEMP_DIR = "unitTestTmp/chunking_test_ts";

describe("packCompressedChunks", () => {
  beforeAll(async () => {
    await createCleanDir(TEMP_DIR);
  });

  afterAll(async () => {
    await safeRmDir(TEMP_DIR);
  });

  function unprocessData(buffer: ArrayBuffer): object[][] {
    const decoder = new TextDecoder();
    const results: object[][] = [];
    for (const rawChunk of unpack(buffer)) {
      const uncompressed = gunzipSync(rawChunk);
      results.push(JSON.parse(decoder.decode(uncompressed)));
    }
    return results;
  }

  function unprocessFile(filePath: string): object[][] {
    const raw = fs.readFileSync(filePath);
    const [offset, len] = [raw.byteOffset, raw.byteLength];
    const buffer = raw.buffer.slice(offset, offset + len);
    return unprocessData(buffer);
  }

  it("handles empty data", () => {
    const outFile = packCompressedChunks([], 3, "empty", TEMP_DIR);
    const result = unprocessFile(outFile);
    expect(result).toEqual([[], [], []]);
  });

  it("handles uneven chunk size data", () => {
    const data = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }];
    const outFile = packCompressedChunks(data, 2, "unevenChunks", TEMP_DIR);
    const result = unprocessFile(outFile);
    expect(result).toEqual([
      [{ x: 1 }, { x: 2 }],
      [{ x: 3 }, { x: 4 }, { x: 5 }],
    ]);
  });

  it("handles data with direct output", () => {
    const data = [{ hi: "hi" }, { hi: "hello" }];
    const buffer = packCompressedChunks(data, 2);
    const result = unprocessData(buffer);
    expect(result).toEqual([[data[0]], [data[1]]]);
  });
});
