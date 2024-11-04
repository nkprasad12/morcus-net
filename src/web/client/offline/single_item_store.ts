import type {
  Closeable,
  SingleStoreDbConfig,
} from "@/web/client/utils/indexdb/types";
import { simpleIndexDbStore } from "@/web/client/utils/indexdb/wrappers";
import { isAny, matchesObject, type Validator } from "@/web/utils/rpc/parsing";

const ITEM_ID = 0;

// A store for a single item in IndexedDB.
export interface SingleItemStore<T> {
  /** Returns the current value from the database. */
  get: () => Promise<T>;
  /** Updates the current value in the database. */
  set: (item: T) => Promise<void>;
}

async function withCloseable<T extends Closeable, U>(
  init: () => T,
  operation: (t: T) => U | Promise<U>
): Promise<U> {
  const t = init();
  try {
    return await operation(t);
  } finally {
    t.close();
  }
}

export namespace SingleItemStore {
  export function forKey<T>(
    name: string,
    validator?: Validator<T>
  ): SingleItemStore<T> {
    const config = singleItemDbConfig(name, validator);
    const getDb = () => simpleIndexDbStore(config);
    return {
      get: () =>
        withCloseable(getDb, (db) => db.get(ITEM_ID).then((data) => data.item)),
      set: (t) =>
        withCloseable(getDb, (db) => db.update({ id: ITEM_ID, item: t })),
    };
  }
}

interface InternalStore<T> {
  id: typeof ITEM_ID;
  item: T;
}

function isInternalStore<T>(
  validator?: Validator<T>
): (x: unknown) => x is InternalStore<T> {
  return matchesObject<InternalStore<T>>({
    id: (x): x is typeof ITEM_ID => x === 0,
    item: validator ?? isAny,
  });
}

function singleItemDbConfig<T>(
  name: string,
  validator?: Validator<T>
): SingleStoreDbConfig<InternalStore<T>> {
  const dbName = `SingleItemStore.${name}`;
  return {
    dbName,
    version: 1,
    stores: [
      {
        name: "main",
        keyPath: "id",
        validator: isInternalStore(validator),
      },
    ],
  };
}
