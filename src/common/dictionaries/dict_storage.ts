import fs from "fs";
import Database from "better-sqlite3";
import { DictInfo, Dictionary } from "@/common/dictionaries/dictionaries";
import { removeDiacritics } from "@/common/text_cleaning";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { EntryResult } from "@/common/dictionaries/dict_result";
import { Vowels } from "@/common/character_utils";

export interface RawDictEntry {
  /** The serialized list of keys for this entry. */
  keys: string;
  /** A serialized form of this entry. */
  entry: string;
}

export class SqlDict implements Dictionary {
  static save(entries: RawDictEntry[], destination: string): void {
    const start = performance.now();
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    const db = new Database(destination);
    db.pragma("journal_mode = WAL");
    db.exec(
      "CREATE TABLE data('keys' varchar, 'entry' varchar, 'n' INTEGER PRIMARY KEY ASC );"
    );
    const insert = db.prepare(
      "INSERT INTO data (keys, entry, n) VALUES (@keys, @entry, @n)"
    );

    const insertAll = db.transaction(() => {
      entries.forEach((entry, index) => {
        insert.run({ ...entry, n: index });
      });
    });
    insertAll();
    db.close();
    console.debug("saveSql time: " + (performance.now() - start));
  }

  private readonly keyToEntries = new Map<string, [number, number, number][]>();
  private readonly keys: string[];
  private readonly rawKeys: string[][];
  private readonly db: Database.Database;

  constructor(
    dbFile: string,
    readonly info: DictInfo,
    readonly entryConverter: (input: string[]) => EntryResult[],
    readonly keysConverter: (input: string) => string[]
  ) {
    this.db = new Database(dbFile, { readonly: true });
    this.db.pragma("journal_mode = WAL");
    const read = this.db.prepare("SELECT keys, n FROM data");
    // @ts-ignore
    const result: { keys: string; n: number }[] = read.all();
    result.sort((a, b) => a.n - b.n);

    this.rawKeys = result.map((row) => keysConverter(row.keys));

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

  async getEntry(input: string, extras?: ServerExtras): Promise<EntryResult[]> {
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

    return this.entryConverter(entryStrings);
  }

  async getCompletions(input: string): Promise<string[]> {
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
