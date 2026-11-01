/**
 * Device-local cache for the Open Texts reader (`<morcus-open-text-reader>`).
 *
 * Open Texts are fetched from their pinned upstream commit and parsed on the
 * reader's device (M4), so the parsed {@link OpenTextDocument} is cached here
 * to make reopening a work instant and offline-safe. Two stores:
 *
 * - `documents`: parsed documents keyed by {@link openTextCacheKey}
 *   (`<entry id>@<pinned commit>`). A new pin is a new key, so a re-pinned
 *   source is re-fetched rather than served stale; older pins of the same
 *   entry are dropped when the new one is written.
 * - `positions`: the last page read per entry ({@link OpenTextReadingPosition}),
 *   so `/opentexts?open=<id>` without `&page=` reopens where the reader was.
 *
 * Everything here is best effort. When IndexedDB is unavailable (disabled,
 * some private modes) or an operation fails, the store degrades to an
 * in-memory map for the rest of the page's life, and a document the browser
 * evicted is simply a cache miss: the reader quietly re-fetches it.
 */

import type { OpenTextDocument } from "@/common/open_texts/open_text_document";

export const OPEN_TEXTS_DB_NAME = "morcusOpenTexts.db";
export const OPEN_TEXTS_DB_VERSION = 1;
export const OPEN_TEXTS_DOCUMENT_STORE = "documents";
export const OPEN_TEXTS_POSITION_STORE = "positions";

/** The last page read in one Open Text. */
export interface OpenTextReadingPosition {
  /** The catalog entry id (`OpenTextCatalogEntry.id`). */
  workId: string;
  /** The `OpenTextPage.id` last shown. */
  pageId: string;
  /** Epoch millis. */
  updatedAt: number;
}

interface StoredDocumentRow {
  key: string;
  entryId: string;
  document: OpenTextDocument;
  savedAt: number;
}

