/**
 * Device-local cache for the Experimental Texts reader
 * (`<morcus-experimental-text-reader>`).
 *
 * Experimental Texts are fetched from their pinned upstream commit and parsed
 * on the reader's device, so the parsed {@link ExperimentalTextDocument} is cached
 * here to make reopening a work instant and offline-safe. Three stores:
 *
 * - `documents`: parsed documents keyed by {@link experimentalTextCacheKey}
 *   (`<entry id>@<pinned commit>@v<document version>`). A new pin or a parser
 *   change is a new key, so the source is re-fetched rather than served
 *   stale; older keys of the same entry are dropped when the new one is
 *   written.
 * - `documentAccess`: one small row per cached document recording when it was
 *   last opened, so eviction never has to load the (multi-megabyte) documents
 *   themselves. Every write evicts documents not opened in
 *   {@link EXPERIMENTAL_TEXTS_DOCUMENT_MAX_AGE_MS} and keeps at most the
 *   {@link EXPERIMENTAL_TEXTS_MAX_DOCUMENTS} most recently opened. A write that still
 *   exceeds the quota evicts the oldest document and retries once.
 * - `positions`: the last page read per entry ({@link ExperimentalTextReadingPosition}),
 *   so `/experimentalTexts?open=<id>` without `&page=` reopens where the reader was.
 *   Positions are tiny and are never evicted, so an evicted work still reopens
 *   at the right page; it is just downloaded again.
 *
 * Everything here is best effort. When IndexedDB is unavailable (disabled,
 * some private modes) or an operation fails, the store degrades to an
 * in-memory map for the rest of the page's life, and a document the browser
 * evicted is simply a cache miss: the reader quietly re-fetches it.
 */

import {
  EXPERIMENTAL_TEXT_DOCUMENT_VERSION,
  type ExperimentalTextDocument,
} from "@/common/experimental_texts/experimental_text_document";
import {
  committed,
  IndexedDbConnection,
  isQuotaError,
  isRecord,
  promisify,
} from "@/web/ui/core/storage/idb.client";

export const EXPERIMENTAL_TEXTS_DB_NAME = "morcusExperimentalTexts.db";
export const EXPERIMENTAL_TEXTS_DB_VERSION = 1;
export const EXPERIMENTAL_TEXTS_DOCUMENT_STORE = "documents";
export const EXPERIMENTAL_TEXTS_ACCESS_STORE = "documentAccess";
export const EXPERIMENTAL_TEXTS_POSITION_STORE = "positions";

/** Documents not opened for this long are evicted on the next write. */
export const EXPERIMENTAL_TEXTS_DOCUMENT_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
/** At most this many documents are cached (the most recently opened). */
export const EXPERIMENTAL_TEXTS_MAX_DOCUMENTS = 20;

/** The last page read in one Experimental Text. */
export interface ExperimentalTextReadingPosition {
  /** The catalog entry id (`ExperimentalTextCatalogEntry.id`). */
  workId: string;
  /** The `ExperimentalTextPage.id` last shown. */
  pageId: string;
  /** Epoch millis. */
  updatedAt: number;
}

interface StoredDocumentRow {
  key: string;
  entryId: string;
  document: ExperimentalTextDocument;
  savedAt: number;
}

interface DocumentAccessRow {
  key: string;
  entryId: string;
  /** Epoch millis of the last read (or the write, if never read since). */
  lastOpenedAt: number;
}

/**
 * The cache key for a parsed document: the entry at its pinned commit, as
 * parsed by the current {@link EXPERIMENTAL_TEXT_DOCUMENT_VERSION}.
 */
export function experimentalTextCacheKey(
  entryId: string,
  commit: string
): string {
  return `${entryId}@${commit}@v${EXPERIMENTAL_TEXT_DOCUMENT_VERSION}`;
}

/**
 * Shallow validation of a stored document: enough that the reader can render
 * it without crashing. Anything else (an older schema, a corrupt row) reads as
 * a miss and is re-fetched.
 */
export function parseStoredDocument(
  row: unknown
): ExperimentalTextDocument | null {
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
  return doc as unknown as ExperimentalTextDocument;
}

