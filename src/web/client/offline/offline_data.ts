import { decompress } from "@/common/bytedata/compression";
import { readMetadata, unpackStreamed } from "@/common/bytedata/packing";
import {
  IndexedDbDict,
  type IndexDbDictConfig,
} from "@/common/dictionaries/indexdb_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";

async function* streamedGet(url: string): AsyncGenerator<Uint8Array> {
  console.debug(`Fetching ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    return Promise.reject(new Error(`Status ${response.status} on ${url}`));
  }
  if (response.body === null) {
    return Promise.reject(new Error(`Response body was null!`));
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

export async function saveOfflineDict(
  name: string,
  config: IndexDbDictConfig,
  onProgress?: (value: number) => unknown
): Promise<void> {
  const url = `${location.origin}/offlineData/${name}`;
  const decoder = new TextDecoder();
  const start = performance.now();
  const chunkStream = unpackStreamed(streamedGet(url));

  const numChunks = await readMetadata(chunkStream);
  let finished = 0;
  for await (const chunk of chunkStream) {
    const arr: RawDictEntry[] = JSON.parse(
      decoder.decode(await decompress(chunk))
    );
    await IndexedDbDict.save(arr, config);
    finished += 1;
    onProgress?.(Math.floor((finished * 100) / numChunks));
  }
  const totalTime = performance.now() - start;
  console.debug(`Saved ${name} in ${totalTime} ms.`);
}
