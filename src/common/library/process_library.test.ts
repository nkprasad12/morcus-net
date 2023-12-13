import { makeMorpheusDb } from "@/common/lexica/latin_words";
import { SAMPLE_MORPHEUS_OUTPUT } from "@/common/lexica/morpheus_testdata";
import {
  retrieveWork,
  retrieveWorksList,
} from "@/common/library/library_lookup";
import { processLibrary } from "@/common/library/process_library";
import { cleanupSqlTableFiles } from "@/common/sql_test_helper";
import fs from "fs";

console.debug = jest.fn();

const MORPH_FILE = "process_library.test.ts.tmp.morph.txt";
const INFL_DB_FILE = "process_library.test.ts.tmp.lat.db";
const LIB_DIR = "process_library_test_ts";
const DBG_PATH =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

beforeAll(() => {
  process.env.LATIN_INFLECTION_DB = INFL_DB_FILE;
  fs.writeFileSync(MORPH_FILE, SAMPLE_MORPHEUS_OUTPUT);
  makeMorpheusDb(MORPH_FILE, INFL_DB_FILE);
  if (!fs.existsSync(LIB_DIR)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
  }
});

afterAll(() => {
  try {
    fs.unlinkSync(MORPH_FILE);
  } catch {}
  cleanupSqlTableFiles(INFL_DB_FILE);
  try {
    fs.rmSync(LIB_DIR, { recursive: true, force: true });
  } catch {}
});

describe("Library Processing", () => {
  test("stores and retrieves correctly", async () => {
    processLibrary(LIB_DIR, [DBG_PATH]);
    const result = await retrieveWork("phi0448.phi001.perseus-lat2", LIB_DIR);
    expect(result.info.author).toBe("Julius Caesar");
  });

  test("handles invalid request correctly", async () => {
    processLibrary(LIB_DIR, [DBG_PATH]);
    expect(
      retrieveWork("phi0448.phi001.perseus-lat", LIB_DIR)
    ).rejects.toHaveProperty("status", 404);
  });

  test("returns correct index", async () => {
    const result = await retrieveWorksList(LIB_DIR);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("phi0448.phi001.perseus-lat2");
  });
});
