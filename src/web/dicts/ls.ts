import { parse, XmlNode } from "@/common/lewis_and_short/ls_parser";
import { assert } from "console";

export class LewisAndShort {
  private readonly byKey: Map<string, number> = new Map();

  constructor(private readonly entries: XmlNode[]) {
    this.entries.forEach((entry, i) => {
      const key = entry.attrs.filter((attr) => attr[0] === "key");
      assert(key.length === 1, "Expected exactly one `key` attribute.");
      this.byKey.set(key[0][1], i);
    });
  }

  private entryByKey(key: string): string | undefined {
    const index = this.byKey.get(key);
    if (index === undefined) {
      return undefined;
    }
    return this.entries[index].formatAsString(true);
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
  export function create(dataFile: string = process.env.LS_PATH!) {
    return new LewisAndShort(parse(dataFile));
  }
}
