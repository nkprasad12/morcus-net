import fs from "fs";
import { createCleanDir, safeRmDir } from "@/utils/file_utils";
import { packCompressedChunks } from "@/web/server/chunking";
import { unpackStreamed } from "@/common/bytedata/packing";
import { gunzipSync } from "zlib";

const TEMP_DIR = "unitTestTmp/chunking_test_ts";

describe("packCompressedChunks", () => {
  beforeAll(async () => {
    await createCleanDir(TEMP_DIR);
  });

  afterAll(async () => {
    await safeRmDir(TEMP_DIR);
  });

  async function* toAsyncGenerator(buffer: ArrayBuffer) {
    yield new Uint8Array(buffer);
  }

  async function unprocessData(buffer: ArrayBuffer): Promise<object[][]> {
    const decoder = new TextDecoder();
    const results: object[][] = [];
    const unpackStream = unpackStreamed(toAsyncGenerator(buffer));
    // Skip the metadata.
    await unpackStream.next();
    for await (const rawChunk of unpackStream) {
      const uncompressed = gunzipSync(rawChunk);
      results.push(JSON.parse(decoder.decode(uncompressed)));
    }
    return results;
  }

  async function unprocessFile(filePath: string): Promise<object[][]> {
    const raw = fs.readFileSync(filePath);
    const [offset, len] = [raw.byteOffset, raw.byteLength];
    const buffer = raw.buffer.slice(offset, offset + len);
    return unprocessData(buffer);
  }

  it("handles empty data", async () => {
    const outFile = packCompressedChunks([], 3, "empty", TEMP_DIR);
    const result = await unprocessFile(outFile);
    expect(result).toEqual([[], [], []]);
  });

  it("handles uneven chunk size data", async () => {
    const data = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }];
    const outFile = packCompressedChunks(data, 2, "unevenChunks", TEMP_DIR);
    const result = await unprocessFile(outFile);
    expect(result).toEqual([
      [{ x: 1 }, { x: 2 }],
      [{ x: 3 }, { x: 4 }, { x: 5 }],
    ]);
  });

  it("handles data with direct output", async () => {
    const data = [{ hi: "hi" }, { hi: "hello" }];
    const buffer = packCompressedChunks(data, 2);
    const result = await unprocessData(buffer);
    expect(result).toEqual([[data[0]], [data[1]]]);
  });
});
