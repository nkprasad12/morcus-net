import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import {
  retrieveWorkPreEncoded,
  retrieveWorksList,
} from "@/common/library/library_lookup";
import { ProcessedWork2, WorkId } from "@/common/library/library_types";
import { processLibrary } from "@/common/library/process_library";
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

setupFakeHypotacticData();

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

async function retrieveWork(
  workId: WorkId,
  acceptEncoding?: string
): Promise<ProcessedWork2> {
  const requestData = { acceptEncoding: acceptEncoding ?? "gzip" };
  const response = await retrieveWorkPreEncoded(workId, LIB_DIR, requestData);
  const isGzipped = requestData.acceptEncoding?.includes("gzip");
  const decoded = (isGzipped ? zlib.gunzipSync(response) : response).toString();
  return decodeMessage(
    decoded,
    ServerMessage.validator(ProcessedWork2.isMatch),
    [XmlNodeSerialization.DEFAULT]
  ).data;
}

describe("Library Processing", () => {
  test("stores and retrieves by id correctly", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    const result = await retrieveWork({ id: "phi0448.phi001.perseus-lat2" });
    expect(result.info.author).toBe("Julius Caesar");
  });

  test("stores and retrieves by name and author correctly", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    const result = await retrieveWork({
      nameAndAuthor: { urlName: "de_bello_gallico", urlAuthor: "caesar" },
    });
    expect(result.info.author).toBe("Julius Caesar");
  });

  test("stores and retrieves uncompressed correctly", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    const result = await retrieveWork(
      { id: "phi0448.phi001.perseus-lat2" },
      ""
    );
    expect(result.info.author).toBe("Julius Caesar");
  });

  test("handles invalid request correctly", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    await expect(
      retrieveWork({ id: "phi0448.phi001.perseus-lat" })
    ).rejects.toHaveProperty("status", 404);
  });

  test("returns correct index", async () => {
    await processLibrary({ outputDir: LIB_DIR, works: [DBG_PATH] });
    const result = await retrieveWorksList(LIB_DIR);

    expect(result).toHaveLength(5);
    expect(result[0].id).toBe("hypotactic_Eclogues_Calpurnius Siculus");
    expect(result[1].id).toBe("hypotactic_Odes_Horace");
    expect(result[2].id).toBe("hypotactic_Metamorphoses_Ovid");
    expect(result[3].id).toBe("hypotactic_Heroides_Ovid");
    expect(result[4].id).toBe("phi0448.phi001.perseus-lat2");
  });
});
