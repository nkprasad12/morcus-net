import { checkPresent } from "@/common/assert";
import { decompress } from "@/common/bytedata/compression";
import { readMetadata, unpackStreamed } from "@/common/bytedata/packing";
import {
  IndexedDbDict,
  type IndexDbDictConfig,
} from "@/common/dictionaries/indexdb_backing";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import type { CruncherTables } from "@/morceus/cruncher_types";
import { SingleItemStore } from "@/web/client/offline/single_item_store";

async function fetchOfflineData(name: string): Promise<Response> {
  const url = `${location.origin}/offlineData/${name}`;
  console.debug(`Fetching ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    return Promise.reject(new Error(`Status ${response.status} on ${url}`));
  }
  return response;
}

async function* streamedGet(name: string): AsyncGenerator<Uint8Array> {
  const response = await fetchOfflineData(name);
  const reader = checkPresent(response.body).getReader();
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
  const decoder = new TextDecoder();
  const start = performance.now();
  const chunkStream = unpackStreamed(streamedGet(name));

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

export function reviveTables(decoded: string): CruncherTables {
  return JSON.parse(decoded, (_, value) =>
    typeof value === "object" && value !== null && value.dataType === "Map"
      ? new Map(value.value)
      : value
  );
}

export async function fetchMorceusTables(): Promise<CruncherTables> {
  const response = await fetchOfflineData("morceusTables");
  const compressed = await response.arrayBuffer();
  const decompressed = await decompress(compressed);
  const decoded = new TextDecoder().decode(decompressed);
  const save = SingleItemStore.forKey("morceusTables").set(decoded);
  const result = reviveTables(decoded);
  await save;
  return result;
}
