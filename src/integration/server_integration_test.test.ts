/* istanbul ignore file */

const PORT = "1337";
const TEST_TMP_DIR = "tmp_server_integration_test";
const REUSE_DEV = process.env.REUSE_DEV === "1" || false;
setEnv();

import { gzipSync } from "zlib";
// @ts-ignore - puppeteer is an optional dependency.
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { Server } from "http";
import { DictsFusedApi, GetWork, ListLibraryWorks } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import fs, { mkdirSync, readFileSync, readdirSync, rmSync } from "fs";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { prodBuildSteps } from "@/scripts/prod_build_steps";
import { startMorcusServer } from "@/start_server";
import { assert, assertEqual, checkPresent } from "@/common/assert";
import { ServerMessage } from "@/web/utils/rpc/rpc";
import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";

// @ts-ignore
global.location = {
  origin: "http://localhost:1337",
};

const SCREENSHOTS_DIR = "puppeteer_screenshots";

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

describe("bundle size check", () => {
  const GENFILES_ROOT = "genfiles_static";

  test("bundle size is within limit", () => {
    const bundleFiles = readdirSync(GENFILES_ROOT);
    let totalSize = 0;
    for (const genfile of bundleFiles) {
      if (!genfile.endsWith(".client-bundle.js")) {
        continue;
      }
      const fileData = readFileSync(`${GENFILES_ROOT}/${genfile}`);
      const gzipped = gzipSync(fileData).byteLength;
      console.debug(`${genfile}: ${gzipped / 1024}`);
      totalSize += gzipped;
    }

    expect(totalSize / 1024).toBeLessThan(175);
  });
});

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

  test("handles concurrent requests", async () => {
    const fetchHabeo = () =>
      callApiFull(DictsFusedApi, {
        query: "habeo",
        dicts: [LatinDict.LewisAndShort.key],
      });

    const requests: Promise<ServerMessage<DictsFusedResponse>>[] = [];
    for (const _ of Array(10).fill(0)) {
      requests.push(fetchHabeo());
    }
    await Promise.all(requests);

    for (const result of requests) {
      const articles = (await result).data[LatinDict.LewisAndShort.key];
      expect(articles).toHaveLength(1);
      expect(articles[0].entry.toString().includes("to have")).toBe(true);
    }
  });
});

type BrowserProduct = "chrome" | "firefox";
const BROWSERS: BrowserProduct[] = ["chrome"];

type ScreenSize = "small" | "large";
const SMALL_SCREEN: ScreenSize = "small";
const LARGE_SCREEN: ScreenSize = "large";
const SIZE_VARIANTS: ScreenSize[] = [SMALL_SCREEN, LARGE_SCREEN];
const LARGE_ONLY: (iterations: number) => [ScreenSize, number][] = (n) =>
  [...Array(n).keys()].flatMap((i) =>
    [LARGE_SCREEN].map((v) => [v, i + 1] as [ScreenSize, number])
  );
const ALL_SCREEN_SIZES: (iterations: number) => [ScreenSize, number][] = (n) =>
  [...Array(n).keys()].flatMap((i) =>
    SIZE_VARIANTS.map((v) => [v, i + 1] as [ScreenSize, number])
  );

async function setSize(size: ScreenSize, page: Page) {
  const isSmall = size === "small";
  await page.setViewport({
    width: isSmall ? 600 : 1900,
    height: isSmall ? 900 : 1080,
    deviceScaleFactor: 1,
  });
}

async function getButtonByAriaLabel(
  label: string,
  page: Page
): Promise<ElementHandle<HTMLButtonElement>> {
  const results = await page.$$(`button[aria-label="${label}"]`);
  assertEqual(
    results.length,
    1,
    `Found ${results.length} buttons with label ${label}`
  );
  const button = results[0];
  assert(await button.isVisible());
  return results[0] as ElementHandle<HTMLButtonElement>;
}

async function filterNonVisible<
  T extends { isVisible: () => Promise<boolean> }
>(items: T[]): Promise<T[]> {
  const results: T[] = [];
  for (const item of items) {
    if (await item.isVisible()) {
      results.push(item);
    }
  }
  return results;
}

async function getButtonByLabel(
  label: string,
  page: Page
): Promise<ElementHandle<HTMLButtonElement>> {
  const allResults = await page.$x(`//button[contains(., '${label}')]`);
  const visibleResults = await filterNonVisible(allResults);
  assertEqual(
    visibleResults.length,
    1,
    `Found ${visibleResults.length} visible buttons with label ${label}`
  );
  return visibleResults[0] as ElementHandle<HTMLButtonElement>;
}

function wait(timeMs: number): Promise<void> {
  return new Promise((r) => setTimeout(r, timeMs));
}

