import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { GesnerDict } from "@/common/dictionaries/gesner/gesner_dict";
import { processGesner } from "@/common/dictionaries/gesner/process_gesner";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { singletonOf } from "@/common/misc_utils";
import { cleanupSqlTableFiles, replaceEnvVar } from "@/common/test_helpers";
import { MorceusCruncher } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  CruncherOptions,
  type LatinWordAnalysis,
} from "@/morceus/cruncher_types";
import fs from "fs";

console.debug = jest.fn();

setupMorceusWithFakeData();

const TEMP_FILE = "gesner_dict.test.ts.tmp.txt";
const FAKE_RAW_FILE = "gesner_dict.test.ts.raw.txt";

const FAKE_RAW_GESNER_ENTRIES = [
  { content: "<def><emph>HELLO</emph>a greeting</def>" },
  {
    content: "<def><emph>SUP</emph><sub>1</sub> sup1 <sub>2</sub> sup2</def>",
  },
  { content: "<def><emph>SERVVS</emph>servant</def>" },
  { content: "<def><emph>VOLVA</emph>womb</def>" },
  { content: "<def><emph>AMICVS [1]</emph>friend</def>" },
];

replaceEnvVar("GESNER_RAW_PATH", FAKE_RAW_FILE);
replaceEnvVar("GESNER_PROCESSED_PATH", TEMP_FILE);

const INFLECTION_PROVIDER = singletonOf<(x: string) => LatinWordAnalysis[]>(
  () => {
    const tables = MorceusTables.CACHED.get();
    const cruncher = MorceusCruncher.make(tables);
    return (word) => cruncher(word, CruncherOptions.DEFAULT);
  }
);

describe("Gesner dict", () => {
  let dict: GesnerDict;

  beforeEach(() => {
    fs.writeFileSync(FAKE_RAW_FILE, JSON.stringify(FAKE_RAW_GESNER_ENTRIES));
    processGesner();
    dict = new GesnerDict(sqliteBacking(TEMP_FILE), INFLECTION_PROVIDER.get());
  });

  afterEach(() => {
    cleanupSqlTableFiles(TEMP_FILE);
    try {
      fs.unlinkSync(FAKE_RAW_FILE);
    } catch (e) {}
  });

  test("getEntry returns expected entries", async () => {
    expect(await dict.getEntry("Julius")).toEqual([]);
    await expect(dict.getEntry("hello")).resolves.toHaveLength(1);
  });

  test("keys are normalized before insertion", async () => {
    // This is a known word (in the fake data), so we should match only the exact match.
    await expect(dict.getEntry("servus")).resolves.toHaveLength(1);
    // The word is unknown, so all V should be u.
    await expect(dict.getEntry("uolua")).resolves.toHaveLength(1);
    // AMICVS [1] -> amicus
    await expect(dict.getEntry("amicus")).resolves.toHaveLength(1);
  });

  test("getEntryById returns expected entries", async () => {
    const result = await dict.getEntryById("gesner_hello_0");
    expect(result?.entry.toString()).toContain("a greeting");
  });

  test("getCompletions returns expected completions", async () => {
    expect(await dict.getCompletions("s")).toEqual(["servus", "sup"]);
    expect(await dict.getCompletions("su")).toEqual(["sup"]);
    expect(await dict.getCompletions("ser")).toEqual(["servus"]);
  });
});
