/* istanbul ignore file */

const PORT = "1337";
const TEST_TMP_DIR = "tmp_server_integration_test";
const REUSE_DEV = process.env.REUSE_DEV === "1" || false;
setEnv();

// @ts-ignore - puppeteer is an optional dependency.
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { Server } from "http";
import { DictsFusedApi, GetWork, ListLibraryWorks } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import fs from "fs";
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

async function assertHasText(text: string, page: Page) {
  const results = await page.$x(`//*[contains(text(), "${text}")]`);
  expect(results).not.toHaveLength(0);
}

// Just on chrome for now, but we should add firefox later.
// It requires some extra setup steps to install the browser.
describe.each(BROWSERS)("E2E Puppeteer tests on %s", (product) => {
  let browser: Browser | undefined = undefined;
  let currentPage: Page | undefined = undefined;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: "new", product });
  });

  afterEach(async () => {
    await currentPage?.close();
  });

  afterAll(async () => {
    await browser?.close();
  });

  async function getPage(size: ScreenSize, morcusPage?: string): Promise<Page> {
    currentPage = await checkPresent(browser).newPage();
    await setSize(size, currentPage);
    await currentPage.goto(global.location.origin + (morcusPage || ""));
    return currentPage;
  }

  it.each([SMALL_SCREEN, LARGE_SCREEN])(
    "should load the landing page on %s screen",
    async (screenSize) => {
      const page = await getPage(screenSize);

      expect(await page.title()).toBe("Morcus Latin Tools");
      expect(page.url()).toMatch(/\/dicts$/);
    }
  );

  it.each([SMALL_SCREEN, LARGE_SCREEN])(
    "should have working tab navigation on %s screen",
    async (screenSize) => {
      const page = await getPage(screenSize);

      await openTab("About", screenSize, page);
      await assertHasText("GPL-3.0", page);
      await assertHasText("CC BY-SA 4.0", page);
    }
  );

  it.each([SMALL_SCREEN, LARGE_SCREEN])(
    "should load dictionary results on %s screen",
    async (screenSize) => {
      const page = await getPage(screenSize, "/dicts");

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("canaba");
      await page.keyboard.press("Enter");

      expect(await page.title()).toBe("canaba | Morcus Latin Tools");
      await assertHasText("hovel", page);
    }
  );

  it.each([SMALL_SCREEN, LARGE_SCREEN])(
    "should load about page on %s screen",
    async (screenSize) => {
      const page = await getPage(screenSize, "/about");

      await assertHasText("GPL-3.0", page);
      await assertHasText("CC BY-SA 4.0", page);
    }
  );
});