async function openTab(label: string, size: ScreenSize, page: Page) {
  const isSmall = size === "small";
  if (isSmall) {
    const hamburger = await getButtonByAriaLabel("site pages", page);
    await hamburger.click();
    // Wait for the drawer entry transition, which is 150 ms
    await wait(200);
  }
  const tabButton = await getButtonByLabel(label, page);
  await tabButton.click();
  if (isSmall) {
    // Wait for the drawer exit transition, which is 150 ms
    await wait(200);
  }
}

async function findText(text: string, page: Page, parentType: string = "*") {
  const results = await page.$x(`//${parentType}[contains(text(), "${text}")]`);
  expect(results).toHaveLength(1);
  return results[0] as ElementHandle<Element>;
}

// Just on chrome for now, but we should add firefox later.
// It requires some extra setup steps to install the browser.
describe.each(BROWSERS)("E2E Puppeteer tests on %s", (product) => {
  let browser: Browser | undefined = undefined;
  let currentPage: Page | undefined = undefined;
  let testName: string | undefined = undefined;
  let screenSize: ScreenSize | undefined = undefined;
  let iteration: number | undefined = undefined;

  beforeAll(async () => {
    try {
      rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
    } catch {}
    try {
      mkdirSync(SCREENSHOTS_DIR);
    } catch {}
    browser = await puppeteer.launch({ headless: "new", product });
    currentPage = await checkPresent(browser).newPage();
  });

  afterAll(async () => {
    await currentPage?.close();
    await browser?.close();
  });

  async function takeScreenshot(): Promise<void> {
    const page = checkPresent(currentPage);
    const tag = `${testName}.${screenSize}.n${iteration}.png`;
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/${tag}` });
  }

  function writeContext(tag: string, size: ScreenSize, i: number) {
    testName = tag;
    screenSize = size;
    iteration = i;
  }

  async function checkTitleIs(expected: string): Promise<void> {
    const page = checkPresent(currentPage);
    let title: string | undefined = undefined;
    for (let i = 0; i < 3; i++) {
      title = await page.title();
      if (title === expected) {
        break;
      }
    }
    if (title !== expected) {
      await takeScreenshot();
    }
    expect(title).toBe(expected);
  }

  async function checkHasText(text: string): Promise<void> {
    const page = checkPresent(currentPage);
    const results = await page.$x(`//*[contains(text(), "${text}")]`);
    if (results.length === 0) {
      await takeScreenshot();
    }
    expect(results).not.toHaveLength(0);
  }

  async function getPage(size: ScreenSize, morcusPage?: string): Promise<Page> {
    const page = checkPresent(currentPage);
    await setSize(size, page);
    await page.goto(global.location.origin + (morcusPage || ""));
    return page;
  }

  it.each(ALL_SCREEN_SIZES(1))(
    "should load the landing page on %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize);
      writeContext("loadLanding", screenSize, i);

      await checkTitleIs("Morcus Latin Tools");
      expect(page.url()).toMatch(/\/dicts$/);
    }
  );

  it.each(ALL_SCREEN_SIZES(3))(
    "should have working tab navigation on %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize);
      writeContext("tabNav", screenSize, i);

      await openTab("About", screenSize, page);
      await checkHasText("GPL-3.0");
      await checkHasText("CC BY-SA 4.0");
    }
  );

  it.each(LARGE_ONLY(5))(
    "should load dictionary results on %s screen by typing and enter #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("dictSearchTypeEnter", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("canaba");
      await page.keyboard.press("Enter");

      await checkTitleIs("canaba | Morcus Latin Tools");
      await checkHasText("hovel");
    }
  );

  it.each(LARGE_ONLY(5))(
    "should load dictionary results on %s screen by arrows and autocomplete #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("dictSearchArrowEnter", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("can");
      await checkHasText("cānăba");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");

      await checkTitleIs("cānăba | Morcus Latin Tools");
      await checkHasText("hovel");
    }
  );

  it.each(ALL_SCREEN_SIZES(5))(
    "should load dictionary results on %s screen by click and autocomplete #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("dictSearchClick", screenSize, i);

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("can");
      await checkHasText("cānăba");
      await (await findText("cānăba", page, "span")).click();

      await checkTitleIs("cānăba | Morcus Latin Tools");
      await checkHasText("hovel");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should load about page on %s screen #%s",
    async (screenSize, i) => {
      await getPage(screenSize, "/about");
      writeContext("aboutPage", screenSize, i);

      await checkHasText("GPL-3.0");
      await checkHasText("CC BY-SA 4.0");
    }
  );

  it.each(ALL_SCREEN_SIZES(1))(
    "should allow linkified latin words in SH %s screen #%s",
    async (screenSize, i) => {
      const page = await getPage(screenSize, "/dicts");
      writeContext("linkLatInSH", screenSize, i);

      await page.keyboard.type("influence");
      await page.keyboard.press("Enter");

      await checkHasText("cohortandum");
      await (await findText("cohortandum", page)).click();

      expect(page.url()).toContain("/dicts?q=cohortandum");
    }
  );
});
