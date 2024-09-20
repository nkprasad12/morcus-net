import type {
  RawDictEntry,
  StoredDictBacking,
} from "@/common/dictionaries/stored_dict_interface";
import { removeDiacritics } from "@/common/text_cleaning";
import type { DbConfig, Store } from "@/web/client/utils/indexdb/types";
import { wrappedIndexDb } from "@/web/client/utils/indexdb/wrappers";
import { isString, matches } from "@/web/utils/rpc/parsing";

interface EntriesTableRow {
  id: string;
  entry: string;
}

export const ENTRIES_STORE: Store<EntriesTableRow> = {
  name: "entriesTable",
  keyPath: "id",
  validator: matches([
    ["id", isString],
    ["entry", isString],
  ]),
};

interface OrthsTableRow {
  id: string;
  orth: string;
  cleanOrth: string;
}

// TODO: The Sqlite implementation has cleanOrth as an index.
export const ORTHS_STORE: Store<OrthsTableRow> = {
  name: "orthsTable",
  validator: matches([
    ["id", isString],
    ["orth", isString],
    ["cleanOrth", isString],
  ]),
};

export interface IndexDbDictConfig extends DbConfig {
  stores: [Store<EntriesTableRow>, Store<OrthsTableRow>];
}

export const SH_CONFIG: IndexDbDictConfig = {
  dbName: "smithAndHallDict",
  version: 1,
  stores: [ENTRIES_STORE, ORTHS_STORE],
};

export const LS_CONFIG: IndexDbDictConfig = {
  dbName: "lewisAndShortDict",
  version: 1,
  stores: [ENTRIES_STORE, ORTHS_STORE],
};

/** Saves the given entries to the IndexedDb table. */
async function saveToIndexedDb(
  entries: RawDictEntry[],
  dbConfig: DbConfig
): Promise<void> {
  // # # # # #
  // IMPORTANT If the implementation here is updated, also change `sqlite_backing`!
  // # # # # #
  const db = await wrappedIndexDb(dbConfig);
  const transaction = db.transaction([ENTRIES_STORE, ORTHS_STORE], "readwrite");
  const entriesStore = transaction.objectStore(ENTRIES_STORE);
  const orthsStore = transaction.objectStore(ORTHS_STORE);
  const allPending: Promise<unknown>[] = [];
  for (const entry of entries) {
    allPending.push(entriesStore.add({ id: entry.id, entry: entry.entry }));
    entry.keys.forEach(async (key) => {
      allPending.push(
        orthsStore.add({
          id: entry.id,
          orth: key,
          cleanOrth: removeDiacritics(key).toLowerCase(),
        })
      );
    });
  }
  await Promise.allSettled(allPending);
  db.close();
}

function indexDbBacking(input: DbConfig): StoredDictBacking<"Async"> {
  const db = wrappedIndexDb(input);
  return {
    allEntryNames: async () => {
      const store = (await db).singleStore(ORTHS_STORE, "readonly");
      const results: { orth: string; cleanOrth: string }[] = [];
      for (const row of await store.getAll()) {
        results.push({ orth: row.orth, cleanOrth: row.cleanOrth });
      }
      results.sort((a, b) => a.cleanOrth.localeCompare(b.cleanOrth, "en"));
      return results;
    },
    matchesForCleanName: async (cleanName: string) => {
      const store = (await db).singleStore(ORTHS_STORE, "readonly");
      // TODO: The Sqlite implementation has cleanOrth as an index.
      // Once we have an index, rewrite this to be more efficient.
      const rows = await store.getAll();
      const results: { id: string; orth: string }[] = [];
      for (const row of rows) {
        if (row.cleanOrth === cleanName) {
          results.push({ id: row.id, orth: row.orth });
        }
      }
      return results;
    },
    entriesForIds: async (ids: string[]) => {
      const store = (await db).singleStore(ENTRIES_STORE, "readonly");
      const results: EntriesTableRow[] = [];
      const operations = ids.map((id) => store.get(id));
      for (const operation of operations) {
        try {
          results.push(await operation);
        } catch {
          // We'll only return the results that are valid keys.
        }
      }
      return results;
    },
    entryNamesByPrefix: async (prefix: string) => {
      const store = (await db).singleStore(ORTHS_STORE, "readonly");
      // TODO: The Sqlite implementation has cleanOrth as an index.
      // Once we have an index, rewrite this to be more efficient.
      const rows = await store.getAll();
      const items = new Map<string, { orth: string }>();
      for (const row of rows) {
        if (!row.cleanOrth.startsWith(prefix)) {
          continue;
        }
        items.set(row.orth, { orth: row.orth });
      }
      return [...items.values()];
    },
  };
}

/** A dictionary backed by IndexDB. */
export namespace IndexedDbDict {
  export const save = saveToIndexedDb;
  export const backing = indexDbBacking;
}
