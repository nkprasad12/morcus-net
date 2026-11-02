/**
 * Shared IndexedDB connection and request/transaction primitives for device-local
 * UI V2 stores (`ExternalContentStore`, `ExperimentalTextStore`).
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Wraps an `IDBRequest` in a Promise. */
export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IDB error"));
  });
}

/** Resolves once `tx` commits, so writes are durable before callers proceed. */
export function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB transaction aborted"));
  });
}

/** Returns true when `err` is a browser storage `QuotaExceededError`. */
export function isQuotaError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    err.name === "QuotaExceededError"
  );
}

export interface IndexedDbStoreSpec {
  readonly name: string;
  readonly keyPath: string;
}

export interface IndexedDbConnectionOptions {
  readonly dbName: string;
  readonly version: number;
  readonly stores: readonly IndexedDbStoreSpec[];
  /**
   * Defaults to the global `indexedDB`. Injectable for tests; `null` means
   * IndexedDB is unavailable.
   */
  readonly factory?: IDBFactory | null;
}

function openDb(
  factory: IDBFactory,
  dbName: string,
  version: number,
  stores: readonly IndexedDbStoreSpec[]
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(dbName, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store.name)) {
          db.createObjectStore(store.name, { keyPath: store.keyPath });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open IndexedDB"));
    request.onblocked = () =>
      reject(new Error(`Opening ${dbName} was blocked`));
  });
}

/**
 * Lazily opens and manages a browser IndexedDB connection, creating missing
 * object stores on upgrade, stepping aside on cross-tab version upgrades, and
 * clearing failed open attempts so subsequent calls can retry.
 */
export class IndexedDbConnection {
  #dbPromise: Promise<IDBDatabase> | null = null;
  readonly #dbName: string;
  readonly #version: number;
  readonly #stores: readonly IndexedDbStoreSpec[];
  readonly #factory: IDBFactory | null;

  constructor(options: IndexedDbConnectionOptions) {
    this.#dbName = options.dbName;
    this.#version = options.version;
    this.#stores = options.stores;
    this.#factory =
      options.factory !== undefined
        ? options.factory
        : typeof indexedDB === "undefined"
        ? null
        : indexedDB;
  }

  db(): Promise<IDBDatabase> {
    if (this.#dbPromise === null) {
      const factory = this.#factory;
      const opening = factory
        ? openDb(factory, this.#dbName, this.#version, this.#stores)
        : Promise.reject(new Error("IndexedDB is not available"));
      this.#dbPromise = opening;
      opening.then(
        (db) => {
          // Another tab is upgrading the schema: step aside so it isn't
          // blocked. The next call here reopens at the new version. A
          // database connection, not UI: the activation gate doesn't apply.
          // eslint-disable-next-line no-restricted-syntax
          db.onversionchange = () => {
            db.close();
            if (this.#dbPromise === opening) this.#dbPromise = null;
          };
        },
        // A failed open is retried on the next call rather than cached.
        () => {
          if (this.#dbPromise === opening) this.#dbPromise = null;
        }
      );
    }
    return this.#dbPromise;
  }

  /** Closes the connection, e.g. on element disconnect or in tests. */
  async close(): Promise<void> {
    const pending = this.#dbPromise;
    this.#dbPromise = null;
    if (pending === null) return;
    try {
      (await pending).close();
    } catch {
      // Never opened; nothing to close.
    }
  }
}
