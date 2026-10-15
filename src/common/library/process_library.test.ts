import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import {
  LIBRARY_INDEX,
  type LibraryIndex,
} from "@/common/library/library_lookup";
import { ProcessedWork2 } from "@/common/library/library_types";
import { processLibrary } from "@/common/library/process_library";
import { replaceEnvVar } from "@/common/test_helpers";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { decodeMessage } from "@/web/utils/rpc/parsing";
import { ServerMessage } from "@/web/utils/rpc/rpc";
import fs from "fs";
import zlib from "zlib";

console.debug = jest.fn();
console.log = jest.fn();

const LIB_DIR = "process_library_test_ts";
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
  } catch {}
  process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT;
});

function readIndex(): LibraryIndex {
  return JSON.parse(fs.readFileSync(`${LIB_DIR}/${LIBRARY_INDEX}`).toString());
}

/** Reads a work back the way the V2 library builder does. */
function readWork(workId: string): ProcessedWork2 {
  const [workPath] = readIndex()[workId];
  const decoded = zlib.gunzipSync(fs.readFileSync(workPath)).toString();
  return decodeMessage(
    decoded,
    ServerMessage.validator(ProcessedWork2.isMatch),
    [XmlNodeSerialization.DEFAULT]
  ).data;
}

describe("Library Processing", () => {
  test("stores works that decode by id", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    const result = readWork("phi0448.phi001.perseus-lat2");
    expect(result.info.author).toBe("Julius Caesar");
  });

  test("indexes works by author and name", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    const dbg = Object.values(readIndex()).find(
      ([_, meta]) =>
        meta.urlAuthor === "caesar" && meta.urlName === "de_bello_gallico"
    );
    expect(dbg?.[1].id).toBe("phi0448.phi001.perseus-lat2");
  });

  test("returns correct index", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    const result = Object.values(readIndex()).map(([_, meta]) => meta);

    expect(result).toHaveLength(5);
    expect(result[0].id).toBe("hypotactic_Eclogues_Calpurnius Siculus");
    expect(result[1].id).toBe("hypotactic_Odes_Horace");
    expect(result[2].id).toBe("hypotactic_Metamorphoses_Ovid");
    expect(result[3].id).toBe("hypotactic_Heroides_Ovid");
    expect(result[4].id).toBe("phi0448.phi001.perseus-lat2");
  });
});
