import {
  KeyedFetchCache,
  withBuildVersion,
} from "@/web/ui/core/index.client";
import type { DictChunksResponse } from "@/web/ui/dict/search/dict_completions.common";

function isDictChunksResponse(data: unknown): data is DictChunksResponse {
  return data !== null && typeof data === "object" && !Array.isArray(data);
}

/**
 * Fetches a 2-letter dictionary completion chunk from the server, build-
 * versioned so the browser keeps it for the rest of the build.
 * Rejects on network or HTTP errors so `KeyedFetchCache` does not cache the failure.
 */
async function fetchDictChunk(prefix: string): Promise<DictChunksResponse> {
  const res = await fetch(
    withBuildVersion(`/api/completions?prefix=${encodeURIComponent(prefix)}`)
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch completions chunk: HTTP ${res.status}`);
  }
  const data: unknown = await res.json();
  return isDictChunksResponse(data) ? data : {};
}

/**
 * Creates the in-memory LRU cache for 2-letter dictionary completion chunks.
 */
export function createDictChunkCache(
  maxPrefixes: number = 60
): KeyedFetchCache<DictChunksResponse> {
  return new KeyedFetchCache({
    fetch: fetchDictChunk,
    maxEntries: maxPrefixes,
  });
}
