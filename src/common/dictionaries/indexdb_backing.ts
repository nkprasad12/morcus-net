import type {
  EntriesTableRow,
  RawDictEntry,
  StoredDictBacking,
  StoredOrthsTableRow,
} from "@/common/dictionaries/stored_dict_interface";
import { removeDiacritics } from "@/common/text_cleaning";
import type { DbConfig, Store } from "@/web/client/utils/indexdb/types";
import { wrappedIndexDb } from "@/web/client/utils/indexdb/wrappers";
import {
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";

export const ENTRIES_STORE = {
  name: "entriesTable",
  keyPath: "id",
  validator: matchesObject<EntriesTableRow>({ id: isString, entry: isString }),
} satisfies Store<EntriesTableRow>;

export const ORTHS_STORE = {
  name: "orthsTable",
  validator: matchesObject<StoredOrthsTableRow>({
    id: isString,
    orth: isString,
    cleanOrth: isString,
    reverseCleanOrth: isString,
    senseId: maybeUndefined(isString),
  }),
  indices: [{ keyPath: "cleanOrth" }, { keyPath: "reverseCleanOrth" }] as const,
} satisfies Store<StoredOrthsTableRow>;

export interface IndexDbDictConfig extends DbConfig {
  stores: [typeof ENTRIES_STORE, typeof ORTHS_STORE];
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

function cleanKey(key: string) {
  return removeDiacritics(key).toLowerCase().replaceAll("ß", "ss");
}

function orthRow(
  id: string,
  orth: string,
  senseId?: string
): StoredOrthsTableRow {
  const cleanOrth = cleanKey(orth);
  const reverseCleanOrth = cleanOrth.split("").reverse().join("");
  const result: StoredOrthsTableRow = { id, orth, cleanOrth, reverseCleanOrth };
  if (senseId !== undefined) {
    result.senseId = senseId;
  }
  return result;
}

/** Saves the given entries to the IndexedDb table. */
async function saveToIndexedDb(
  entries: RawDictEntry[],
  dbConfig: IndexDbDictConfig
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
    entry.keys.forEach((key) =>
      allPending.push(orthsStore.add(orthRow(entry.id, key)))
    );
    for (const [senseId, derivedOrths] of entry.derivedKeys ?? []) {
      derivedOrths.forEach((derived) =>
        allPending.push(orthsStore.add(orthRow(entry.id, derived, senseId)))
      );
    }
  }
  await Promise.allSettled(allPending);
  db.close();
}

function indexDbBacking(input: IndexDbDictConfig): StoredDictBacking<"Async"> {
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
      const cleanNameIndex = input.stores[1].indices[0];
      const query = IDBKeyRange.only(cleanName);
      const results = await store.searchIndex(cleanNameIndex, query);
      return results.map(({ id, orth, senseId }) => ({ id, orth, senseId }));
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
      const cleanNameIndex = input.stores[1].indices[0];
      const query = IDBKeyRange.lowerBound(prefix);
      const stopper = (row: StoredOrthsTableRow) =>
        !row.cleanOrth.startsWith(prefix);
      const results = await store.searchIndex(cleanNameIndex, query, stopper);
      const lookup = new Set<string>();
      for (const result of results) {
        lookup.add(result.orth);
      }
      return Array.from(lookup.values());
    },
    entryNamesBySuffix: async (suffix: string) => {
      const store = (await db).singleStore(ORTHS_STORE, "readonly");
      const cleanNameIndex = input.stores[1].indices[1];
      const reverseSuffix = suffix.split("").reverse().join("");
      const query = IDBKeyRange.lowerBound(reverseSuffix);
      const stopper = (row: StoredOrthsTableRow) =>
        !row.reverseCleanOrth.startsWith(reverseSuffix);
      const results = await store.searchIndex(cleanNameIndex, query, stopper);
      const lookup = new Set<string>();
      for (const result of results) {
        lookup.add(result.orth);
      }
      return Array.from(lookup.values());
    },
    lowMemory: true,
  };
}

/** A dictionary backed by IndexDB. */
export namespace IndexedDbDict {
  export const save = saveToIndexedDb;
  export const backing = indexDbBacking;
}
