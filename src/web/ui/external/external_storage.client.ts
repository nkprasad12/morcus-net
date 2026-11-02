/**
 * Device-local storage for External Content Reader imports.
 *
 * Reads and writes **V1's IndexedDB schema unchanged** (database
 * `externalContent.db` v1, store `savedContent`, keyPath `storageKey`; see
 * `archive/ui-v1:src/web/client/pages/library/external_content_storage.tsx`), so texts a
 * reader imported in V1 appear in V2 and vice versa. This follows the
 * precedent of V2 reusing V1 storage keys such as `macronButton-${workId}`.
 *
 * Storage key rules:
 * - URL imports are keyed by their URL (so re-importing refreshes them).
 * - Pasted texts are keyed by an opaque random UUID (`crypto.randomUUID()`), so
 *   the key in `?local=<key>` never leaks words of the text or title in server
 *   request logs.
 * - V2 adds optional fields (`lineMode`, `savedAt`). V1's store has no
 *   validator, so it ignores them; V2 treats them as optional on read.
 * - Rows are validated on read, and malformed ones are skipped rather than
 *   failing the whole list, the same stance as `pickValid` for settings.
 *
 * Pasted text never leaves the device: nothing here talks to the server.
 */

import {
  committed,
  IndexedDbConnection,
  isRecord,
  promisify,
} from "@/web/ui/core/storage/idb.client";
import {
  parseLineMode,
  type LineMode,
} from "@/web/ui/external/external_text.common";

export const EXTERNAL_CONTENT_DB_NAME = "externalContent.db";
export const EXTERNAL_CONTENT_DB_VERSION = 1;
export const EXTERNAL_CONTENT_STORE = "savedContent";

/** V1's `SavedContentSource`. Absent for pasted text. */
type ExternalContentSource = "fromUrl";

export interface ExternalContentSummary {
  storageKey: string;
  title: string;
  source?: ExternalContentSource;
  /** Epoch millis. Absent on rows written by V1. */
  savedAt?: number;
  /** The last line mode used; V1 rows read as the default. */
  lineMode: LineMode;
}

interface ExternalContentRecord extends ExternalContentSummary {
  content: string;
}

interface NewExternalContent {
  title: string;
  content: string;
  source?: ExternalContentSource;
  lineMode?: LineMode;
}

/** Validates a stored row, tolerating both V1 and V2 shapes. */
export function parseStoredRow(row: unknown): ExternalContentRecord | null {
  if (!isRecord(row)) return null;
  const { storageKey, title, content, source, savedAt, lineMode } = row;
  if (
    typeof storageKey !== "string" ||
    typeof title !== "string" ||
    typeof content !== "string"
  ) {
    return null;
  }
  const record: ExternalContentRecord = {
    storageKey,
    title,
    content,
    lineMode: parseLineMode(lineMode),
  };
  if (source === "fromUrl") record.source = source;
  if (typeof savedAt === "number" && Number.isFinite(savedAt)) {
    record.savedAt = savedAt;
  }
  return record;
}

/**
 * Generates an opaque random UUID. Uses `crypto.randomUUID()` when available,
 * falling back to `crypto.getRandomValues()` (e.g. in jsdom test environments).
 */
function generateOpaqueKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      ""
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Returns the storage key: URL for web page imports, opaque UUID for pasted text.
 * Pasted text keys must be opaque to keep text and titles out of URLs and server logs.
 */
export function storageKeyFor(
  content: Pick<NewExternalContent, "source" | "title">,
  generateId: () => string = generateOpaqueKey
): string {
  return content.source === "fromUrl" ? content.title : generateId();
}

interface ExternalContentStoreOptions {
  /**
   * Defaults to the global `indexedDB`. Injectable for tests; `null` means
   * IndexedDB is unavailable.
   */
  factory?: IDBFactory | null;
  /** Defaults to `Date.now`. Injectable for deterministic keys in tests. */
  now?: () => number;
  /** Defaults to `generateOpaqueKey`. Injectable for deterministic keys in tests. */
  generateId?: () => string;
}

