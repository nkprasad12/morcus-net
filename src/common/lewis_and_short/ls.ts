import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import { parse, XmlNode } from "@/common/lewis_and_short/ls_parser";
import { assert, checkPresent } from "../assert";
import fs from "fs";
import readline from "readline";

interface LsEntry {
  key: string;
  entry: string;
}

export class LewisAndShort2 {
  constructor(private readonly entries: Map<string, string>) {}

  async getEntry(input: string): Promise<string> {
    const result = this.entries.get(input);
    if (result === undefined) {
      return `Could not find entry with key ${input}`;
    }
    return result;
  }
}

export namespace LewisAndShort2 {
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

  export function save(
    entries: LsEntry[],
    destination: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ): void {
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    const stream = fs.createWriteStream(destination);
    console.log("made write strm");
    for (const entry of entries) {
      const finalKey = entry.key.replaceAll("\n", "@");
      const finalEntry = entry.entry.replaceAll("\n", "@");
      stream.write(`${finalKey}\n${finalEntry}\n`);
    }
    stream.end();
  }

  export async function create(
    processedFile: string = checkPresent(process.env.LS_PROCESSED_PATH)
  ) {
    const result = new Map<string, string>();

    while (!fs.existsSync(processedFile)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const fileStream = fs.createReadStream(processedFile);
    const rl = readline.createInterface({
      input: fileStream,
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
    // const data: LsEntry[] = JSON.parse(
    //   fs.readFileSync(processedFile).toString()
    // );
    // const result = new Map<string, string>();
    // for (const entry of data) {
    //   result.set(entry.key, entry.entry);
    // }
    return new LewisAndShort2(result);
  }
}

export class LewisAndShort {
  private readonly byKey: Map<string, number> = new Map();

  constructor(private readonly entries: XmlNode[]) {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const key = entry.attrs.filter((attr) => attr[0] === "key");
      assert(key.length === 1, "Expected exactly one `key` attribute.");
      this.byKey.set(key[0][1], i);
    }
    // this.entries.forEach((entry, i) => {
    //   const key = entry.attrs.filter((attr) => attr[0] === "key");
    //   assert(key.length === 1, "Expected exactly one `key` attribute.");
    //   this.byKey.set(key[0][1], i);
    // });
  }

  private entryByKey(key: string): string | undefined {
    const index = this.byKey.get(key);
    if (index === undefined) {
      return undefined;
    }
    return displayEntryFree(this.entries[index]).toString();
  }

  async getEntry(input: string): Promise<string> {
    const result = this.entryByKey(input);
    if (result === undefined) {
      return `Could not find entry with key ${input}`;
    }
    return result;
  }
}

export namespace LewisAndShort {
  export function create(dataFile: string = checkPresent(process.env.LS_PATH)) {
    return new LewisAndShort(parse(dataFile));
  }
}
