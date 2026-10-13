/**
 * In-memory keyed cache with in-flight Promise deduplication and optional LRU eviction.
 *
 * - Resolved values from `fetch` are stored (so a loader that catches and resolves a
 *   sentinel such as `null` remembers the failure); rejections propagate to every waiter
 *   without being cached (so the next `load` retries).
 * - Shared in-flight requests are deliberately not abortable: aborting on behalf of
 *   one caller would reject the shared Promise for every other waiter. Callers that
 *   stop caring ignore the resolution via their own staleness check.
 * - `V` must not include `undefined`: `get` uses it to mean "not cached", so a stored
 *   `undefined` would be refetched on every `load`. Use `null` for "known missing".
 * - A `set` while a `load` of the same key is in flight is overwritten when that load
 *   resolves (the last write wins).
 */

export interface KeyedFetchCacheOptions<V, A = void> {
  /**
   * Loads a value for a missing key. Must return a promise rather than throw:
   * a synchronous throw escapes `load` instead of rejecting. Rejections are not
   * cached.
   */
  fetch: (key: string, arg: A) => Promise<V>;
  /** Maximum cached entries before least-recently-used eviction. Unbounded when omitted. */
  maxEntries?: number;
}

export class KeyedFetchCache<V, A = void> {
  readonly #entries = new Map<string, V>();
  readonly #inFlight = new Map<string, Promise<V>>();
  readonly #fetch: (key: string, arg: A) => Promise<V>;
  readonly #max: number | undefined;

  constructor(options: KeyedFetchCacheOptions<V, A>) {
    this.#fetch = options.fetch;
    this.#max = options.maxEntries;
  }

  /** Returns true if `key` is currently cached in memory. */
  has(key: string): boolean {
    return this.#entries.has(key);
  }

  /**
   * Synchronously retrieves a cached value for `key` and refreshes its LRU position.
   */
  get(key: string): V | undefined {
    const val = this.#entries.get(key);
    if (val !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, val);
    }
    return val;
  }

  /**
   * Stores `value` for `key`, evicting the least-recently-used entry if at capacity.
   */
  set(key: string, value: V): void {
    const entries = this.#entries;
    if (entries.has(key)) {
      entries.delete(key);
    } else if (this.#max !== undefined && entries.size >= this.#max) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) {
        entries.delete(oldestKey);
      }
    }
    entries.set(key, value);
  }

  /**
   * Resolves the value for `key` from memory, an existing in-flight request, or a new `fetch`.
   */
  load(key: string, arg: A): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    const existing = this.#inFlight.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const request = this.#fetch(key, arg)
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.#inFlight.delete(key);
      });

    this.#inFlight.set(key, request);
    return request;
  }
}
