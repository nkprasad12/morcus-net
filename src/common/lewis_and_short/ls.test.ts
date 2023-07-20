import fs from "fs";

import { LewisAndShort } from "./ls";
import { XmlNode } from "./xml_node";

console.debug = jest.fn();

jest.mock("./ls_outline", () => ({
  ...jest.requireActual("./ls_outline"),
  extractOutline: jest.fn(() => "mockOutline"),
}));

const LS_SUBSET = "testdata/ls/subset_partial_orths.xml";
const TEMP_FILE = "ls.test.ts.tmp.txt";

const LS_DATA = [
  {
    keys: ["Julius"].join(","),
    entry: new XmlNode("entryFree", [], ["Gallia est omnis"]).toString(),
  },
  {
    keys: ["Publius", "Naso"].join(","),
    entry: new XmlNode(
      "entryFree",
      [],
      ["Non iterum repetenda suo"]
    ).toString(),
  },
  {
    keys: ["Naso"].join(","),
    entry: new XmlNode("entryFree", [], ["Pennisque levatus"]).toString(),
  },
  {
    keys: ["īnō", "Ino"].join(","),
    entry: new XmlNode("entryFree", [], ["Ino edge case"]).toString(),
  },
  {
    keys: ["quis"].join(","),
    entry: new XmlNode("entryFree", [], ["quisUnspecified"]).toString(),
  },
  {
    keys: ["quĭs"].join(","),
    entry: new XmlNode("entryFree", [], ["quisShort"]).toString(),
  },
  {
    keys: ["quīs"].join(","),
    entry: new XmlNode("entryFree", [], ["quisLong"]).toString(),
  },
];

function toLsData(keys: string[]) {
  return keys.map((key) => ({ keys: [key + "_"].join(","), entry: key }));
}

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

