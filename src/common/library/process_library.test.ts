import {
  retrieveWork,
  retrieveWorksList,
} from "@/common/library/library_lookup";
import { processLibrary } from "@/common/library/process_library";
import fs from "fs";

console.debug = jest.fn();
console.log = jest.fn();

const LIB_DIR = "process_library_test_ts";
const DBG_PATH =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

beforeAll(() => {
  if (!fs.existsSync(LIB_DIR)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
  }
});

afterAll(() => {
  try {
    fs.rmSync(LIB_DIR, { recursive: true, force: true });
  } catch {}
});

describe("Library Processing", () => {
  test("stores and retrieves by id correctly", async () => {
    processLibrary(LIB_DIR, [DBG_PATH]);
    const result = await retrieveWork(
      { id: "phi0448.phi001.perseus-lat2" },
      LIB_DIR
    );
    expect(result.info.author).toBe("Julius Caesar");
  });

  test("stores and retrieves by name and author correctly", async () => {
    processLibrary(LIB_DIR, [DBG_PATH]);
    const result = await retrieveWork(
      { nameAndAuthor: { urlName: "de_bello_gallico", urlAuthor: "caesar" } },
      LIB_DIR
    );
    expect(result.info.author).toBe("Julius Caesar");
  });

  test("handles invalid request correctly", async () => {
    processLibrary(LIB_DIR, [DBG_PATH]);
    expect(
      retrieveWork({ id: "phi0448.phi001.perseus-lat" }, LIB_DIR)
    ).rejects.toHaveProperty("status", 404);
  });

  test("returns correct index", async () => {
    const result = await retrieveWorksList(LIB_DIR);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("phi0448.phi001.perseus-lat2");
  });
});
