function writeToStream(
  message: ArrayBuffer,
  writable: WritableStream<ArrayBuffer>
): void {
  const writer = writable.getWriter();
  // Trying to `await` these Promises blocks forever, but I'm not sure why.
  writer.write(message);
  writer.close();
}

async function readFromStream(
  readable: ReadableStream<Uint8Array>
): Promise<Uint8Array[]> {
  const outputChunks: Uint8Array[] = [];
  const reader = readable.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    outputChunks.push(value);
  }
  return outputChunks;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, cur) => sum + cur.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/** Decompresses a `gzip` compressed message. */
export async function decompress(message: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream("gzip");
  writeToStream(message, ds.writable);
  const decompressedChunks = await readFromStream(ds.readable);
  return concatChunks(decompressedChunks);
}
