import { EntryResult } from "@/common/dictionaries/dict_result";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { SmithAndHall, shListToRaw } from "@/common/smith_and_hall/sh_dict";
import { ShEntry } from "@/common/smith_and_hall/sh_entry";
import { XmlNode } from "@/common/xml/xml_node";
import fs from "fs";

console.debug = jest.fn();

const TEMP_FILE = "sh_dict.test.ts.tmp.txt";

const SH_ENTRIES: ShEntry[] = [
  { keys: ["Hi", "Hello"], blurb: "Greetings", senses: [] },
  { keys: ["Hello"], blurb: "Loop", senses: [] },
];

async function expectEntriesWithIds(
  promise: Promise<EntryResult[]>,
  expected: string[]
) {
  const results = await promise;
  const ids = results.map((r) =>
    XmlNode.assertIsNode(r.entry.children[0]).getAttr("id")
  );
  expect(ids).toStrictEqual(expected);
}

describe("SmithAndHall dict", () => {
  afterEach(() => {
    try {
      fs.unlinkSync(TEMP_FILE);
    } catch (e) {}
    try {
      fs.unlinkSync(`${TEMP_FILE}-shm`);
    } catch (e) {}
    try {
      fs.unlinkSync(`${TEMP_FILE}-wal`);
    } catch (e) {}
  });

  test("getEntry returns expected entries", async () => {
    SqlDict.save(shListToRaw(SH_ENTRIES), TEMP_FILE);
    const dict = new SmithAndHall(TEMP_FILE);

    expect(await dict.getEntry("Julius")).toEqual([]);
    await expectEntriesWithIds(dict.getEntry("Hi"), ["sh0"]);
    await expectEntriesWithIds(dict.getEntry("Hello"), ["sh0", "sh1"]);
  });

  test("getEntry returns expected completions", async () => {
    SqlDict.save(shListToRaw(SH_ENTRIES), TEMP_FILE);
    const dict = new SmithAndHall(TEMP_FILE);

    expect(await dict.getCompletions("H")).toEqual(["Hello", "Hi"]);
  });
});
