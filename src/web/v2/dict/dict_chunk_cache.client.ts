import type { DictChunksResponse } from "@/web/v2/dict/dict_completions.common";

/**
 * In-memory client-side cache for 2-letter dictionary completion chunks.
 *
 * Provides:
 * - O(1) synchronous cache lookup for instant 0 ms autocompletion on typing.
 * - In-flight Promise deduplication: coalesces concurrent or rapid-typing requests
 *   for the same prefix into a single network round-trip.
 * - LRU eviction to prevent unbounded memory growth while keeping active sessions snappy.
 */
export class DictChunkCache {
  private readonly chunks = new Map<string, DictChunksResponse>();
  private readonly inFlight = new Map<string, Promise<DictChunksResponse>>();
  private readonly maxPrefixes: number;

  constructor(maxPrefixes: number = 60) {
    this.maxPrefixes = maxPrefixes;
  }

  /**
   * Returns true if chunks for this prefix are loaded and available in memory.
   */
  hasPrefix(prefix: string): boolean {
    const key = prefix.toLowerCase();
    return this.chunks.has(key);
  }

  /**
   * Synchronously retrieves cached chunks for a prefix and updates its LRU position.
   */
  getChunks(prefix: string): DictChunksResponse | undefined {
    const key = prefix.toLowerCase();
    const val = this.chunks.get(key);
    if (val) {
      // Re-insert to refresh LRU position
      this.chunks.delete(key);
      this.chunks.set(key, val);
    }
    return val;
  }

  /**
   * Stores chunks for a prefix in memory, evicting the least-recently used prefix if full.
   */
  setChunks(prefix: string, chunks: DictChunksResponse): void {
    const key = prefix.toLowerCase();
    if (this.chunks.has(key)) {
      this.chunks.delete(key);
    } else if (this.chunks.size >= this.maxPrefixes) {
      const oldestKey = this.chunks.keys().next().value;
      if (oldestKey) {
        this.chunks.delete(oldestKey);
      }
    }
    this.chunks.set(key, chunks);
  }

  /**
   * Fetches the 2-letter chunk from the server or reuses an existing in-flight request.
   */
  loadPrefix(prefix: string): Promise<DictChunksResponse> {
    const key = prefix.toLowerCase();

    // 1. Return from in-memory cache if already loaded
    const cached = this.getChunks(key);
    if (cached) {
      return Promise.resolve(cached);
    }

    // 2. Reuse active in-flight promise if a request is already pending
    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // 3. Initiate new network request.
    //
    // Deliberately not cancellable. This promise is shared by every caller that
    // asks for the same prefix (step 2), so aborting on behalf of one of them
    // would reject it for all of them and poison the shared cache. It is an
    // idempotent GET whose result is worth keeping regardless of who asked for
    // it; callers that no longer care just ignore the result via their own
    // staleness check.
    const promise = fetch(
      `/v2/api/completions?prefix=${encodeURIComponent(key)}`
    )
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            `Failed to fetch completions chunk: HTTP ${res.status}`
          );
        }
        return res.json();
      })
      .then((data: DictChunksResponse) => {
        const cleanData = data && typeof data === "object" ? data : {};
        this.setChunks(key, cleanData);
        return cleanData;
      })
      .catch((err) => {
        console.error(`Error fetching completions chunk for "${key}":`, err);
        return {};
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Clears all cached chunks and in-flight promises.
   */
  clear(): void {
    this.chunks.clear();
    this.inFlight.clear();
  }

  /**
   * Total number of cached prefixes currently in memory.
   */
  get size(): number {
    return this.chunks.size;
  }

  /**
   * Number of network requests currently in-flight.
   */
  get inFlightCount(): number {
    return this.inFlight.size;
  }
}
