import { decompress } from "@/common/bytedata/compression";
import { gzipSync } from "zlib";

describe("Compression utils", () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  it("Handles empty input", async () => {
    const input = "";
    const compressed = gzipSync(encoder.encode(input));
    const result = decoder.decode(await decompress(compressed));
    expect(input).toBe(result);
  });

  it("Handles nonempty input", async () => {
    const input = "Gallia est omnis divisa in partes tres.";
    const compressed = gzipSync(encoder.encode(input));
    const result = decoder.decode(await decompress(compressed));
    expect(input).toBe(result);
  });
});
