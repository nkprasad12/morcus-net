import fs from "fs";

import { LewisAndShort } from "./ls";
import { XmlNode } from "./xml_node";

console.debug = jest.fn();

const LS_SUBSET = "testdata/ls/subset_partial_orths.xml";
const TEMP_FILE = "ls.test.ts.tmp.txt";

const LS_DATA = [
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
  {
    keys: ["Naso"],
    entry: new XmlNode("entryFree", [], ["Pennisque levatus"]).toString(),
  },
];

function toLsData(keys: string[]) {
  return keys.map((key) => ({ keys: [key + "_"], entry: key }));
}

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

describe("LewisAndShort", () => {
  afterEach(() => {
    try {
      fs.unlinkSync(TEMP_FILE);
    } catch (e) {}
  });

  test("createProcessed writes element contents", () => {
    const lewisAndShort = LewisAndShort.createProcessed(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("cāmus")
    );

    expect(result).toHaveLength(1);
    expect(result[0].entry).toContain("A muzzle");
  });

  test("createProcessed handles elements with alts", () => {
    const lewisAndShort = LewisAndShort.createProcessed(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("attango")
    );

    expect(result).toHaveLength(1);
    expect(result[0].keys).toHaveLength(2);
    expect(result[0].keys).toContain("adtango");
    expect(result[0].keys).toContain("attango");
  });

  test("createProcessed handles elements with only alts", () => {
    const lewisAndShort = LewisAndShort.createProcessed(LS_SUBSET);

    const result = lewisAndShort.filter((entry) => entry.keys.includes("abs-"));

    expect(result).toHaveLength(1);
    expect(result[0].keys).toHaveLength(1);
    expect(result[0].keys).toContain("abs-");
  });

  test("createProcessed removes alts if full orths are present", () => {
    const lewisAndShort = LewisAndShort.createProcessed(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("arruo")
    );

    expect(result).toHaveLength(1);
    expect(result[0].keys).toHaveLength(1);
    expect(result[0].keys).toContain("arruo");
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

  test("getEntry handles expected entries", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    const julius = JSON.parse(await dict.getEntry("Julius"));
    const publius = JSON.parse(await dict.getEntry("Publius"));
    expect(julius).toStrictEqual([
      '<div class="lsEntryFree">Gallia est omnis</div>',
    ]);
    expect(publius).toStrictEqual([
      '<div class="lsEntryFree">Non iterum repetenda suo</div>',
    ]);
  });

  test("getEntry handles ambiguous queries", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    const result = JSON.parse(await dict.getEntry("Naso"));

    expect(result).toHaveLength(2);
    expect(result).toContain(
      '<div class="lsEntryFree">Non iterum repetenda suo</div>'
    );
    expect(result).toContain(
      '<div class="lsEntryFree">Pennisque levatus</div>'
    );
  });

  test("getEntry handles unknown queries", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    const result = JSON.parse(await dict.getEntry("Foo"));

    expect(result).toHaveLength(1);
    expect(result).toContain("<span>Could not find entry for Foo</span>");
  });

  test("getCompletions returns expected results", async () => {
    const inputKeys = ["aba", "abbas", "abas", "abat", "abbat", "abatta"];
    await LewisAndShort.save(toLsData(inputKeys), TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expect(await dict.getCompletions("ab")).toStrictEqual([
      "aba_",
      "abas_",
      "abat_",
      "abatta_",
      "abbas_",
      "abbat_",
    ]);
    expect(await dict.getCompletions("abat")).toStrictEqual([
      "abat_",
      "abatta_",
    ]);
    expect(await dict.getCompletions("abba")).toStrictEqual([
      "abbas_",
      "abbat_",
    ]);
    expect(await dict.getCompletions("abbax")).toStrictEqual([]);
  });

  test("getCompletions handles entries with multiple keys", async () => {
    const data = [
      {
        keys: ["Julius", "Iulius"],
        entry: "",
      },
      {
        keys: ["Julus"],
        entry: "",
      },
    ];
    await LewisAndShort.save(data, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expect(await dict.getCompletions("Juliu")).toStrictEqual(["Julius"]);
    expect(await dict.getCompletions("Iuliu")).toStrictEqual(["Iulius"]);
  });

  test("getCompletions handles different capitalization", async () => {
    await LewisAndShort.save(
      toLsData(["arbor", "Arbor", "arboris"]),
      TEMP_FILE
    );
    const dict = await LewisAndShort.create(TEMP_FILE);

    expect(await dict.getCompletions("ar")).toStrictEqual([
      "arbor_",
      "Arbor_",
      "arboris_",
    ]);
  });

  test("getCompletions removes duplicate orths", async () => {
    await LewisAndShort.save(toLsData(["arbor", "abeo", "abeo"]), TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expect(await dict.getCompletions("a")).toStrictEqual(["abeo_", "arbor_"]);
  });
});
