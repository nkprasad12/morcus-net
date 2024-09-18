import fs from "fs";
import { safeCreateDir, safeRmDir } from "@/utils/file_utils";
import { packCompressedChunks } from "@/web/server/chunking";
import { unpack } from "@/common/bytedata/packing";
import { gunzipSync } from "zlib";

const TEMP_DIR = "unitTestTmp/chunking_test_ts";

describe("packCompressedChunks", () => {
  beforeAll(() => {
    safeCreateDir(TEMP_DIR);
  });

  afterAll(() => {
    safeRmDir(TEMP_DIR);
  });

  async function unpackUncompress(filePath: string): Promise<object[][]> {
    const raw = fs.readFileSync(filePath);
    const [offset, len] = [raw.byteLength, raw.byteLength];
    const buffer = raw.buffer.slice(offset, offset + len);

    const decoder = new TextDecoder();
    const results: object[][] = [];
    for (const rawChunk of unpack(buffer)) {
      const uncompressed = gunzipSync(rawChunk);
      results.push(JSON.parse(decoder.decode(uncompressed)));
    }
    return results;
  }

  it("handles empty data", async () => {
    const outFile = packCompressedChunks([], "empty", TEMP_DIR, 3);
    const result = await unpackUncompress(outFile);
    expect(result).toEqual([[], [], []]);
  });

  it("handles uneven chunk size data", async () => {
    const data = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }];
    const outFile = packCompressedChunks(data, "unevenChunks", TEMP_DIR, 2);
    const result = await unpackUncompress(outFile);
    console.log(result);
    expect(result).toEqual([
      [{ x: 1 }, { x: 2 }],
      [{ x: 3 }, { x: 4 }, { x: 5 }],
    ]);
  });
});
