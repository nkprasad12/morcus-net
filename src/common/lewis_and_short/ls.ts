import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import { parse } from "@/common/lewis_and_short/ls_parser";
import { assert, checkPresent } from "../assert";
import fs from "fs";
import readline from "readline";

interface LsEntry {
  key: string;
  entry: string;
}

export class LewisAndShort {
  constructor(private readonly entries: Map<string, string>) {}

  async getEntry(input: string): Promise<string> {
    const result = this.entries.get(input);
    if (result === undefined) {
      return `Could not find entry with key ${input}`;
    }
    return result;
  }
}

export namespace LewisAndShort {
  export function createProcessed(
    rawFile: string = checkPresent(process.env.LS_PATH)
  ): LsEntry[] {
    const rootNodes = parse(rawFile);
    return rootNodes.map((root) => {
      const keys = root.attrs.filter((attr) => attr[0] === "key");
      assert(keys.length === 1, "Expected exactly one `key` attribute.");
      return {
        key: keys[0][1],
        entry: displayEntryFree(root).toString(),
      };
    });
  }

  export async function save(
    entries: LsEntry[],
    destination: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ): Promise<void> {
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    const stream = fs.createWriteStream(destination);
    for (const entry of entries) {
      const finalKey = entry.key.replaceAll("\n", "@");
      const finalEntry = entry.entry.replaceAll("\n", "@");
      stream.write(`${finalKey}\n${finalEntry}\n`);
    }
    return new Promise<void>((resolve) => {
      stream.end(() => {
        resolve();
      });
    });
  }

  export async function create(
    processedFile: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ) {
    const result = new Map<string, string>();
    const rl = readline.createInterface({
      input: fs.createReadStream(processedFile),
    });
    let key: string | undefined = undefined;
    for await (const line of rl) {
      if (key === undefined) {
        key = line;
      } else {
        result.set(key.replaceAll("@", "\n"), line.replaceAll("@", "\n"));
        key = undefined;
      }
    }
    return new LewisAndShort(new Map(result));
  }
}
