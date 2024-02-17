import {
  expandTemplates,
  expandTemplatesAndSave,
  loadTemplate,
} from "@/morceus/tables/templates";
import fs from "fs";

const TESTDATA_DIR = "src/morceus/tables/lat/core/testdata/";
const TEST_TEMPLATES = `${TESTDATA_DIR}testTemplates`;
const DEP_TEMPLATES = `${TESTDATA_DIR}dependencyTemplates`;
const TARGET_TEMPLATES = `${TESTDATA_DIR}targetTemplates`;
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
      grammaticalData: ["nom/voc", "sg"],
    });
    expect(result.endings![1]).toEqual({
      ending: "ae",
      grammaticalData: ["gen", "sg"],
    });
    expect(result.endings![2]).toEqual({
      ending: "ae",
      grammaticalData: ["nom/voc", "pl"],
    });
    expect(result.endings![3]).toEqual({
      ending: "a_rum",
      grammaticalData: ["gen", "pl"],
    });
    expect(result.endings![4]).toEqual({
      ending: "a_i_",
      grammaticalData: ["gen", "sg"],
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
      grammaticalData: ["fut", "ind", "act"],
    });
    expect(result.endings![1]).toEqual({
      ending: "a_s",
      grammaticalData: ["fut", "ind", "act"],
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
    const tables = [...expandTemplates([TARGET_TEMPLATES], [DEP_TEMPLATES])];

    expect(tables).toHaveLength(1);
    const table = tables[0];
    expect(table.name).toBe("a_ae");
    expect(table.endings).toHaveLength(5);
    expect(table.endings![0]).toEqual({
      ending: "a",
      grammaticalData: ["nom/voc", "sg"],
    });
    expect(table.endings![1]).toEqual({
      ending: "ae",
      grammaticalData: ["gen", "sg"],
    });
    expect(table.endings![2]).toEqual({
      ending: "ae",
      grammaticalData: ["nom/voc", "pl"],
    });
    expect(table.endings![3]).toEqual({
      ending: "a_rum",
      grammaticalData: ["gen", "pl"],
    });
    expect(table.endings![4]).toEqual({
      ending: "a_i_",
      grammaticalData: ["gen", "sg"],
      tags: ["poetic"],
    });
  });

  test("writes to file", () => {
    expandTemplatesAndSave([TARGET_TEMPLATES], [DEP_TEMPLATES], TEST_TMP_DIR);
    const table = fs.readFileSync(`${TEST_TMP_DIR}/a_ae.table`, "utf8");
    expect(table).toContain("a_rum");
  });
});
