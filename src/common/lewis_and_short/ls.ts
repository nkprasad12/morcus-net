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

  constructor(keys: string[][], private readonly entries: string[]) {
    assertEqual(keys.length, entries.length);
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < keys[i].length; j++) {
        const cleanKey = removeDiacritics(keys[i][j]);
        if (!this.keyToEntries.has(cleanKey)) {
          this.keyToEntries.set(cleanKey, []);
        }
        this.keyToEntries.get(cleanKey)!.push([i, j]);
      }
    }
  }

  async getEntry(input: string): Promise<string> {
    const indices = this.keyToEntries.get(input);
    if (indices === undefined) {
      return JSON.stringify([`<span>Could not find entry for ${input}</span>`]);
    }
    const entries: string[] = [];
    for (const [entriesIndex, _] of indices) {
      entries.push(
        displayEntryFree(
          parseEntries([this.entries[entriesIndex]])[0]
        ).toString()
      );
    }
    return JSON.stringify(entries);
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
