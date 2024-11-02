// @ts-ignore - puppeteer is an optional dependency.
import puppeteer, { Browser, ElementHandle, Page } from "puppeteer";
import { mkdirSync, rmSync } from "fs";
import { checkPresent } from "@/common/assert";
import {
  findText,
  openTab,
  setSize,
  type ScreenSize,
  ALL_SCREEN_SIZES,
  BROWSERS,
  multiSizeIteratedTest,
} from "@/integration/utils/puppeteer_utils";

export function defineBrowserE2eSuite() {
  // Just on chrome for now, but we should add firefox later.
  // It requires some extra setup steps to install the browser.
  describe.each(BROWSERS)("E2E Puppeteer tests on %s", (product) => {
    let browser: Browser | undefined = undefined;
    let currentPage: Page | undefined = undefined;
    let testName: string | undefined = undefined;
    let screenSize: ScreenSize | undefined = undefined;
    let iteration: number | undefined = undefined;

    function screenshotsDir() {
      return `puppeteer_screenshots/${product}`;
    }

    beforeAll(async () => {
      try {
        rmSync(screenshotsDir(), { recursive: true, force: true });
      } catch {}
      try {
        mkdirSync(screenshotsDir());
      } catch {}
      browser = await puppeteer.launch({ headless: true, browser: product });
      const context = browser.defaultBrowserContext();
      if (product === "chrome") {
        await context.overridePermissions(global.location.origin, [
          "clipboard-read",
          "clipboard-write",
          "clipboard-sanitized-write",
        ]);
      }
      currentPage = await checkPresent(browser).newPage();
    });

    // Firefox doesn't nicely handle re-use of the same page.
    afterEach(async () => {
      if (product === "chrome") {
        return;
      }
      await currentPage?.close();
      currentPage = await checkPresent(browser).newPage();
    });

    afterAll(async () => {
      await currentPage?.close();
      await browser?.close();
    });

    async function takeScreenshot(): Promise<void> {
      const page = checkPresent(currentPage);
      const tag = `${testName}.${screenSize}.n${iteration}.png`;
      await page.screenshot({ path: `${screenshotsDir()}/${tag}` });
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
      const results = await page.$$(`xpath/.//*[contains(text(), "${text}")]`);
      if (results.length === 0) {
        await takeScreenshot();
        throw new Error(`Failed to find text: ${text}`);
      }
    }

    async function waitForText(
      text: string,
      parentType: string = "*",
      className?: string
    ): Promise<ElementHandle<Element>> {
      const page = checkPresent(currentPage);
      const classString =
        className === undefined ? "" : `and @class="${className}"`;
      try {
        const results = await page.waitForSelector(
          `xpath/.//${parentType}[contains(text(), "${text}")${classString}]`,
          { timeout: 3000 }
        );
        return checkPresent(results, `Failed to find text: ${text}`);
      } catch (err) {
        await takeScreenshot();
        throw err;
      }
    }

    async function awaitVisible(
      element: ElementHandle<Element>,
      timeout: number
    ): Promise<void> {
      const interval = timeout / 20;
      for (let i = 0; i < 20; i++) {
        const isVisible = await element.isIntersectingViewport();
        if (isVisible) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
      await takeScreenshot();
      throw new Error("Failed to find element on screen!");
    }

    async function awaitAndClickText(
      text: string,
      parentType: string = "*",
      className?: string
    ) {
      await waitForText(text, parentType, className);
      await (
        await findText(text, checkPresent(currentPage), parentType, className)
      ).click();
    }

    async function waitForUrlChange(old: string): Promise<string> {
      const page = checkPresent(currentPage);
      let url: string = "";
      for (let i = 0; i < 3; i++) {
        url = page.url();
        if (url !== old) {
          return url;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await takeScreenshot();
      throw new Error(`Timed out waiting for change from: ${url}`);
    }

    async function getPage(
      size: ScreenSize,
      morcusPage?: string
    ): Promise<Page> {
      const page = await getEmptyPage(size);
      await page.goto(global.location.origin + (morcusPage || ""));
      return page;
    }

    async function getEmptyPage(size: ScreenSize): Promise<Page> {
      const page = checkPresent(currentPage);
      await setSize(size, page);
      return page;
    }

    const e2eTest: typeof multiSizeIteratedTest = (sizes, iterations) => {
      return (name, testCase) => {
        multiSizeIteratedTest(sizes, iterations)(name, async (size, i) => {
          const tag = name.replaceAll(" ", "-");
          writeContext(tag, size, i);
          await testCase(size, i);
        });
      };
    };

    // // // // // // // // //
    // General / Navigation //
    // // // // // // // // //

    e2eTest()("should load the landing page", async (screenSize) => {
      const page = await getPage(screenSize);

      await checkTitleIs("Morcus Latin Tools");
      expect(page.url()).toMatch(/\/dicts$/);
    });

    e2eTest(ALL_SCREEN_SIZES, 3)(
      "should have working tab navigation",
      async (screenSize) => {
        const page = await getPage(screenSize);

        await openTab("About", screenSize, page);
        await checkHasText("GPL-3.0");
        await checkHasText("CC BY-SA 4.0");
      }
    );

    e2eTest()("should load about page", async (screenSize) => {
      await getPage(screenSize, "/about");

      await checkHasText("GPL-3.0");
      await checkHasText("CC BY-SA 4.0");
    });

    // // // // // // // // //
    // Dictionary - Search  //
    // // // // // // // // //

    e2eTest("large", 5)(
      "should load dictionary results by typing and enter",
      async (screenSize) => {
        const page = await getPage(screenSize, "/dicts");

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("canaba", { delay: 20 });
        await page.keyboard.press("Enter");

        await waitForText("hovel");
        await checkTitleIs("canaba | Morcus Latin Tools");
      }
    );

    e2eTest("large", 5)(
      "should load dictionary results by arrows and autocomplete",
      async (screenSize) => {
        const page = await getPage(screenSize, "/dicts");

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("can", { delay: 20 });
        await waitForText("cānăba");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");

        await waitForText("hovel");
        await checkTitleIs("cānăba | Morcus Latin Tools");
      }
    );

    e2eTest(ALL_SCREEN_SIZES, 5)(
      "should load dictionary results by click and autocomplete",
      async (screenSize) => {
        const page = await getPage(screenSize, "/dicts");

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("can", { delay: 20 });
        await awaitAndClickText("cānăba", "span");

        await waitForText("hovel");
        await checkTitleIs("cānăba | Morcus Latin Tools");
      }
    );

    // // // // // // // //
    // Dictionary - Main //
    // // // // // // // //

    e2eTest()(
      "should allow linkified latin words in SH",
      async (screenSize) => {
        const page = await getPage(screenSize, "/dicts");

        await page.click(`[aria-label="Dictionary search box"]`);
        await page.keyboard.type("influence", { delay: 20 });
        await page.keyboard.press("Enter");

        await waitForText("cohortandum");
        const oldUrl = page.url();
        await (await findText("cohortandum", page)).click();

        // The lemma form of cohortandum
        await waitForText("cŏ-hortor");
        if (product === "firefox") {
          console.warn(
            "Skipping URL check on Firefox because it doesn't work. This should be investigated later."
          );
          return;
        }
        const url = await waitForUrlChange(oldUrl);
        expect(url).toContain("/dicts?q=cohortandum");
      }
    );

    e2eTest()("should allow loading entries by old id", async (screenSize) => {
      await getPage(screenSize, "/dicts?q=n37007&o=2");
      await checkHasText("pondus");
      await checkHasText("a weight");
    });

    e2eTest()("should allow loading LS entries by name", async (screenSize) => {
      await getPage(screenSize, "/dicts?q=pondus");
      await checkHasText("pondus");
      await checkHasText("a weight");
    });

    e2eTest()(
      "should allow loading LS entries by new id",
      async (screenSize) => {
        await getPage(screenSize, "/dicts/id/n37007");
        await checkHasText("pondus");
        await checkHasText("a weight");
      }
    );

    e2eTest()("should allow loading SH entries by name", async (screenSize) => {
      await getPage(screenSize, "/dicts?q=habiliment");
      await checkHasText("habiliment");
      await checkHasText("garment");
    });

    e2eTest()(
      "should allow loading SH entries by new id",
      async (screenSize) => {
        await getPage(screenSize, "/dicts/id/sh11673");
        await checkHasText("habiliment");
        await checkHasText("garment");
      }
    );

    e2eTest()("allows queries from the new ID page", async (screenSize) => {
      const page = await getPage(screenSize, "/dicts/id/sh11673");

      await page.click(`[aria-label="Dictionary search box"]`);
      await page.keyboard.type("abagio", { delay: 20 });
      await page.keyboard.press("Enter");

      await waitForText("supposed etymology of adagio");
      await checkTitleIs("abagio | Morcus Latin Tools");
    });

    e2eTest()("allows copying id links via tooltip", async (screenSize) => {
      const page = await getPage(screenSize, "/dicts?q=pondus");

      const button = await findText("pondus", page, "span", "lsSenseBullet");
      await button.click();
      const tooltip = await findText("Copy article link", page);
      await tooltip.click();

      expect(await page.evaluate(() => navigator.clipboard.readText())).toEqual(
        `${global.location.origin}/dicts/id/n37007`
      );
    });

    // // // // //
    // Library  //
    // // // // //

    e2eTest()("shows library options", async (screenSize) => {
      await getPage(screenSize, "/library");

      await awaitAndClickText("Gallico");
      // This assumes that the info tab is the first one shown.
      // This is the editor.
      await waitForText("T. Rice Holmes");
    });

    // // // // //
    // Reader   //
    // // // // //

    e2eTest()("shows works by name and author", async (screenSize) => {
      await getPage(screenSize, "/work/caesar/de_bello_gallico");
      await waitForText("Gallia");
    });

    e2eTest()("shows works by name and author and page", async (screenSize) => {
      await getPage(screenSize, "/work/caesar/de_bello_gallico?pg=3");
      await waitForText("Orgetorix");
    });

    e2eTest()("handles clicky vocab", async (screenSize) => {
      await getPage(screenSize, "/work/caesar/de_bello_gallico");
      await awaitAndClickText("divisa");

      // This is part of the entry for `divido`.
      await waitForText("To force asunder");
    });

    e2eTest()("has working scroll to line", async (screenSize) => {
      const page = await getPage(screenSize, "/work/juvenal/saturae?pg=2");
      const britannos = await waitForText("Britannos");
      expect(await britannos.isIntersectingViewport()).toBe(false);

      await page.click(`[aria-label="Outline"]`);
      await page.click(`[aria-label="jump to section"]`);
      await page.keyboard.type("161");
      await page.keyboard.press("Enter");

      // Usually the scroll takes ~300 ms.
      await awaitVisible(britannos, 2000);
    });

    e2eTest()("reader copy paste across lines", async (screenSize) => {
      const page = await getPage(screenSize, "/work/juvenal/saturae?pg=1");
      const semper = await waitForText("Semper");
      const cordi = await waitForText("Cordi");

      // TODO: Extract this out into a "select" function
      await page.evaluate(
        // @ts-ignore [This causes an issue for type checking if Puppeteer isn't installed]
        (from, to) => {
          // @ts-ignore [This executes in the browser, where `getSelection` exists]
          const selection = from.getRootNode().getSelection();
          const range = document.createRange();
          range.setStartBefore(from);
          range.setEndAfter(to);
          selection.removeAllRanges();
          selection.addRange(range);
        },
        semper,
        cordi
      );
      // TODO: Extract this out into a "copy selection" function
      const copied = await page.evaluate(() => {
        // Copy the selected content to the clipboard
        document.execCommand("copy");
        // Obtain the content of the clipboard as a string
        return navigator.clipboard.readText();
      });
      expect(copied).toBe(
        "Semper ego auditor tantum? numquamne reponam\nvexatus totiens rauci Theseide Cordi"
      );
    });
  });
}
