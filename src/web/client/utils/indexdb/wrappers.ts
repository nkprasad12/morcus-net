import { assert } from "@/common/assert";
import {
  TransactionType,
  Store,
  ObjectStore,
  ReadOperations,
  WriteOperations,
  IndexDb,
  DbConfig,
  SingleStoreDbConfig,
  Closeable,
} from "@/web/client/utils/indexdb/types";

function openDb(config: DbConfig): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(config.dbName, config.version);
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () =>
      reject(`Error opening database ${config.dbName}`);
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

function wrapObjectStore<T extends object, U extends TransactionType>(
  raw: IDBObjectStore,
  store: Store<T>,
  _tType: U
): ObjectStore<T, U> {
  const readOperations: ReadOperations<T> = {
    get: (key) =>
      new Promise((resolve, reject) => {
        const operation = raw.get(key);
        operation.onerror = () => reject(`get failed on ${store.name}`);
        operation.onsuccess = () => {
          const t = operation.result;
          t === undefined ? reject("No match") : resolve(t);
        };
      }),
    getAll: () =>
      new Promise((resolve, reject) => {
        const operation = raw.getAll();
        operation.onerror = () => reject(`getAll failed on ${store.name}`);
        operation.onsuccess = () => resolve(operation.result);
      }),
  };
  const writeOperations: WriteOperations<T> = {
    add: (item: T) => {
      const isValid =
        Object.hasOwn(item, store.keyPath) &&
        (store.validator === undefined || store.validator(item));
      if (!isValid) {
        return Promise.reject(`Invalid object for store ${store.name}`);
      }
      return new Promise((resolve, reject) => {
        const operation = raw.add(item);
        operation.onerror = () => reject(`add failed on ${store.name}`);
        operation.onsuccess = () => resolve();
      });
    },
    delete: (key) =>
      new Promise((resolve, reject) => {
        const operation = raw.delete(key);
        operation.onerror = () => reject(`delete failed on ${store.name}`);
        operation.onsuccess = () => resolve();
      }),
  };
  return { ...readOperations, ...writeOperations, ...store };
}

async function wrappedIndexDb(config: DbConfig): Promise<IndexDb> {
  const db = await openDb(config);
  return {
    transaction: (stores, tType) => {
      stores.forEach((s) => assert(config.stores.includes(s)));
      const transaction = db.transaction(
        stores.map((s) => s.name),
        tType
      );
      return {
        objectStore: (storeConfig) => {
          assert(stores.includes(storeConfig));
          const store = transaction.objectStore(storeConfig.name);
          return wrapObjectStore(store, storeConfig, tType);
        },
      };
    },
    close: () => db.close(),
  };
}

/** Returns an IndexDb wrapper containing a single store. */
export function simpleIndexDbStore<T extends object>(
  config: SingleStoreDbConfig<T>
): ObjectStore<T, "readwrite"> & Closeable {
  const dbPromise = wrappedIndexDb(config);
  async function getStore<U extends TransactionType>(tType: U) {
    const db = await dbPromise;
    const transaction = db.transaction(config.stores, tType);
    return transaction.objectStore(config.stores[0]);
  }
  const readStore = () => getStore("readonly");
  const writeStore = () => getStore("readwrite");
  return {
    ...config.stores[0],
    get: (k) => readStore().then((s) => s.get(k)),
    getAll: () => readStore().then((s) => s.getAll()),
    add: (t) => writeStore().then((s) => s.add(t)),
    delete: (k) => writeStore().then((s) => s.delete(k)),
    close: () => dbPromise.then((db) => db.close()),
  };
}
