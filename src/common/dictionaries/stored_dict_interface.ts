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

type MaybeAsync<T, U extends boolean> = U extends true ? Promise<T> : T;

export interface StoredDictBacking<Async extends boolean> {
  allEntryNames: () => MaybeAsync<EntryName[], Async>;
  matchesForCleanName: (
    cleanName: string
  ) => MaybeAsync<{ id: string; orth: string }[], Async>;
  entriesForIds: (ids: string[]) => MaybeAsync<{ entry: string }[], Async>;
  entryNamesByPrefix: (prefix: string) => MaybeAsync<{ orth: string }[], Async>;
}
