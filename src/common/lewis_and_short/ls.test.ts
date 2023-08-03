import fs from "fs";

import { LewisAndShort } from "@/common/lewis_and_short/ls";
import { XmlNode } from "@/common/xml_node";
import Database from "better-sqlite3";
import { LsResult } from "@/web/utils/rpc/ls_api_result";

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
    entry: new XmlNode(
      "entryFree",
      [["id", "Julius"]],
      ["Gallia est omnis"]
    ).toString(),
  },
  {
    keys: ["Publius", "Naso"].join(","),
    entry: new XmlNode(
      "entryFree",
      [["id", "Publius"]],
      ["Non iterum repetenda suo"]
    ).toString(),
  },
  {
    keys: ["Naso"].join(","),
    entry: new XmlNode(
      "entryFree",
      [["id", "Naso"]],
      ["Pennisque levatus"]
    ).toString(),
  },
  {
    keys: ["īnō", "Ino"].join(","),
    entry: new XmlNode(
      "entryFree",
      [["id", "Ino"]],
      ["Ino edge case"]
    ).toString(),
  },
  {
    keys: ["quis"].join(","),
    entry: new XmlNode(
      "entryFree",
      [["id", "quisNormal"]],
      ["quisUnspecified"]
    ).toString(),
  },
  {
    keys: ["quĭs"].join(","),
    entry: new XmlNode(
      "entryFree",
      [["id", "quisBreve"]],
      ["quisShort"]
    ).toString(),
  },
  {
    keys: ["quīs"].join(","),
    entry: new XmlNode(
      "entryFree",
      [["id", "quisMacron"]],
      ["quisLong"]
    ).toString(),
  },
];

function toLsData(keys: string[]) {
  return keys.map((key) => ({ keys: [key + "_"].join(","), entry: key }));
}

function writeFile(contents: string) {
  fs.writeFileSync(TEMP_FILE, contents);
}

describe("LewisAndShort", () => {
  async function expectEntriesWithIds(
    promise: Promise<LsResult[]>,
    expected: string[]
  ) {
    const results = await promise;
    const ids = results.map((r) => r.entry.getAttr("id"));
    expect(ids).toStrictEqual(expected);
  }

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

    LewisAndShort.save([{ keys: ["bar"].join(","), entry: "baz" }], TEMP_FILE);

    const result = fs.readFileSync(TEMP_FILE).toString();

    expect(result).not.toContain("foo");
    expect(result).toContain("bar");
  });

  test("save writes to SQL table", async () => {
    const data = [
      {
        keys: "Julius",
        entry: "Gallia est omnis divisa in partes tres",
      },
      { keys: "Publius", entry: "Non iterum repetenda suo" },
    ];
    LewisAndShort.save(data, TEMP_FILE);

    const db = new Database(TEMP_FILE, { readonly: true });
    const contents = db.prepare("SELECT * FROM data").all();

    expect(contents).toHaveLength(2);
    expect(contents[0]).toEqual({
      keys: data[0].keys,
      entry: data[0].entry,
      n: 0,
    });
    expect(contents[1]).toEqual({
      keys: data[1].keys,
      entry: data[1].entry,
      n: 1,
    });
  });

  test("getEntry handles expected entries", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    expectEntriesWithIds(dict.getEntry("Julius"), ["Julius"]);
    expectEntriesWithIds(dict.getEntry("Publius"), ["Publius"]);
  });

  test("getEntry handles expected entries", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    const outline = (await dict.getEntry("Julius")).map((r) => r.outline);

    expect(outline).toStrictEqual(["mockOutline"]);
  });

  test("getEntry handles ambiguous queries", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);
    expectEntriesWithIds(dict.getEntry("Naso"), ["Publius", "Naso"]);
  });

  test("getEntry handles unknown queries", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);
    expect(dict.getEntry("Foo")).resolves.toEqual([]);
  });

  test("getEntry handles same ascii orths in single article", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);
    expectEntriesWithIds(dict.getEntry("ino"), ["Ino"]);
  });

  test("getEntry without diacritic returns all options", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);
    expectEntriesWithIds(dict.getEntry("quis"), [
      "quisNormal",
      "quisBreve",
      "quisMacron",
    ]);
  });

  test("getEntry with breve returns short and ambiguous", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);
    expectEntriesWithIds(dict.getEntry("quĭs"), ["quisNormal", "quisBreve"]);
  });

  test("getEntry with macron returns long and ambiguous", async () => {
    LewisAndShort.save(LS_DATA, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);
    expectEntriesWithIds(dict.getEntry("quīs"), ["quisNormal", "quisMacron"]);
  });

  test("getCompletions returns expected results", async () => {
    const inputKeys = ["aba", "abbas", "abas", "abat", "abbat", "abatta"];
    LewisAndShort.save(toLsData(inputKeys), TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

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
    LewisAndShort.save(data, TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    expect(await dict.getCompletions("Juliu")).toStrictEqual(["Julius"]);
    expect(await dict.getCompletions("Iuliu")).toStrictEqual(["Iulius"]);
  });

  test("getCompletions handles different capitalization", async () => {
    LewisAndShort.save(toLsData(["arbor", "Arbor", "arboris"]), TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    expect(await dict.getCompletions("ar")).toStrictEqual([
      "arbor_",
      "Arbor_",
      "arboris_",
    ]);
  });

  test("getCompletions removes duplicate orths", async () => {
    LewisAndShort.save(toLsData(["arbor", "abeo", "abeo"]), TEMP_FILE);
    const dict = LewisAndShort.create(TEMP_FILE);

    expect(await dict.getCompletions("a")).toStrictEqual(["abeo_", "arbor_"]);
  });
});
