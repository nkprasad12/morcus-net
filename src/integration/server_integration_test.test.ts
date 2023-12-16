/* istanbul ignore file */

const PORT = "5757";
const TEST_TMP_DIR = "tmp_server_integration_test";
setEnv();

import { Server } from "http";
import { DictsFusedApi, GetWork, ListLibraryWorks } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import fs from "fs";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { prodBuildSteps } from "@/scripts/prod_build_steps";
import { startMorcusServer } from "@/start_server";

// @ts-ignore
global.location = {
  origin: "http://localhost:5757",
};

function setEnv() {
  process.env["LS_PATH"] = `${TEST_TMP_DIR}/ls.xml`;
  process.env["LS_PROCESSED_PATH"] = `${TEST_TMP_DIR}/lsp.txt`;
  process.env["SH_RAW_PATH"] = `${TEST_TMP_DIR}/sh_raw.txt`;
  process.env["SH_PROCESSED_PATH"] = `${TEST_TMP_DIR}/shp.db`;
  process.env["PORT"] = PORT;
  process.env["CONSOLE_TELEMETRY"] = "yes";
  process.env["RAW_LATIN_WORDS"] = `${TEST_TMP_DIR}/lat_raw.txt`;
  process.env["LATIN_INFLECTION_DB"] = `${TEST_TMP_DIR}/latin_inflect.db`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe("morcus.net backend integration", () => {
  let morcus: Server | undefined = undefined;

  beforeAll(async () => {
    fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
    setEnv();
    expect(await prodBuildSteps()).toBe(true);
    morcus = await startMorcusServer();
  }, 180000);

  afterAll(async () => {
    if (morcus !== undefined) {
      await closeServer(morcus);
    }
    fs.rmSync(TEST_TMP_DIR, { recursive: true });
  }, 10000);

  test("returns LS results in uninflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "canaba",
      dicts: [LatinDict.LewisAndShort.key],
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("cannăba")).toBe(true);
  });

  test("returns LS results in inflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "undarum",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("billow")).toBe(true);
  });

  test("returns LS results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "n1153",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("ἀηδών")).toBe(true);
  });

  test("returns SH results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "sh2708",
      dicts: [LatinDict.SmithAndHall.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("caerŭlĕus")).toBe(true);
  });

  test("returns SH results", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "influence",
      dicts: [LatinDict.SmithAndHall.key],
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(2);
    expect(articles[0].entry.toString().includes("Power exerted")).toBe(true);
    expect(articles[1].entry.toString().includes("impello")).toBe(true);
  });

  test("returns expected library result list", async () => {
    const result = await callApiFull(ListLibraryWorks, {});

    const works = result.data;
    expect(
      works.filter((work) => work.id === "phi0448.phi001.perseus-lat2")
    ).toHaveLength(1);
  });

  test("returns DBG on request", async () => {
    const result = await callApiFull(GetWork, "phi0448.phi001.perseus-lat2");
    expect(result.data.info.title).toBe("De bello Gallico");
  });
});