function expectEqual(nodes: XmlNode[], expected: string[]) {
  const actuals = nodes.map((node) => node.toString());
  expect(actuals).toStrictEqual(expected);
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
    const keys = result[0].keys.split(",");
    expect(keys).toHaveLength(2);
    expect(keys).toContain("adtango");
    expect(keys).toContain("attango");
  });

  test("createProcessed handles elements with only alts", () => {
    const lewisAndShort = LewisAndShort.createProcessed(LS_SUBSET);

    const result = lewisAndShort.filter((entry) => entry.keys.includes("abs-"));

    expect(result).toHaveLength(1);
    const keys = result[0].keys.split(",");
    expect(keys).toHaveLength(1);
    expect(keys).toContain("abs-");
  });

  test("createProcessed removes alts if full orths are present", () => {
    const lewisAndShort = LewisAndShort.createProcessed(LS_SUBSET);

    const result = lewisAndShort.filter((entry) =>
      entry.keys.includes("arruo")
    );

    expect(result).toHaveLength(1);
    expect(result[0].keys).toBe("arruo");
  });

  test("save removes existing contents if present", async () => {
    writeFile("foo");

    await LewisAndShort.save(
      [{ keys: ["bar"].join(","), entry: "baz" }],
      TEMP_FILE
    );

    const result = fs.readFileSync(TEMP_FILE).toString();

    expect(result).not.toContain("foo");
    expect(result).toContain("bar");
  });

  test("save writes in expected format", async () => {
    const data = [
      {
        keys: ["Julius"].join(","),
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: ["Publius"].join(","), entry: "Non iterum repetenda suo" },
    ];
    await LewisAndShort.save(data, TEMP_FILE);

    const result = fs.readFileSync(TEMP_FILE).toString();
    const lines = result.split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(data[0].keys + "$$" + data[0].entry);
    expect(lines[1]).toBe(data[1].keys + "$$" + data[1].entry);
    // We expect a terminal newline, so there will be an empty string
    // at the end of the split.
    expect(lines[2]).toBe("");
  });

  test("save replaces newlines in contents", async () => {
    await LewisAndShort.save(
      [{ keys: ["bar"].join(","), entry: "baz\n" }],
      TEMP_FILE
    );

    const result = fs.readFileSync(TEMP_FILE).toString();
    const lines = result.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("baz@");
  });

  test("save writes list of keys", async () => {
    await LewisAndShort.save(
      [{ keys: ["foo", "bar"].join(","), entry: "baz" }],
      TEMP_FILE
    );

    const result = fs.readFileSync(TEMP_FILE).toString();
    const lines = result.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("foo,bar$$");
  });

  test("readFromFile handles each entry", async () => {
    const data = [
      { keys: ["Julius"].join(","), entry: "Gallia est omnis" },
      { keys: ["bar"].join(","), entry: "baz\n" },
      {
        keys: ["Publius", "Naso"].join(","),
        entry: "Non iterum repetenda suo",
      },
    ];
    await LewisAndShort.save(data, TEMP_FILE);

    const [keys, entries] = await LewisAndShort.readFromFile(TEMP_FILE);

    expect(keys.length).toBe(3);
    expect(entries.length).toBe(3);
    expect(keys[0]).toStrictEqual(data[0].keys.split(","));
    expect(entries[0]).toStrictEqual(data[0].entry);
    expect(keys[1]).toStrictEqual(data[1].keys.split(","));
    expect(entries[1]).toStrictEqual(data[1].entry);
    expect(keys[2]).toStrictEqual(data[2].keys.split(","));
    expect(entries[2]).toStrictEqual(data[2].entry);
  });

  test("getEntry handles expected entries", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expectEqual(
      (await dict.getEntry("Julius")).map((r) => r.entry),
      ['<div class="lsEntryFree">Gallia est omnis</div>']
    );
    expectEqual(
      (await dict.getEntry("Publius")).map((r) => r.entry),
      ['<div class="lsEntryFree">Non iterum repetenda suo</div>']
    );
  });

  test("getEntry handles expected entries", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    const outline = (await dict.getEntry("Julius")).map((r) => r.outline);

    expect(outline).toStrictEqual(["mockOutline"]);
  });

  test("getEntry handles ambiguous queries", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expectEqual(
      (await dict.getEntry("Naso")).map((r) => r.entry),
      [
        '<div class="lsEntryFree">Non iterum repetenda suo</div>',
        '<div class="lsEntryFree">Pennisque levatus</div>',
      ]
    );
  });

  test("getEntry handles unknown queries", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expectEqual(
      (await dict.getEntry("Foo")).map((r) => r.entry),
      ["<span>Could not find entry for Foo</span>"]
    );
  });

  test("getEntry handles same ascii orths in single article", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expectEqual(
      (await dict.getEntry("ino")).map((r) => r.entry),
      ['<div class="lsEntryFree">Ino edge case</div>']
    );
  });

  test("getEntry without diacritic returns all options", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expectEqual(
      (await dict.getEntry("quis")).map((r) => r.entry),
      [
        '<div class="lsEntryFree">quisUnspecified</div>',
        '<div class="lsEntryFree">quisShort</div>',
        '<div class="lsEntryFree">quisLong</div>',
      ]
    );
  });

  test("getEntry with breve returns short and ambiguous", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expectEqual(
      (await dict.getEntry("quĭs")).map((r) => r.entry),
      [
        '<div class="lsEntryFree">quisUnspecified</div>',
        '<div class="lsEntryFree">quisShort</div>',
      ]
    );
  });

  test("getEntry with macron returns long and ambiguous", async () => {
    await LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = await LewisAndShort.create(TEMP_FILE);

    expectEqual(
      (await dict.getEntry("quīs")).map((r) => r.entry),
      [
        '<div class="lsEntryFree">quisUnspecified</div>',
        '<div class="lsEntryFree">quisLong</div>',
      ]
    );
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
        keys: ["Julius", "Iulius"].join(","),
        entry: "",
      },
      {
        keys: ["Julus"].join(","),
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
