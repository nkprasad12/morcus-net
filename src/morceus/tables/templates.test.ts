import { checkPresent } from "@/common/assert";
import {
  expandTemplates,
  expandTemplatesAndSave,
  loadTemplate,
} from "@/morceus/tables/templates";
import {
  LatinCase,
  LatinMood,
  LatinNumber,
  LatinTense,
  LatinVoice,
} from "@/morceus/types";
import fs from "fs";

console.debug = jest.fn();

const TESTDATA_DIR = "src/morceus/tables/lat/core/testdata/";
const TEST_TEMPLATES = `${TESTDATA_DIR}testTemplates`;
const DEP_TEMPLATES = `${TESTDATA_DIR}dependencyTemplates`;
const TARGET_TEMPLATES = `${TESTDATA_DIR}targetTemplates`;
const REAL_DEP_TEMPLATES = `morceus-data/latin/ends/dependency`;
const REAL_TARGET_TEMPLATES = `morceus-data/latin/ends/target`;
const DECL3 = `${REAL_DEP_TEMPLATES}/decl3.end`;
const DECL3_I = `${REAL_DEP_TEMPLATES}/decl3_i.end`;
const A_AE = `${REAL_TARGET_TEMPLATES}/a_ae.end`;
const TAS_TATIS = `${REAL_TARGET_TEMPLATES}/tas_tatis.end`;
const TEST_TMP_DIR = "src/morceus/tables/templates/testts/out";

function cleanup() {
  try {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  } catch {}
}

function setup() {
  cleanup();
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
}

describe("Template Loading", () => {
  test("loads template with only endings", () => {
    const result = loadTemplate(`${DEP_TEMPLATES}/decl1.end`);

    expect(result.name).toBe("decl1");
    expect(result.templates).toBeUndefined();
    expect(result.endings).toHaveLength(5);
    expect(result.endings![0]).toEqual({
      ending: "a",
      grammaticalData: {
        case: [LatinCase.Nominative, LatinCase.Vocative],
        number: LatinNumber.Singular,
      },
    });
    expect(result.endings![1]).toEqual({
      ending: "ae",
      grammaticalData: {
        case: LatinCase.Genitive,
        number: LatinNumber.Singular,
      },
    });
    expect(result.endings![2]).toEqual({
      ending: "ae",
      grammaticalData: {
        case: [LatinCase.Nominative, LatinCase.Vocative],
        number: LatinNumber.Plural,
      },
    });
    expect(result.endings![3]).toEqual({
      ending: "a_rum",
      grammaticalData: {
        case: LatinCase.Genitive,
        number: LatinNumber.Plural,
      },
    });
    expect(result.endings![4]).toEqual({
      ending: "a_i_",
      grammaticalData: {
        case: LatinCase.Genitive,
        number: LatinNumber.Singular,
      },
      tags: ["poetic"],
    });
  });

  test("loads template with only subtemplate", () => {
    const result = loadTemplate(`${TARGET_TEMPLATES}/a_ae.end`);

    expect(result.name).toBe("a_ae");
    expect(result.endings).toBeUndefined();
    expect(result.templates).toHaveLength(1);
    expect(result.templates![0]).toEqual({ name: "decl1" });
  });

  test("loads template with mixed subtemplate and endings", () => {
    const result = loadTemplate(`${TEST_TEMPLATES}/ambsub.end`);

    expect(result.name).toBe("ambsub");
    expect(result.endings).toHaveLength(2);
    expect(result.endings![0]).toEqual({
      ending: "am",
      grammaticalData: {
        tense: LatinTense.Future,
        mood: LatinMood.Indicative,
        voice: LatinVoice.Active,
      },
    });
    expect(result.endings![1]).toEqual({
      ending: "a_s",
      grammaticalData: {
        tense: LatinTense.Future,
        mood: LatinMood.Indicative,
        voice: LatinVoice.Active,
      },
    });
    expect(result.templates).toHaveLength(1);
    expect(result.templates![0]).toEqual({
      name: "amsub",
      prefix: "foo",
      args: ["fut", "ind"],
    });
  });
});

describe("Template Expansion", () => {
  beforeEach(setup);
  afterAll(cleanup);

  test("handles simple expansion", () => {
    const tables = expandTemplates([A_AE, DEP_TEMPLATES]);
    const table = checkPresent(tables.get("a_ae"));

    expect(table.name).toBe("a_ae");
    expect(table.endings).toHaveLength(5);
    expect(table.endings![0]).toEqual({
      ending: "a",
      grammaticalData: {
        case: [LatinCase.Nominative, LatinCase.Vocative],
        number: LatinNumber.Singular,
      },
    });
    expect(table.endings![1]).toEqual({
      ending: "ae",
      grammaticalData: {
        case: LatinCase.Genitive,
        number: LatinNumber.Singular,
      },
    });
    expect(table.endings![2]).toEqual({
      ending: "ae",
      grammaticalData: {
        case: [LatinCase.Nominative, LatinCase.Vocative],
        number: LatinNumber.Plural,
      },
    });
    expect(table.endings![3]).toEqual({
      ending: "a_rum",
      grammaticalData: {
        case: LatinCase.Genitive,
        number: LatinNumber.Plural,
      },
    });
    expect(table.endings![4]).toEqual({
      ending: "a_i_",
      grammaticalData: {
        case: LatinCase.Genitive,
        number: LatinNumber.Singular,
      },
      tags: ["poetic"],
    });
  });

  test("handles expansion with filter", () => {
    const tables = expandTemplates([TAS_TATIS, DECL3_I, DECL3]);
    const table = checkPresent(tables.get("tas_tatis"));

    expect(table.name).toBe("tas_tatis");
    expect(table.endings).toHaveLength(12);
  });

  test("writes to file", () => {
    expandTemplatesAndSave([TARGET_TEMPLATES, DEP_TEMPLATES], TEST_TMP_DIR);
    const table = fs.readFileSync(`${TEST_TMP_DIR}/a_ae.table`, "utf8");
    expect(table).toContain("a_rum");
  });
});
