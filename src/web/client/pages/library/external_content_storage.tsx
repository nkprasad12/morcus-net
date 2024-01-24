import { singletonOf } from "@/common/misc_utils";
import React, { useCallback, useContext, createContext } from "react";

namespace IndexDbWrapper {
  export interface DbConfig {
    dbName: string;
    version: number;
    stores: {
      name: string;
      keyPath: string;
    }[];
  }

  export function openDb(config: DbConfig): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const openRequest = indexedDB.open(config.dbName, config.version);
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject("Error opening database");
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;
        for (const store of config.stores) {
          if (!db.objectStoreNames.contains(store.name)) {
            db.createObjectStore(store.name, { keyPath: store.keyPath });
          }
        }
      };
    });
  }
}

namespace IndexDbBackend {
  const CONTENT_STORE = "savedContent";
  const DB_CONFIG: IndexDbWrapper.DbConfig = {
    dbName: "externalContent.db",
    version: 1,
    stores: [
      {
        name: CONTENT_STORE,
        keyPath: "storageKey",
      },
    ],
  };

  const db = singletonOf(() => IndexDbWrapper.openDb(DB_CONFIG));

  async function saveContent(text: SavedContent): Promise<ContentIndex[]> {
    const storageKey = `${text.title}_${Date.now()}`;
    const transaction = (await db.get()).transaction(
      CONTENT_STORE,
      "readwrite"
    );
    return new Promise((resolve, reject) => {
      const rows = transaction.objectStore(CONTENT_STORE);
      const request = rows.add({ ...text, storageKey });
      request.onerror = () => reject("Error saving content");
      request.onsuccess = () => {
        // TODO: Figure out how to check the titles only
        const allRequest = rows.getAll();
        allRequest.onerror = () => reject("Error getting index");
        allRequest.onsuccess = () =>
          resolve(
            allRequest.result.map((x) => ({
              storageKey: x.storageKey,
              title: x.title,
            }))
          );
      };
    });
  }

  async function deleteContent(key: string): Promise<ContentIndex[]> {
    const transaction = (await db.get()).transaction(
      CONTENT_STORE,
      "readwrite"
    );
    return new Promise((resolve, reject) => {
      const rows = transaction.objectStore(CONTENT_STORE);
      const request = rows.delete(key);
      request.onerror = () => reject("Error deleting content");
      request.onsuccess = () => {
        // TODO: Figure out how to check the titles only
        const allRequest = rows.getAll();
        allRequest.onerror = () => reject("Error getting index");
        allRequest.onsuccess = () =>
          resolve(
            allRequest.result.map((x) => ({
              storageKey: x.storageKey,
              title: x.title,
            }))
          );
      };
    });
  }

  async function loadContent(key: string): Promise<SavedContent> {
    const transaction = (await db.get()).transaction(CONTENT_STORE);
    return new Promise((resolve, reject) => {
      const rows = transaction.objectStore(CONTENT_STORE);
      const request = rows.get(key);
      request.onerror = () => reject("Error retrieving content");
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function getContentIndex(): Promise<ContentIndex[]> {
    const transaction = (await db.get()).transaction(CONTENT_STORE);
    return new Promise((resolve, reject) => {
      const rows = transaction.objectStore(CONTENT_STORE);
      const request = rows.getAll();
      request.onerror = () => reject("Error retrieving content");
      request.onsuccess = () =>
        resolve(
          request.result.map((x) => ({
            storageKey: x.storageKey,
            title: x.title,
          }))
        );
    });
  }

  export const BACKEND: SavedContentBackend = {
    getContentIndex,
    deleteContent,
    saveContent,
    loadContent,
  };
}

export interface ContentIndex {
  /** The title of the indexed content. */
  title: string;
  /** The key by which the indexed content is saved. */
  storageKey: string;
}
export interface SavedContent {
  /** The title of the indexed content. */
  title: string;
  /** The raw text of the content. */
  content: string;
}
export interface SavedContentHandler {
  /** A list of the stored content, or undefined if not yet loaded. */
  contentIndex: ContentIndex[] | undefined;
  /** Deleted saved content with the given key. */
  deleteContent: (key: string) => Promise<void>;
  /** Saves the given content. */
  saveContent: (content: SavedContent) => Promise<void>;
  /** Retrieves the external content with the given key. */
  loadContent: (key: string) => Promise<SavedContent>;
}
export interface SavedContentBackend {
  /** Retrieves the index of external content. */
  getContentIndex: () => Promise<ContentIndex[]>;
  /** Deleted saved content with the given key and returns the updated index. */
  deleteContent: (key: string) => Promise<ContentIndex[]>;
  /** Saves the given content and returns the updated index. */
  saveContent: (content: SavedContent) => Promise<ContentIndex[]>;
  /** Retrieves the external content with the given key. */
  loadContent: (key: string) => Promise<SavedContent>;
}
const DEFAULT_BACKEND: SavedContentBackend = IndexDbBackend.BACKEND;
export const SavedContentBackendContext =
  createContext<SavedContentBackend>(DEFAULT_BACKEND);

export function useSavedExternalContent(): SavedContentHandler {
  const [list, setList] = React.useState<ContentIndex[] | undefined>(undefined);
  const backend = useContext(SavedContentBackendContext);

  React.useEffect(() => {
    backend.getContentIndex().then(setList);
  }, [setList, backend]);

  const deleteContent = useCallback(
    (key: string) => backend.deleteContent(key).then(setList),
    [setList, backend]
  );

  const saveContent = useCallback(
    (content: SavedContent) => backend.saveContent(content).then(setList),
    [setList, backend]
  );

  return {
    contentIndex: list,
    deleteContent,
    saveContent,
    loadContent: backend.loadContent,
  };
}
