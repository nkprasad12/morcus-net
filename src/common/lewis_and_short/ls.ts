import { parse } from "@/common/lewis_and_short/ls_parser";
import { assert, assertEqual, checkPresent } from "../assert";
import fs from "fs";
import readline from "readline";
import { parseEntries } from "./xml_node";
import { displayEntryFree } from "./ls_display";
import { getOrths, isRegularOrth, mergeVowelMarkers } from "./ls_orths";
import { removeDiacritics } from "../text_cleaning";

interface RawLsEntry {
  keys: string[];
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

  async getEntry(input: string): Promise<string> {
    const request = removeDiacritics(input).toLowerCase();
    const indices = this.keyToEntries.get(request);
    if (indices === undefined) {
      return JSON.stringify([`<span>Could not find entry for ${input}</span>`]);
    }

    const hasDiactrics = input === request;
    const exactMatches = indices.filter(
      ([i, j]) => this.rawKeys[i][j] === input
    );
    const resultIndices =
      hasDiactrics && exactMatches.length > 0 ? exactMatches : indices;
    const entryStrings = resultIndices.map(([i, _]) => this.entries[i]);
    const entryNodes = parseEntries(entryStrings);
    return JSON.stringify(
      entryNodes.map((node) => displayEntryFree(node).toString())
    );
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
  export function createProcessed(
    rawFile: string = checkPresent(process.env.LS_PATH)
  ): RawLsEntry[] {
    return parse(rawFile).map((root) => {
      const orths = getOrths(root).map(mergeVowelMarkers);
      assert(orths.length > 0, `Expected > 0 orths\n${root.toString()}`);
      const regulars = orths.filter(isRegularOrth);
      return {
        keys: regulars.length > 0 ? regulars : orths,
        entry: root.toString(),
      };
    });
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
        assert(!key.includes(","));
        assert(!key.includes("\n"));
      }
      stream.write(entry.keys.join(","));
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
