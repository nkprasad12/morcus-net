import fs from "fs";

import { LewisAndShort } from "./ls";
import { XmlNode } from "./xml_node";

const LS_SUBSET = "testdata/ls/subset.xml";
const TEMP_FILE = "ls.test.ts.tmp.txt";

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

describe("LewisAndShort", () => {
  afterEach(() => {
    try {
      fs.unlinkSync(TEMP_FILE);
    } catch (e) {}
  });

  test("createProcessed processes elements", () => {
    const lewisAndShort = LewisAndShort.createProcessed(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("cāmus")
    );

    expect(result).toHaveLength(1);
    expect(result[0].entry).toContain("A muzzle");
  });

  test("save removes existing contents if present", async () => {
    writeFile("foo");

    await LewisAndShort.save([{ keys: ["bar"], entry: "baz" }], TEMP_FILE);

    const result = fs.readFileSync(TEMP_FILE).toString();

    expect(result).not.toContain("foo");
    expect(result).toContain("bar");
  });

  test("save writes in expected format", async () => {
    const data = [
      { keys: ["Julius"], entry: "Gallia est omnis divisa in partes tres" },
      { keys: ["Publius"], entry: "Non iterum repetenda suo" },
    ];
    await LewisAndShort.save(data, TEMP_FILE);

    const result = fs.readFileSync(TEMP_FILE).toString();
    const lines = result.split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(data[0].keys.join(",") + "$$" + data[0].entry);
    expect(lines[1]).toBe(data[1].keys.join(",") + "$$" + data[1].entry);
    // We expect a terminal newline, so there will be an empty string
    // at the end of the split.
    expect(lines[2]).toBe("");
  });

  test("save replaces newlines in contents", async () => {
    await LewisAndShort.save([{ keys: ["bar"], entry: "baz\n" }], TEMP_FILE);

    const result = fs.readFileSync(TEMP_FILE).toString();
    const lines = result.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("baz@");
  });

  test("save writes list of keys", async () => {
    await LewisAndShort.save(
      [{ keys: ["foo", "bar"], entry: "baz" }],
      TEMP_FILE
    );

    const result = fs.readFileSync(TEMP_FILE).toString();
    const lines = result.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("foo,bar$$");
  });

  test("readFromFile handles each entry", async () => {
    const data = [
      { keys: ["Julius"], entry: "Gallia est omnis" },
      { keys: ["bar"], entry: "baz\n" },
      { keys: ["Publius", "Naso"], entry: "Non iterum repetenda suo" },
    ];
    await LewisAndShort.save(data, TEMP_FILE);

    const [keys, entries] = await LewisAndShort.readFromFile(TEMP_FILE);

    expect(keys.length).toBe(3);
    expect(entries.length).toBe(3);
    expect(keys[0]).toStrictEqual(data[0].keys);
    expect(entries[0]).toStrictEqual(data[0].entry);
    expect(keys[1]).toStrictEqual(data[1].keys);
    expect(entries[1]).toStrictEqual(data[1].entry);
    expect(keys[2]).toStrictEqual(data[2].keys);
    expect(entries[2]).toStrictEqual(data[2].entry);
  });

  test("create has expected entries", async () => {
    const data = [
      {
        keys: ["Julius"],
        entry: new XmlNode("entryFree", [], ["Gallia est omnis"]).toString(),
      },
      {
        keys: ["Publius", "Naso"],
        entry: new XmlNode(
          "entryFree",
          [],
          ["Non iterum repetenda suo"]
        ).toString(),
      },
    ];

    await LewisAndShort.save(data, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expect(await dict.getEntry("Julius")).toBe(
      '<div class="lsEntryFree">Gallia est omnis</div>'
    );
    expect(await dict.getEntry("Publius")).toBe(
      '<div class="lsEntryFree">Non iterum repetenda suo</div>'
    );
    expect(await dict.getEntry("Foo")).toContain(
      "<span>Could not find entry for Foo</span>"
    );
  });
});
