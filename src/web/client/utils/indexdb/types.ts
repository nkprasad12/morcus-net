import type { Validator } from "@/web/utils/rpc/parsing";

/** Configuration for creating a wrapped IndexDb. */
export interface DbConfig {
  /** The name of the database. Must be unique for the domain. */
  dbName: string;
  /** The version of the database. Must be a positive integer. */
  version: number;
  /** The stores that should be contained within this database. */
  stores: Store<object>[];
}

export type TransactionType = "readonly" | "readwrite";
export type DbKey = string | number;

export interface Closeable {
  close(): void;
}

export interface StoreIndex {
  keyPath: string;
}

export interface Store<T extends object> {
  /** The name of the store within the database. */
  name: string;
  /**
   * The key path in the store. In the initial version,
   * this must be a top level field in the object.
   */
  keyPath?: string;
  /** A validator for objects placed into the store. */
  validator?: Validator<T>;
  /** Indices to create. */
  indices?: StoreIndex[];
}

export interface ReadOperations<T> {
  /**
   * Returns an object from the store. Rejects if there is no
   * object with the given key.
   */
  get(key: DbKey): Promise<T>;
  /** Returns all objects from the store. */
  getAll(): Promise<T[]>;
  /**
   * Searches the index with the given name.
   *
   * @argument index the index to use.
   * @argument query the cursor query to use.
   * @argument shouldStop if present, stops the cursor and excludes
   *   the offending element.
   *
   * @returns the matching results.
   */
  searchIndex(
    index: StoreIndex,
    query: IDBKeyRange,
    shouldStop?: (t: T) => boolean
  ): Promise<T[]>;
}

export interface WriteOperations<T> {
  /** Adds an item to the store. Rejects if the item is invalid. */
  add(item: T): Promise<void>;
  /** Updates an item in the store. Rejects if the item is invalid. */
  update(item: T): Promise<void>;
  /** Removes an item with the given key. */
  delete(key: DbKey): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type EmptySet = {};
/**
 * A helper object providing promise based wrappers for the native browser
 * IndexDb's object store.
 */
export type ObjectStore<
  T extends object,
  U extends TransactionType
> = Store<T> &
  ReadOperations<T> &
  (U extends "readwrite" ? WriteOperations<T> : EmptySet);

export interface ObjectStoreFactory<U extends TransactionType> {
  objectStore<T extends object>(store: Store<T>): ObjectStore<T, U>;
  commit: () => void;
}

export interface TransactionFactory {
  transaction<U extends TransactionType>(
    stores: Store<object>[],
    tType: U
  ): ObjectStoreFactory<U>;
  singleStore<T extends object, U extends TransactionType>(
    store: Store<T>,
    tType: U
  ): ObjectStore<T, U>;
}

export interface IndexDb extends TransactionFactory, Closeable {}

export interface SingleStoreDbConfig<T extends object> extends DbConfig {
  stores: [Store<T>];
}