/**
 * Lazily-opened handle on the saved-imports store. Every method rejects if
 * IndexedDB is unavailable (e.g. disabled, or some private modes), so callers
 * can degrade to "saving isn't available in this browser".
 */
export class ExternalContentStore {
  readonly #conn: IndexedDbConnection;
  readonly #now: () => number;
  readonly #generateId: () => string;

  constructor(options: ExternalContentStoreOptions = {}) {
    this.#conn = new IndexedDbConnection({
      dbName: EXTERNAL_CONTENT_DB_NAME,
      version: EXTERNAL_CONTENT_DB_VERSION,
      stores: [{ name: EXTERNAL_CONTENT_STORE, keyPath: "storageKey" }],
      factory: options.factory,
    });
    this.#now = options.now ?? Date.now;
    this.#generateId = options.generateId ?? generateOpaqueKey;
  }

  async #objectStore(
    mode: IDBTransactionMode
  ): Promise<{ store: IDBObjectStore; tx: IDBTransaction }> {
    const db = await this.#conn.db();
    const tx = db.transaction(EXTERNAL_CONTENT_STORE, mode);
    return { store: tx.objectStore(EXTERNAL_CONTENT_STORE), tx };
  }

  /**
   * Lists saved imports, newest first. V1 rows have no `savedAt` and sort
   * after V2 rows, in key order among themselves.
   */
  async list(): Promise<ExternalContentSummary[]> {
    const { store } = await this.#objectStore("readonly");
    const rows = await promisify(store.getAll());
    const summaries: ExternalContentSummary[] = [];
    for (const row of rows) {
      const record = parseStoredRow(row);
      if (record === null) continue;
      const summary: ExternalContentSummary = {
        storageKey: record.storageKey,
        title: record.title,
        lineMode: record.lineMode,
      };
      if (record.source) summary.source = record.source;
      if (record.savedAt !== undefined) summary.savedAt = record.savedAt;
      summaries.push(summary);
    }
    return summaries.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }

  /** Returns the saved import for `storageKey`, or undefined if absent. */
  async get(storageKey: string): Promise<ExternalContentRecord | undefined> {
    const { store } = await this.#objectStore("readonly");
    const row: unknown = await promisify(store.get(storageKey));
    return parseStoredRow(row) ?? undefined;
  }

  /**
   * Saves an import and returns its storage key. Uses `put`, so re-importing
   * a URL refreshes the cached copy instead of failing on the existing key.
   */
  async save(content: NewExternalContent): Promise<string> {
    const now = this.#now();
    const storageKey = storageKeyFor(content, this.#generateId);
    const row: ExternalContentRecord = {
      storageKey,
      title: content.title,
      content: content.content,
      lineMode: parseLineMode(content.lineMode),
      savedAt: now,
    };
    if (content.source) row.source = content.source;
    const { store, tx } = await this.#objectStore("readwrite");
    store.put(row);
    await committed(tx);
    return storageKey;
  }

  /** Remembers a new line mode for an existing import. No-op if absent. */
  async setLineMode(storageKey: string, lineMode: LineMode): Promise<void> {
    const { store, tx } = await this.#objectStore("readwrite");
    const existing = parseStoredRow(await promisify(store.get(storageKey)));
    if (existing !== null) {
      store.put({ ...existing, lineMode });
    }
    await committed(tx);
  }

  /** Deletes an import. Deleting a missing key is not an error. */
  async delete(storageKey: string): Promise<void> {
    const { store, tx } = await this.#objectStore("readwrite");
    store.delete(storageKey);
    await committed(tx);
  }

  /** Closes the connection, e.g. on element disconnect or in tests. */
  async close(): Promise<void> {
    await this.#conn.close();
  }
}
