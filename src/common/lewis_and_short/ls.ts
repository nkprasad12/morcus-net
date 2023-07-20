import { parse } from "@/common/lewis_and_short/ls_parser";
import { assert, assertEqual, checkPresent } from "../assert";
import fs from "fs";
import readline from "readline";
import { parseEntries, XmlNode } from "./xml_node";
import { displayEntryFree } from "./ls_display";
import { getOrths, isRegularOrth, mergeVowelMarkers } from "./ls_orths";
import { removeDiacritics } from "../text_cleaning";
import { LsResult } from "@/web/utils/rpc/ls_api_result";
import { extractOutline } from "./ls_outline";
import { Vowels } from "../character_utils";
import Database from "better-sqlite3";

interface ProcessedLsEntry {
  keys: string[];
  entry: XmlNode;
}

interface RawLsEntry {
  keys: string;
  entry: string;
}

export class LewisAndShort {
  private readonly keyToEntries = new Map<string, [number, number][]>();
  private readonly keys: string[];

  constructor(
    private readonly rawKeys: string[][],
    private readonly entries: string[]
  ) {
    assertEqual(rawKeys.length, entries.length);
    for (let i = 0; i < rawKeys.length; i++) {
      for (let j = 0; j < rawKeys[i].length; j++) {
        const cleanKey = removeDiacritics(rawKeys[i][j]).toLowerCase();
        if (!this.keyToEntries.has(cleanKey)) {
          this.keyToEntries.set(cleanKey, []);
        }
        this.keyToEntries.get(cleanKey)!.push([i, j]);
      }
    }
    this.keys = [...this.keyToEntries.keys()].sort((a, b) =>
      a.localeCompare(b)
    );
  }

  async getEntry(input: string): Promise<LsResult[]> {
    const request = removeDiacritics(input).toLowerCase();
    const indices = this.keyToEntries.get(request);
    if (indices === undefined) {
      return [
        {
          entry: new XmlNode("span", [], [`Could not find entry for ${input}`]),
        },
      ];
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

    const resultIndices = [...new Set(allMatches.map(([i, _]) => i))];
    const entryStrings = resultIndices.map((i) => this.entries[i]);
    const entryNodes = parseEntries(entryStrings);
    return entryNodes.map((node) => ({
      entry: displayEntryFree(node),
      outline: extractOutline(node),
    }));
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

export class LewisAndShortSql {
  private readonly keyToEntries = new Map<string, [number, number, number][]>();
  private readonly keys: string[];
  private readonly rawKeys: string[][];
  private readonly db: Database.Database;

  constructor(
    // private readonly entries: string[],
    dbFile: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ) {
    this.db = new Database(dbFile, { readonly: true });
    this.db.pragma("journal_mode = WAL");
    const read = this.db.prepare("SELECT keys, n FROM data");
    // @ts-ignore
    const result: { keys: string; n: number }[] = read.all();
    result.sort((a, b) => a.n - b.n);

    this.rawKeys = result.map((row) => row.keys.split(","));

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

  async getEntry(input: string): Promise<LsResult[]> {
    const request = removeDiacritics(input).toLowerCase();
    const indices = this.keyToEntries.get(request);
    if (indices === undefined) {
      return [
        {
          entry: new XmlNode("span", [], [`Could not find entry for ${input}`]),
        },
      ];
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
    const start = performance.now();
    const entryStrings = resultIndices.map(
      (n) =>
        // @ts-ignore
        this.db.prepare(`SELECT entry FROM data WHERE n=${n} LIMIT 1`).all()[0]
          .entry
    );
    console.log("DB Fetch: " + (performance.now() - start));

    const entryNodes = parseEntries(entryStrings);
    const x = entryNodes.map((node) => ({
      entry: displayEntryFree(node),
      outline: extractOutline(node),
    }));
    return x;
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

export namespace LewisAndShort {
  export function processedToRaw(input: ProcessedLsEntry): RawLsEntry {
    for (const key of input.keys) {
      assert(!key.includes(","));
    }
    return {
      keys: input.keys.join(","),
      entry: input.entry.toString(),
    };
  }

  export function* createProcessedRaw(
    rawFile: string = checkPresent(process.env.LS_PATH)
  ): Generator<ProcessedLsEntry> {
    let numHandled = 0;
    for (const root of parse(rawFile)) {
      if (numHandled % 1000 === 0) {
        console.debug(`Processed ${numHandled}`);
      }
      const orths = getOrths(root).map(mergeVowelMarkers);
      assert(orths.length > 0, `Expected > 0 orths\n${root.toString()}`);
      const regulars = orths.filter(isRegularOrth);
      yield {
        keys: regulars.length > 0 ? regulars : orths,
        entry: root,
      };
      numHandled += 1;
    }
  }

  export function createProcessed(
    rawFile: string = checkPresent(process.env.LS_PATH, "LS_PATH")
  ): RawLsEntry[] {
    const result: RawLsEntry[] = [];
    for (const item of createProcessedRaw(rawFile)) {
      result.push(processedToRaw(item));
    }
    return result;
  }

  export async function save(
    entries: RawLsEntry[],
    destination: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ): Promise<void> {
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    const stream = fs.createWriteStream(destination);
    for (const entry of entries) {
      for (const key of entry.keys) {
        assert(!key.includes("\n"));
      }
      stream.write(entry.keys);
      stream.write("$$");
      stream.write(entry.entry.replaceAll("\n", "@"));
      stream.write("\n");
    }
    return new Promise<void>((resolve) => {
      stream.end(() => {
        resolve();
      });
    });
  }

  export function saveSql(
    entries: RawLsEntry[],
    destination: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ): void {
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
  }

  // export function readSql(
  //   processedFile: string = checkPresent(process.env.LS_PROCESSED_PATH)
  // ): any[] {
  //   const db = new Database(processedFile, { readonly: true });
  //   db.pragma("journal_mode = WAL");
  //   const read = db.prepare(`SELECT entry FROM data WHERE n=${7432} LIMIT 1`);
  //   const result = read.all();
  //   db.close();
  //   return result;
  // }

  export async function readFromFile(
    processedFile: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ): Promise<[string[][], string[]]> {
    const rl = readline.createInterface({
      input: fs.createReadStream(processedFile),
    });
    const keys: string[][] = [];
    const entries: string[] = [];
    for await (const line of rl) {
      const chunks = line.split("$$");
      assertEqual(chunks.length, 2);
      keys.push(chunks[0].split(","));
      entries.push(chunks[1].replaceAll("@", "\n"));
    }
    return [keys, entries];
  }

  export async function create(
    processedFile: string = checkPresent(
      process.env.LS_PROCESSED_PATH,
      "LS_PROCESSED_PATH environment variable."
    )
  ) {
    const [keys, entries] = await readFromFile(processedFile);
    return new LewisAndShort(keys, entries);
  }
}