/** The cache key for a parsed document: the entry at its pinned commit. */
export function openTextCacheKey(entryId: string, commit: string): string {
  return `${entryId}@${commit}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Shallow validation of a stored document: enough that the reader can render
 * it without crashing. Anything else (an older schema, a corrupt row) reads as
 * a miss and is re-fetched.
 */
export function parseStoredDocument(row: unknown): OpenTextDocument | null {
  if (!isRecord(row)) return null;
  const doc = row.document;
  if (!isRecord(doc)) return null;
  if (typeof doc.title !== "string" || !Array.isArray(doc.pages)) return null;
  if (doc.pages.length === 0) return null;
  for (const page of doc.pages) {
    if (
      !isRecord(page) ||
      typeof page.id !== "string" ||
      typeof page.label !== "string" ||
      !Array.isArray(page.blocks) ||
      !Array.isArray(page.notes)
    ) {
      return null;
    }
  }
  // Safe: the fields the reader dereferences were checked above.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return doc as unknown as OpenTextDocument;
}

/** Validates a stored reading position. */
export function parseStoredPosition(
  row: unknown
): OpenTextReadingPosition | null {
  if (!isRecord(row)) return null;
  const { workId, pageId, updatedAt } = row;
  if (
    typeof workId !== "string" ||
    typeof pageId !== "string" ||
    typeof updatedAt !== "number"
  ) {
    return null;
  }
  return { workId, pageId, updatedAt };
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IDB error"));
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB transaction aborted"));
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(OPEN_TEXTS_DB_NAME, OPEN_TEXTS_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPEN_TEXTS_DOCUMENT_STORE)) {
        db.createObjectStore(OPEN_TEXTS_DOCUMENT_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(OPEN_TEXTS_POSITION_STORE)) {
        db.createObjectStore(OPEN_TEXTS_POSITION_STORE, { keyPath: "workId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open IndexedDB"));
    request.onblocked = () =>
      reject(new Error(`Opening ${OPEN_TEXTS_DB_NAME} was blocked`));
  });
}

interface OpenTextStoreOptions {
  /**
   * Defaults to the global `indexedDB`. Injectable for tests; `null` means
   * IndexedDB is unavailable, so only the in-memory fallback is used.
   */
  factory?: IDBFactory | null;
  /** Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The Open Texts document and reading-position cache. No method rejects:
 * failures fall back to memory (writes) or read as a miss (reads).
 */
export class OpenTextStore {
  #dbPromise: Promise<IDBDatabase> | null = null;
  readonly #factory: IDBFactory | null;
  readonly #now: () => number;
  /** Used once IndexedDB is unavailable, and as a write-through fallback. */
  readonly #memoryDocs = new Map<string, OpenTextDocument>();
  readonly #memoryPositions = new Map<string, OpenTextReadingPosition>();

  constructor(options: OpenTextStoreOptions = {}) {
    this.#factory =
      options.factory !== undefined
        ? options.factory
        : typeof indexedDB === "undefined"
        ? null
        : indexedDB;
    this.#now = options.now ?? Date.now;
  }

  #db(): Promise<IDBDatabase> {
    if (this.#dbPromise === null) {
      const factory = this.#factory;
      this.#dbPromise = factory
        ? openDb(factory)
        : Promise.reject(new Error("IndexedDB is not available"));
      // A failed open is retried on the next call rather than cached.
      this.#dbPromise.catch(() => {
        this.#dbPromise = null;
      });
    }
    return this.#dbPromise;
  }

  async #store(
    name: string,
    mode: IDBTransactionMode
  ): Promise<{ store: IDBObjectStore; tx: IDBTransaction }> {
    const db = await this.#db();
    const tx = db.transaction(name, mode);
    return { store: tx.objectStore(name), tx };
  }

  /** The cached document for `key`, or undefined on a miss. */
  async getDocument(key: string): Promise<OpenTextDocument | undefined> {
    const memory = this.#memoryDocs.get(key);
    if (memory !== undefined) return memory;
    try {
      const { store } = await this.#store(
        OPEN_TEXTS_DOCUMENT_STORE,
        "readonly"
      );
      const row: unknown = await promisify(store.get(key));
      return parseStoredDocument(row) ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Caches `document` under `key` (from {@link openTextCacheKey}) and drops
   * other pinned commits of the same entry.
   */
  async putDocument(
    entryId: string,
    key: string,
    document: OpenTextDocument
  ): Promise<void> {
    const row: StoredDocumentRow = {
      key,
      entryId,
      document,
      savedAt: this.#now(),
    };
    try {
      const { store, tx } = await this.#store(
        OPEN_TEXTS_DOCUMENT_STORE,
        "readwrite"
      );
      const prefix = `${entryId}@`;
      const keys = await promisify(store.getAllKeys());
      for (const existing of keys) {
        if (
          typeof existing === "string" &&
          existing !== key &&
          existing.startsWith(prefix)
        ) {
          store.delete(existing);
        }
      }
      store.put(row);
      await committed(tx);
      this.#memoryDocs.delete(key);
    } catch {
      // Quota, private mode, or no IndexedDB: keep it for this page.
      this.#memoryDocs.set(key, document);
    }
  }

  /** The last page read in `workId`, if any. */
  async getPosition(
    workId: string
  ): Promise<OpenTextReadingPosition | undefined> {
    const memory = this.#memoryPositions.get(workId);
    if (memory !== undefined) return memory;
    try {
      const { store } = await this.#store(
        OPEN_TEXTS_POSITION_STORE,
        "readonly"
      );
      const row: unknown = await promisify(store.get(workId));
      return parseStoredPosition(row) ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** Remembers that `pageId` is the page being read in `workId`. */
  async setPosition(workId: string, pageId: string): Promise<void> {
    const position: OpenTextReadingPosition = {
      workId,
      pageId,
      updatedAt: this.#now(),
    };
    try {
      const { store, tx } = await this.#store(
        OPEN_TEXTS_POSITION_STORE,
        "readwrite"
      );
      store.put(position);
      await committed(tx);
      this.#memoryPositions.delete(workId);
    } catch {
      this.#memoryPositions.set(workId, position);
    }
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
