import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import { processLibrary } from "@/common/library/process_library";
import { replaceEnvVar } from "@/common/test_helpers";
import {
  getV2LibrarySummaries,
  getV2Work,
  resolvePageInWork,
} from "@/web/ui/reader/reader_loader.server";
import fs from "fs";

console.debug = jest.fn();
console.log = jest.fn();

const LIB_DIR = "process_library_test_ts";
const CORPUS_INPUT_DIR = "process_library_corpus_test_ts";
const DBG_PATH =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

const ORIGINAL_MORCEUS_DATA_ROOT = process.env.MORCEUS_DATA_ROOT;
const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

function setupFakePhiDir() {
  const testDataRoot = fs.mkdtempSync("phi-testdata-");
  replaceEnvVar("PHI_JSON_ROOT", testDataRoot);

  afterAll(() => {
    try {
      fs.rmSync(testDataRoot, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up test data:", error);
    }
  });
}

setupFakeHypotacticData();
setupFakePhiDir();

beforeAll(() => {
  process.env.MORCEUS_DATA_ROOT = FAKE_MORCEUS_DATA_ROOT;
  if (!fs.existsSync(LIB_DIR)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
  }
});

afterAll(() => {
  try {
    fs.rmSync(LIB_DIR, { recursive: true, force: true });
    fs.rmSync(CORPUS_INPUT_DIR, { recursive: true, force: true });
  } catch {}
  process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT;
});

describe("Library Processing", () => {
  test("stores works and pages in SQLite that load by id", async () => {
    await processLibrary({
      outputDir: LIB_DIR,
      corpusInputDir: CORPUS_INPUT_DIR,
      works: [DBG_PATH],
    });
    const result = await getV2Work("phi0448.phi001.perseus-lat2", LIB_DIR);
    expect(result?.author).toBe("Julius Caesar");
    expect(result?.tocHtml).toContain("reader-toc-item");
    const { page } = resolvePageInWork(result!, "1.1");
    expect(page).toBe(result!.pages[0]);
    expect(page.singleHtml).toContain("Gallia est omnis divisa");
  });

  test("indexes works by author and name slug", async () => {
    await processLibrary({
      outputDir: LIB_DIR,
      corpusInputDir: CORPUS_INPUT_DIR,
      works: [DBG_PATH],
    });
    const dbg = await getV2Work("caesar/de_bello_gallico", LIB_DIR);
    expect(dbg?.id).toBe("phi0448.phi001.perseus-lat2");
  });

  test("returns sorted work summaries", async () => {
    await processLibrary({
      outputDir: LIB_DIR,
      corpusInputDir: CORPUS_INPUT_DIR,
      works: [DBG_PATH],
    });
    const result = await getV2LibrarySummaries(LIB_DIR);

    expect(result.map((s) => s.id)).toEqual([
      "hypotactic_Eclogues_Calpurnius Siculus",
      "hypotactic_Odes_Horace",
      "phi0448.phi001.perseus-lat2",
      "hypotactic_Heroides_Ovid",
      "hypotactic_Metamorphoses_Ovid",
    ]);
  });
});
