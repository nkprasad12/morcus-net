import { EntryResult } from "@/common/dictionaries/dict_result";
import { GeorgesDict } from "@/common/dictionaries/georges/georges_dict";
import { processGeorges } from "@/common/dictionaries/georges/process_georges";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { cleanupSqlTableFiles, replaceEnvVar } from "@/common/test_helpers";
import fs from "fs";

console.debug = jest.fn();

const TEMP_FILE = "georges_dict.test.ts.tmp.txt";
const FAKE_RAW_FILE = "goerges_dict.test.ts.raw.txt";

const GEORGES_XML = `
<root>
<body>
  <entryFree id="1">
    <orth>HELLO</orth>
    <def>a greeting</def>
  </entryFree>
  <entryFree id="2">
    <orth>SUP</orth>
    <def>
      <sense marker="1)" level="1">sup1</sense>
      <sense marker="2)" level="1">sup2 with <foreign>foreign text</foreign></sense>
    </def>
  </entryFree>
  <entryFree id="3">
    <orth>HI</orth>
    <orth>HEYO</orth>
    <def>
      <sense marker="A." level="1">informal <hi rend="italic">greeting</hi>
        <sense marker="1." level="2">used casually</sense>
      </sense>
      <abbr title="Abbreviation Title">abbr.</abbr>
    </def>
  </entryFree>
    <entryFree id="4">
    <orth>nuss</orth>
    <orth>nuß</orth>
    <def>nut</def>
  </entryFree>
</body>
</root>
`;

const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

replaceEnvVar("MORCEUS_DATA_ROOT", FAKE_MORCEUS_DATA_ROOT);
replaceEnvVar("GEORGES_RAW_PATH", FAKE_RAW_FILE);
replaceEnvVar("GEORGES_PROCESSED_PATH", TEMP_FILE);

async function expectEntriesWithIds(
  promise: Promise<EntryResult[]>,
  expected: string[]
) {
  const results = await promise;
  const ids = results.map((r) => r.entry.getAttr("id"));
  expect(ids).toStrictEqual(expected);
}

describe("GeorgesDict dict", () => {
  beforeEach(() => {
    fs.writeFileSync(FAKE_RAW_FILE, GEORGES_XML);
    processGeorges();
  });

  afterEach(() => {
    cleanupSqlTableFiles(TEMP_FILE);
    try {
      fs.unlinkSync(FAKE_RAW_FILE);
    } catch (e) {}
  });

  test("getEntry returns expected entries", async () => {
    const dict = new GeorgesDict(sqliteBacking(TEMP_FILE));

    expect(await dict.getEntry("Julius")).toEqual([]);
    await expectEntriesWithIds(dict.getEntry("hello"), ["grg1"]);
  });

  test("processing merges identical keys", async () => {
    const dict = new GeorgesDict(sqliteBacking(TEMP_FILE));

    const result = await dict.getEntry("sup");
    expect(result).toHaveLength(1);
    const entry = result[0].entry.toString();
    expect(entry).toContain("sup1");
    expect(entry).toContain("sup2");
  });

  test("getEntryById returns expected entries", async () => {
    const dict = new GeorgesDict(sqliteBacking(TEMP_FILE));

    const result = await dict.getEntryById("grg1");
    expect(result?.entry.toString()).toContain("a greeting");
  });

  test("getEntry returns expected completions", async () => {
    const dict = new GeorgesDict(sqliteBacking(TEMP_FILE));

    expect(await dict.getCompletions("H")).toEqual(["HELLO", "HEYO", "HI"]);
    expect(await dict.getCompletions("nus")).toEqual(["nuss", "nuß"]);
    expect(await dict.getCompletions("nuß")).toEqual(["nuss", "nuß"]);
  });
});
