/* istanbul ignore file */

const PORT = "1337";
const TEST_TMP_DIR = "tmp_server_integration_test";
// This should always be set to false when checked in,
// but is available as flag to speed up development of the
// tests themselves.
const REUSE_DEV = false;
setEnv();

import puppeteer, { Browser, Page } from "puppeteer";
import { Server } from "http";
import { DictsFusedApi, GetWork, ListLibraryWorks } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import fs from "fs";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { prodBuildSteps } from "@/scripts/prod_build_steps";
import { startMorcusServer } from "@/start_server";
import { checkPresent } from "@/common/assert";

// @ts-ignore
global.location = {
  origin: "http://localhost:1337",
};

function setEnv(reuseDev: boolean = REUSE_DEV) {
  process.env["PORT"] = PORT;
  process.env["CONSOLE_TELEMETRY"] = "yes";
  if (reuseDev === true) {
    return;
  }
  process.env["LS_PATH"] = `${TEST_TMP_DIR}/ls.xml`;
  process.env["LS_PROCESSED_PATH"] = `${TEST_TMP_DIR}/lsp.txt`;
  process.env["SH_RAW_PATH"] = `${TEST_TMP_DIR}/sh_raw.txt`;
  process.env["SH_PROCESSED_PATH"] = `${TEST_TMP_DIR}/shp.db`;
  process.env["RAW_LATIN_WORDS"] = `${TEST_TMP_DIR}/lat_raw.txt`;
  process.env["LATIN_INFLECTION_DB"] = `${TEST_TMP_DIR}/latin_inflect.db`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function setupMorcus(reuseDev: boolean = REUSE_DEV): Promise<Server> {
  fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
  setEnv(reuseDev);
  if (!reuseDev) {
    expect(await prodBuildSteps()).toBe(true);
  }
  return startMorcusServer();
}

let morcus: Server | undefined = undefined;
beforeAll(async () => {
  morcus = await setupMorcus(REUSE_DEV);
}, 180000);

afterAll(async () => {
  if (morcus !== undefined) {
    await closeServer(morcus);
  }
  fs.rmSync(TEST_TMP_DIR, { recursive: true });
}, 10000);

describe("morcus.net backend integration", () => {
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

describe("E2E Puppeteer tests", () => {
  let browser: Browser | undefined = undefined;
  // @ts-ignore - this is always set by beforeEach
  let page: Page = undefined;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: "new" });
  });

  beforeEach(async () => {
    await page?.close();
    page = await checkPresent(browser).newPage();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it("should load the Morcus dict page by default", async () => {
    await page.goto(global.location.origin);

    expect(await page.title()).toBe("Morcus Latin Tools");
    expect(page.url()).toMatch(/\/dicts$/);
  });

  it("should load dictionary results", async () => {
    await page.goto(global.location.origin);

    // TODO: Specifically select the dictionary tab here.

    await page.keyboard.type("canaba");
    await page.keyboard.press("Enter");

    expect(await page.title()).toBe("canaba | Morcus Latin Tools");
    expect(await page.$x('//*[contains(text(), "hovel")]')).not.toHaveLength(0);
  });
});
