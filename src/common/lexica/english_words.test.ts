import { getEnglishWords } from "@/common/lexica/english_words";
import fs from "fs";

const TEMP_FILE = "english_words.test.ts.tmp";

const SAMPLE_LINES = [
  "fungistat N?: fungistats",
  "fungoid A: fungoidder?, fungoider<? 1 | fungoiddest?, fungoidest<? 1",
  "fungoid N: fungoids",
  "funk V: funked | funking | funks",
];

const EXPECTED_WORDS = [
  "fungistat",
  "fungistats",
  "fungoid",
  "fungoidder",
  "fungoider",
  "fungoiddest",
  "fungoidest",
  "fungoid",
  "fungoids",
  "funk",
  "funked",
  "funking",
  "funks",
];

beforeAll(() => {
  process.env.RAW_ENGLISH_WORDS = TEMP_FILE;
  fs.writeFileSync(TEMP_FILE, SAMPLE_LINES.join("\n"));
});

afterAll(() => {
  try {
    fs.unlinkSync(TEMP_FILE);
  } catch {}
});

describe("English Words", () => {
  it("returns singleton", () => {
    expect(getEnglishWords()).toBe(getEnglishWords());
  });

  it("returns expected words", () => {
    EXPECTED_WORDS.forEach((word) =>
      expect(getEnglishWords().has(word)).toBe(true)
    );
  });
});