/** Validates a stored reading position. */
export function parseStoredPosition(
  row: unknown
): ExperimentalTextReadingPosition | null {
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

function parseAccessRow(row: unknown): DocumentAccessRow | null {
  if (!isRecord(row)) return null;
  const { key, entryId, lastOpenedAt } = row;
  if (
    typeof key !== "string" ||
    typeof entryId !== "string" ||
    typeof lastOpenedAt !== "number"
  ) {
    return null;
  }
  return { key, entryId, lastOpenedAt };
}

interface ExperimentalTextStoreOptions {
  /**
   * Defaults to the global `indexedDB`. Injectable for tests; `null` means
   * IndexedDB is unavailable, so only the in-memory fallback is used.
   */
  factory?: IDBFactory | null;
  /** Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * The Experimental Texts document and reading-position cache. No method
 * rejects: failures fall back to memory (writes) or read as a miss (reads).
 */
export class ExperimentalTextStore {
  readonly #conn: IndexedDbConnection;
  readonly #now: () => number;
  /** Used once IndexedDB is unavailable, and as a write-through fallback. */
  readonly #memoryDocs = new Map<string, ExperimentalTextDocument>();
  readonly #memoryPositions = new Map<
    string,
    ExperimentalTextReadingPosition
  >();

  constructor(options: ExperimentalTextStoreOptions = {}) {
    this.#conn = new IndexedDbConnection({
      dbName: EXPERIMENTAL_TEXTS_DB_NAME,
      version: EXPERIMENTAL_TEXTS_DB_VERSION,
      stores: [
        { name: EXPERIMENTAL_TEXTS_DOCUMENT_STORE, keyPath: "key" },
        { name: EXPERIMENTAL_TEXTS_ACCESS_STORE, keyPath: "key" },
        { name: EXPERIMENTAL_TEXTS_POSITION_STORE, keyPath: "workId" },
      ],
      factory: options.factory,
    });
    this.#now = options.now ?? Date.now;
  }

  /**
   * The cached document for `key`, or undefined on a miss. A hit records
   * that the document was opened now, which keeps it from being evicted.
   */
  async getDocument(
    key: string
  ): Promise<ExperimentalTextDocument | undefined> {
    const memory = this.#memoryDocs.get(key);
    if (memory !== undefined) return memory;
    try {
      const db = await this.#conn.db();
      const tx = db.transaction(
        [EXPERIMENTAL_TEXTS_DOCUMENT_STORE, EXPERIMENTAL_TEXTS_ACCESS_STORE],
        "readwrite"
      );
      const done = committed(tx);
      // A failed access write must not turn a hit into a miss.
      done.catch(() => {});
      const row: unknown = await promisify(
        tx.objectStore(EXPERIMENTAL_TEXTS_DOCUMENT_STORE).get(key)
      );
      const document = parseStoredDocument(row);
      if (document === null) return undefined;
      const access: DocumentAccessRow = {
        key,
        entryId:
          isRecord(row) && typeof row.entryId === "string" ? row.entryId : "",
        lastOpenedAt: this.#now(),
      };
      tx.objectStore(EXPERIMENTAL_TEXTS_ACCESS_STORE).put(access);
      return document;
    } catch {
      return undefined;
    }
  }

  /**
   * Caches `document` under `key` (from {@link experimentalTextCacheKey}), dropping
   * other keys of the same entry and evicting documents that are stale or
   * over the cap.
   */
  async putDocument(
    entryId: string,
    key: string,
    document: ExperimentalTextDocument
  ): Promise<void> {
    try {
      try {
        await this.#writeDocument(entryId, key, document);
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        // Still over the quota: make room by evicting the oldest document.
        await this.#evictOldest(key);
        await this.#writeDocument(entryId, key, document);
      }
      this.#memoryDocs.delete(key);
    } catch {
      // Quota, private mode, or no IndexedDB: keep it for this page.
      this.#memoryDocs.set(key, document);
    }
  }

  async #writeDocument(
    entryId: string,
    key: string,
    document: ExperimentalTextDocument
  ): Promise<void> {
    const now = this.#now();
    const db = await this.#conn.db();
    const tx = db.transaction(
      [EXPERIMENTAL_TEXTS_DOCUMENT_STORE, EXPERIMENTAL_TEXTS_ACCESS_STORE],
      "readwrite"
    );
    const done = committed(tx);
    // Rejections are awaited below; this only silences an early abort.
    done.catch(() => {});
    const docs = tx.objectStore(EXPERIMENTAL_TEXTS_DOCUMENT_STORE);
    const access = tx.objectStore(EXPERIMENTAL_TEXTS_ACCESS_STORE);
    const [docKeys, accessRows] = await Promise.all([
      promisify(docs.getAllKeys()),
      promisify(access.getAll()),
    ]);
    const evict = new Set<string>();
    const keep: DocumentAccessRow[] = [];
    const tracked = new Set<string>();
    const prefix = `${entryId}@`;
    for (const value of accessRows) {
      const row = parseAccessRow(value);
      if (row === null) continue;
      tracked.add(row.key);
      if (row.key === key) continue;
      if (
        row.key.startsWith(prefix) ||
        now - row.lastOpenedAt > EXPERIMENTAL_TEXTS_DOCUMENT_MAX_AGE_MS
      ) {
        evict.add(row.key);
      } else {
        keep.push(row);
      }
    }
    // Room for the new document within the cap: the most recently opened stay.
    keep.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    for (const row of keep.slice(EXPERIMENTAL_TEXTS_MAX_DOCUMENTS - 1)) {
      evict.add(row.key);
    }
    for (const existing of docKeys) {
      // Documents without an access row can never be aged out: drop them.
      if (
        typeof existing === "string" &&
        existing !== key &&
        (existing.startsWith(prefix) || !tracked.has(existing))
      ) {
        evict.add(existing);
      }
    }
    for (const stale of evict) {
      docs.delete(stale);
      access.delete(stale);
    }
    const row: StoredDocumentRow = { key, entryId, document, savedAt: now };
    docs.put(row);
    const accessRow: DocumentAccessRow = { key, entryId, lastOpenedAt: now };
    access.put(accessRow);
    await done;
  }

  /** Evicts the least recently opened document other than `exceptKey`. */
  async #evictOldest(exceptKey: string): Promise<void> {
    const db = await this.#conn.db();
    const tx = db.transaction(
      [EXPERIMENTAL_TEXTS_DOCUMENT_STORE, EXPERIMENTAL_TEXTS_ACCESS_STORE],
      "readwrite"
    );
    const done = committed(tx);
    done.catch(() => {});
    const rows = (
      await promisify(tx.objectStore(EXPERIMENTAL_TEXTS_ACCESS_STORE).getAll())
    )
      .map(parseAccessRow)
      .filter((row): row is DocumentAccessRow => row !== null)
      .filter((row) => row.key !== exceptKey);
    if (rows.length > 0) {
      const oldest = rows.reduce((a, b) =>
        b.lastOpenedAt < a.lastOpenedAt ? b : a
      );
      tx.objectStore(EXPERIMENTAL_TEXTS_DOCUMENT_STORE).delete(oldest.key);
      tx.objectStore(EXPERIMENTAL_TEXTS_ACCESS_STORE).delete(oldest.key);
    }
    await done;
  }

  /**
   * Drops the cached document for `key`, e.g. one that no longer renders.
   * The reading position stays.
   */
  async deleteDocument(key: string): Promise<void> {
    this.#memoryDocs.delete(key);
    try {
      const db = await this.#conn.db();
      const tx = db.transaction(
        [EXPERIMENTAL_TEXTS_DOCUMENT_STORE, EXPERIMENTAL_TEXTS_ACCESS_STORE],
        "readwrite"
      );
      tx.objectStore(EXPERIMENTAL_TEXTS_DOCUMENT_STORE).delete(key);
      tx.objectStore(EXPERIMENTAL_TEXTS_ACCESS_STORE).delete(key);
      await committed(tx);
    } catch {
      // Nothing cached, or no IndexedDB: nothing to drop.
    }
  }

  /** The last page read in `workId`, if any. */
  async getPosition(
    workId: string
  ): Promise<ExperimentalTextReadingPosition | undefined> {
    const memory = this.#memoryPositions.get(workId);
    if (memory !== undefined) return memory;
    try {
      const db = await this.#conn.db();
      const store = db
        .transaction(EXPERIMENTAL_TEXTS_POSITION_STORE, "readonly")
        .objectStore(EXPERIMENTAL_TEXTS_POSITION_STORE);
      const row: unknown = await promisify(store.get(workId));
      return parseStoredPosition(row) ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** Remembers that `pageId` is the page being read in `workId`. */
  async setPosition(workId: string, pageId: string): Promise<void> {
    const position: ExperimentalTextReadingPosition = {
      workId,
      pageId,
      updatedAt: this.#now(),
    };
    try {
      const db = await this.#conn.db();
      const tx = db.transaction(EXPERIMENTAL_TEXTS_POSITION_STORE, "readwrite");
      tx.objectStore(EXPERIMENTAL_TEXTS_POSITION_STORE).put(position);
      await committed(tx);
      this.#memoryPositions.delete(workId);
    } catch {
      this.#memoryPositions.set(workId, position);
    }
  }

  /** Closes the connection, e.g. on element disconnect or in tests. */
  async close(): Promise<void> {
    await this.#conn.close();
  }
}
