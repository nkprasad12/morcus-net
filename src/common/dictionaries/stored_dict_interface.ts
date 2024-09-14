// TODO: Add Lemma and disambig number to this table
export interface RawDictEntry {
  /** The list of keys for this entry. */
  keys: string[];
  /** A unique identifier for this entry. */
  id: string;
  /** A serialized form of this entry. */
  entry: string;
}

export interface EntryName {
  /** The name for the entry, called `orth` for legacy reasons. */
  orth: string;
  /** The cleaned up name for the entry, called `cleanOrth` for legacy reasons. */
  cleanOrth: string;
}

export type BackingType = "Sync" | "Async";
export type NotPromise =
  | null
  | undefined
  | string
  | number
  | Omit<object, "then">;
export type MaybeAsync<
  T extends NotPromise,
  U extends BackingType
> = U extends "Async" ? Promise<T> : T;

export interface StoredDictBacking<IsAsync extends BackingType> {
  allEntryNames: () => MaybeAsync<EntryName[], IsAsync>;
  matchesForCleanName: (
    cleanName: string
  ) => MaybeAsync<{ id: string; orth: string }[], IsAsync>;
  entriesForIds: (ids: string[]) => MaybeAsync<{ entry: string }[], IsAsync>;
  entryNamesByPrefix: (
    prefix: string
  ) => MaybeAsync<{ orth: string }[], IsAsync>;
}
