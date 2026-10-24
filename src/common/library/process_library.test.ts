import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import { LatinWorks } from "@/common/library/library_constants";
import {
  processLibrary,
  SHORT_TITLE_BY_WORK_ID,
  stripXmlProlog,
  URL_NAME_BY_WORK_ID,
} from "@/common/library/process_library";
import { parseRawXml } from "@/common/xml/xml_utils";
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

describe("stripXmlProlog", () => {
  const ROOT = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>Gallia</body></text></TEI>`;
  // The prologs found in canonical-latinLit, verbatim.
  const P4_DOCTYPE = `<!DOCTYPE TEI.2 PUBLIC "-//TEI P4//DTD Main DTD Driver File//EN" "http://www.tei-c.org/Guidelines/DTD/tei2.dtd" [
<!ENTITY % TEI.XML "INCLUDE">
<!ENTITY % PersProse PUBLIC "-//Perseus P4//DTD Perseus Prose//EN" "http://www.perseus.tufts.edu/DTD/1.0/PersProse.dtd" >
%PersProse;
]>`;
  const P4_DOCTYPE_TIGHT = `<!DOCTYPE TEI.2 PUBLIC "-//TEI P4//DTD Main DTD Driver File//EN" "http://www.tei-c.org/Guidelines/DTD/tei2.dtd"[
<!ENTITY % TEI.XML "INCLUDE">
<!ENTITY % PersProse PUBLIC "-//Perseus P4//DTD Perseus Prose//EN" "http://www.perseus.tufts.edu/DTD/1.0/PersProse.dtd">
%PersProse;
]>`;
  const XML_MODEL = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng"
  schematypens="http://relaxng.org/ns/structure/1.0"?>
<?xml-model href="http://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng"
  schematypens="http://purl.oclc.org/dsdl/schematron"?>`;

  it.each([
    ["no prolog", ""],
    ["an XML declaration", `<?xml version='1.0' encoding='UTF-8'?>\n`],
    ["xml-model instructions", `${XML_MODEL}\n`],
    [
      "xml-model instructions and a comment",
      `${XML_MODEL}\n<!-- https://epidoc.stoa.org/schema/latest/tei-epidoc.rng -->\n`,
    ],
    ["a P4 DOCTYPE with an internal subset", `${P4_DOCTYPE}\n`],
    ["a P4 DOCTYPE with no space before its subset", `${P4_DOCTYPE_TIGHT}\n`],
    [
      "a declaration and a P4 DOCTYPE",
      `<?xml version="1.0"?>\n${P4_DOCTYPE}\n`,
    ],
    ["a byte order mark", `\uFEFF<?xml version="1.0"?>\n`],
    ["a DOCTYPE without a subset", `<!DOCTYPE TEI SYSTEM "tei.dtd">\n`],
    [
      "a subset with a comment and a quoted ]>",
      `<!DOCTYPE TEI [ <!-- ]> --> <!ENTITY x "]>"> ]>\n`,
    ],
  ])("removes %s", (_, prolog) => {
    const stripped = stripXmlProlog(prolog + ROOT);

    expect(stripped).toBe(ROOT);
    expect(parseRawXml(stripped).name).toBe("TEI");
  });

  it("leaves the body alone", () => {
    const body = `<TEI><text><!-- c --><?pi x?><body>a</body></text></TEI>`;
    expect(stripXmlProlog(`<?xml version="1.0"?>${body}`)).toBe(body);
  });

  it("throws on an unterminated DOCTYPE", () => {
    expect(() => stripXmlProlog(`<!DOCTYPE TEI [ <!ENTITY x "y">`)).toThrow();
  });
});

describe("pinned slugs", () => {
  it("pin only onboarded works, to distinct slugs", () => {
    const onboarded = new Set<string>(Object.values(LatinWorks));
    for (const id of [
      ...URL_NAME_BY_WORK_ID.keys(),
      ...SHORT_TITLE_BY_WORK_ID.keys(),
    ]) {
      expect(onboarded).toContain(id);
    }
    const slugs = [...URL_NAME_BY_WORK_ID.values()];
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
