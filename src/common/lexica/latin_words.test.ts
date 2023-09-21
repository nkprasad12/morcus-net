import { getLatinWords } from "@/common/lexica/latin_words";
import fs from "fs";

const TEMP_FILE = "latin_words.test.ts.tmp";

beforeAll(() => {
  process.env.RAW_LATIN_WORDS = TEMP_FILE;
  fs.writeFileSync(TEMP_FILE, "ab\nhabeo\ninfluo\n");
});

afterAll(() => {
  try {
    fs.unlinkSync(TEMP_FILE);
  } catch {}
});

describe("Latin Words", () => {
  it("returns singleton", () => {
    expect(getLatinWords()).toBe(getLatinWords());
  });

  it("returns expected words", () => {
    expect(getLatinWords().has("ab")).toBe(true);
    expect(getLatinWords().has("influo")).toBe(true);
    expect(getLatinWords().has("")).toBe(false);
  });
});
