import { parse } from "@/common/lewis_and_short/ls_parser";
import { assert, assertEqual, checkPresent } from "../assert";
import fs from "fs";
import readline from "readline";
import { parseEntries } from "./xml_node";
import { displayEntryFree } from "./ls_display";

interface RawLsEntry {
  keys: string[];
  entry: string;
}

export class LewisAndShort {
  private readonly keyToEntry = new Map<string, number>();

  constructor(keys: string[][], private readonly entries: string[]) {
    assertEqual(keys.length, entries.length);
    for (let i = 0; i < keys.length; i++) {
      for (const key of keys[i]) {
        this.keyToEntry.set(key, i);
      }
    }
  }

  async getEntry(input: string): Promise<string> {
    const result = this.keyToEntry.get(input);
    if (result === undefined) {
      return `<span>Could not find entry for ${input}</span>`;
    }
    return displayEntryFree(parseEntries([this.entries[result]])[0]).toString();
  }
}

export namespace LewisAndShort {
  export function createProcessed(
    rawFile: string = checkPresent(process.env.LS_PATH)
  ): RawLsEntry[] {
    return parse(rawFile).map((root) => {
      const keys = root.attrs.filter((attr) => attr[0] === "key");
      assert(keys.length === 1, "Expected exactly one `key` attribute.");
      return {
        keys: [keys[0][1]],
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
    processedFile: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ) {
    const [keys, entries] = await readFromFile(processedFile);
    return new LewisAndShort(keys, entries);
  }
}
