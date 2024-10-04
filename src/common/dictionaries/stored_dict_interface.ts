// TODO: Add Lemma and disambig number to this table
export interface RawDictEntry {
  /** The list of keys for this entry. */
  keys: string[];
  /** A unique identifier for this entry. */
  id: string;
  /** A serialized form of this entry. */
  entry: string;
  /**
   * Keys that are not for this entry, but for subentries.
   * `[[idContainingSubentry, [keyForSubentry1, ...]]`
   */
  derivedKeys?: [string, string[]][];
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

export interface EntriesTableRow {
  id: string;
  entry: string;
}

export interface OrthsTableRow {
  id: string;
  orth: string;
  cleanOrth: string;
  senseId?: string;
}

export interface StoredDictBacking<IsAsync extends BackingType> {
  /** Returns all entry names in the given dictionary. */
  allEntryNames: () => MaybeAsync<EntryName[], IsAsync>;
  /**
   * Returns entries that match a given clean name.
   *
   * @argument cleanName the entry name stripped of diacritics and lower case.
   *
   * @returns All entries matching the clean name.
   */
  matchesForCleanName: (
    cleanName: string
  ) => MaybeAsync<Omit<OrthsTableRow, "cleanOrth">[], IsAsync>;
  entriesForIds: (ids: string[]) => MaybeAsync<{ entry: string }[], IsAsync>;
  entryNamesByPrefix: (prefix: string) => MaybeAsync<string[], IsAsync>;
  lowMemory: boolean;
}
