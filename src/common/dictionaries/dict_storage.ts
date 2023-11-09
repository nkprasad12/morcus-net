import Database from "better-sqlite3";
import { removeDiacritics } from "@/common/text_cleaning";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { Vowels } from "@/common/character_utils";
import { ARRAY_INDEX, ReadOnlyDb } from "@/common/sql_helper";

export interface RawDictEntry {
  /** The serialized list of keys for this entry. */
  keys: string;
  /** A serialized form of this entry. */
  entry: string;
}

export class SqlDict {
  static save(entries: RawDictEntry[], destination: string): void {
    ReadOnlyDb.saveToSql(destination, entries, ARRAY_INDEX);
  }

  private readonly keyToEntries = new Map<string, [number, number, number][]>();
  private readonly keys: string[];
  private readonly rawKeys: string[][];
  private readonly db: Database.Database;

  constructor(dbFile: string, keyDelimiter: string) {
    this.db = ReadOnlyDb.getDatabase(dbFile);
    const read = this.db.prepare("SELECT keys, n FROM data");
    // @ts-ignore
    const result: { keys: string; n: number }[] = read.all();
    result.sort((a, b) => a.n - b.n);

    this.rawKeys = result.map((row) => row.keys.split(keyDelimiter));

    for (let i = 0; i < this.rawKeys.length; i++) {
      for (let j = 0; j < this.rawKeys[i].length; j++) {
        const cleanKey = removeDiacritics(this.rawKeys[i][j]).toLowerCase();
        if (!this.keyToEntries.has(cleanKey)) {
          this.keyToEntries.set(cleanKey, []);
        }
        this.keyToEntries.get(cleanKey)!.push([i, j, result[i].n]);
      }
    }
    this.keys = [...this.keyToEntries.keys()].sort((a, b) =>
      a.localeCompare(b)
    );
  }

  getRawEntry(input: string, extras?: ServerExtras): string[] {
    const request = removeDiacritics(input).toLowerCase();
    const indices = this.keyToEntries.get(request);
    if (indices === undefined) {
      return [];
    }

    const allMatches = indices.filter(([i, j]) => {
      const candidate = this.rawKeys[i][j];
      for (let k = 0; k < input.length; k++) {
        const inputCharLength = Vowels.getLength(input[k]);
        const candidateCharLength = Vowels.getLength(candidate[k]);
        const lengths = [inputCharLength, candidateCharLength];
        if (lengths.includes("Long") && lengths.includes("Short")) {
          return false;
        }
      }
      return true;
    });

    const resultIndices = [...new Set(allMatches.map(([_i, _j, n]) => n))];
    extras?.log("foundMatches");
    const entryStrings = resultIndices.map(
      (n) =>
        // @ts-ignore
        this.db.prepare(`SELECT entry FROM data WHERE n=${n} LIMIT 1`).all()[0]
          .entry
    );
    extras?.log("entriesFetched");
    return entryStrings;
  }

  getCompletions(input: string): string[] {
    const prefix = removeDiacritics(input).toLowerCase();
    // TODO: Use Binary search here.
    let start = -1;
    for (let i = 0; i < this.keys.length; i++) {
      if (this.keys[i].startsWith(prefix)) {
        start = i;
        break;
      }
    }
    if (start === -1) {
      return [];
    }

    const result = new Set<string>();
    for (let i = start; i < this.keys.length; i++) {
      if (!this.keys[i].startsWith(prefix)) {
        break;
      }
      const indices = this.keyToEntries.get(this.keys[i]) || [];
      for (const [keyIndex, orthIndex] of indices) {
        result.add(this.rawKeys[keyIndex][orthIndex]);
      }
    }
    return [...result];
  }
}
