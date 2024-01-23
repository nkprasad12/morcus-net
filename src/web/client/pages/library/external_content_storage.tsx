import React, { useCallback, useContext, createContext } from "react";

const SAVED_ITEMS_LIST_KEY = "EXTERNAL_CONTENT_READER_SAVED_LIST";
const UNKNOWN_TEXT: SavedContent = { title: "Title", content: "Unknown" };

namespace LocalStorageBackend {
  export async function getContentIndex(): Promise<ContentIndex[]> {
    const result = localStorage.getItem(SAVED_ITEMS_LIST_KEY);
    if (result === null) {
      return [];
    }
    return JSON.parse(result);
  }

  async function addToIndex(item: ContentIndex): Promise<ContentIndex[]> {
    const previous = await getContentIndex();
    previous.push(item);
    localStorage.setItem(SAVED_ITEMS_LIST_KEY, JSON.stringify(previous));
    return previous;
  }

  export async function deleteContent(key: string): Promise<ContentIndex[]> {
    localStorage.removeItem(key);
    const previous = await getContentIndex();
    const purgedList = previous.filter((item) => item.storageKey !== key);
    localStorage.setItem(SAVED_ITEMS_LIST_KEY, JSON.stringify(purgedList));
    return purgedList;
  }

  export function saveContent(text: SavedContent): Promise<ContentIndex[]> {
    const storageKey = `EXTERNAL_CONTENT_${text.title}_${Date.now()}`;
    localStorage.setItem(storageKey, text.content);
    return addToIndex({ title: text.title, storageKey });
  }

  export async function loadContent(key: string): Promise<SavedContent> {
    const savedList = await getContentIndex();
    const savedItem = savedList.filter((item) => item.storageKey === key)[0];
    if (savedItem === undefined) {
      return UNKNOWN_TEXT;
    }
    const candidate = localStorage.getItem(savedItem.storageKey);
    if (candidate === null) {
      return UNKNOWN_TEXT;
    }
    return { title: savedItem.title, content: candidate };
  }
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
const DEFAULT_BACKEND: SavedContentBackend = {
  getContentIndex: LocalStorageBackend.getContentIndex,
  deleteContent: LocalStorageBackend.deleteContent,
  saveContent: LocalStorageBackend.saveContent,
  loadContent: LocalStorageBackend.loadContent,
};
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
