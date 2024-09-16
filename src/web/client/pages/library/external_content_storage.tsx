import { useCloseable } from "@/web/client/utils/indexdb/hooks";
import type {
  ObjectStore,
  SingleStoreDbConfig,
  Store,
} from "@/web/client/utils/indexdb/types";
import { simpleIndexDbStore } from "@/web/client/utils/indexdb/wrappers";
import React, { useCallback, useContext, createContext } from "react";

namespace IndexDbBackend {
  type Row = ContentIndex & SavedContent;
  type RowStore = ObjectStore<Row, "readwrite">;
  const CONTENT_STORE: Store<Row> = {
    name: "savedContent",
    keyPath: "storageKey",
  };
  const DB_CONFIG: SingleStoreDbConfig<Row> = {
    dbName: "externalContent.db",
    version: 1,
    stores: [CONTENT_STORE],
  };

  function backend(store: RowStore): SavedContentBackend {
    const getContentIndex = () =>
      store.getAll().then((rows) =>
        rows.map((row) => ({
          storageKey: row.storageKey,
          title: row.title,
          source: row.source,
        }))
      );
    return {
      getContentIndex,
      loadContent: (k) => store.get(k),
      deleteContent: async (key) => {
        await store.delete(key);
        return getContentIndex();
      },
      saveContent: async (text: SavedContent) => {
        const storageKey =
          text.source === "fromUrl"
            ? text.title
            : `${text.title}_${Date.now()}`;
        await store.add({ ...text, storageKey });
        return getContentIndex();
      },
    };
  }

  export function useBackend(): SavedContentBackend {
    const store = useCloseable(() => simpleIndexDbStore(DB_CONFIG));
    const memoizedBacked = React.useMemo(() => backend(store), [store]);
    return memoizedBacked;
  }
}

export interface ContentIndex {
  /** The title of the indexed content. */
  title: string;
  /** The key by which the indexed content is saved. */
  storageKey: string;
  /** The type of input that produced this content. */
  source?: SavedContentSource;
}
export type SavedContentSource = "fromUrl";
export interface SavedContent {
  /** The title of the indexed content. */
  title: string;
  /** The raw text of the content. */
  content: string;
  /** The type of input that produced this content. */
  source?: SavedContentSource;
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
export const BackendProviderContext = createContext<{
  useBackend: () => SavedContentBackend;
}>({
  useBackend: IndexDbBackend.useBackend,
});

export function useSavedExternalContent(): SavedContentHandler {
  const [list, setList] = React.useState<ContentIndex[] | undefined>(undefined);
  const { useBackend } = useContext(BackendProviderContext);
  const backend = useBackend();

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
