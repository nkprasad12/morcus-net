import { decompress } from "@/common/bytedata/compression";
import { unpack } from "@/common/bytedata/packing";
import {
  IndexedDbDict,
  type IndexDbDictConfig,
} from "@/common/dictionaries/indexdb_backing";

export async function saveOfflineDict(name: string, config: IndexDbDictConfig) {
  const url = `${location.origin}/offlineData/${name}`;
  console.debug(`Fetching ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    return Promise.reject(new Error(`Status ${response.status} on ${url}`));
  }
  const packed = await response.arrayBuffer();
  const start = performance.now();
  const decoder = new TextDecoder();
  for (const chunk of unpack(packed)) {
    const arr = JSON.parse(decoder.decode(await decompress(chunk)));
    await IndexedDbDict.save(arr, config);
  }
  const totalTime = performance.now() - start;
  console.debug(`Saved ${name} in ${totalTime} ms.`);
}
