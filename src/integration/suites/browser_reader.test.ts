import { test, expect, type Page } from "@playwright/test";
import { disableSmoothScroll } from "@/integration/utils/playwright_utils";

/**
 * Library and reader browser E2E journeys. Each test drives a real
 * browser because the behaviour depends on something jsdom cannot show:
 * persistence across full navigations, real history, layout and scrolling,
 * or the clipboard.
 */

const DBG = "/work/caesar/de_bello_gallico";
const JUVENAL = "/work/juvenal/saturae";

/**
 * A library card, by work id: its href changes once the work has a saved
 * spot, so it can't be the selector.
 */
const workCard = (page: Page, workId: string) =>
  page.locator(`a.work-card[data-work-id="${workId}"]`);
const DBG_ID = "phi0448.phi001.perseus-lat2";
const JUVENAL_ID = "phi1276.phi001.perseus-lat2";

const passage = (page: Page) => page.locator("#reader-passage");

/** Opens the table-of-contents drawer from the sticky bar. */
async function openToc(page: Page): Promise<void> {
  await page.locator("#reader-toc-btn").click();
  await expect(page.locator("#reader-toc-search-input")).toBeVisible();
}

test.describe("UI V2 library", () => {
  test("filtering narrows the cards, and a card opens the reader", async ({
    page,
  }) => {
    await page.goto("/library");
    const dbgCard = workCard(page, DBG_ID);
    const juvenalCard = workCard(page, JUVENAL_ID);
    await expect(dbgCard).toHaveAttribute("href", DBG);
    await expect(juvenalCard).toHaveAttribute("href", JUVENAL);
    await expect(dbgCard).toBeVisible();
    await expect(juvenalCard).toBeVisible();

    await page.locator("#library-search-input").fill("caesar gallico");
    await expect(juvenalCard).toBeHidden();
    await expect(dbgCard).toBeVisible();

    await dbgCard.click();
    await expect(page).toHaveURL(new RegExp(`${DBG}(/1\\.1)?$`));
    await expect(passage(page)).toContainText("Gallia est omnis divisa");
  });
});

test.describe("UI V2 reader", () => {
  test("restores the saved spot from the library after a page turn and a TOC jump", async ({
    page,
  }) => {
    await page.goto(DBG);
    await expect(passage(page)).toContainText("Gallia est omnis");

    // Page turn with the pager arrow.
    await page.locator("#pager-next").click();
    await expect(passage(page)).toContainText("Orgetorix");

    await page.goto("/library");
    await workCard(page, DBG_ID).click();
    await expect(passage(page)).toContainText("Orgetorix");

    // Quick navigation through a TOC link. Chapter 90 exists only in Book 7.
    await openToc(page);
    await page
      .locator(".reader-toc-summary", { hasText: "Book 7" })
      .first()
      .click();
    await page.locator(`a.reader-toc-item[data-page-id="7.90"]`).click();
    await expect(passage(page)).toContainText("Aeduos");

    await page.goto("/library");
    await workCard(page, DBG_ID).click();
    await expect(passage(page)).toContainText("Aeduos");
  });

  test("opening a work without a section, or by legacy ?id=, keeps Back on the library", async ({
    page,
  }) => {
    await page.goto("/library");

    await page.goto(DBG);
    await expect(passage(page)).toContainText("Gallia est omnis");
    await page.goBack();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.locator("#library-search-input")).toBeVisible();

    // The legacy V1 form redirects server-side, so it adds no history entry.
    await page.goto(`${DBG}?id=1.3`);
    await expect(page).toHaveURL(new RegExp(`${DBG}/1\\.3$`));
    await expect(passage(page)).toContainText("Orgetorix");
    await page.goBack();
    await expect(page).toHaveURL(/\/library$/);
  });

  test("a line deep link scrolls the line into view", async ({ page }) => {
    await page.goto(`${JUVENAL}?id=1.2.161`);
    await expect(page).toHaveURL(
      new RegExp(`${JUVENAL}/1\\.2#sec-1\\.2\\.161$`)
    );
    await expect(passage(page).getByText("Britannos")).toBeInViewport();
  });

  test("the TOC jump field goes to a line on the current page", async ({
    page,
  }) => {
    await page.goto(`${JUVENAL}/1.2`);
    await disableSmoothScroll(page);
    const line = passage(page).getByText("Britannos");
    await expect(line).toBeVisible();
    await expect(line).not.toBeInViewport();

    await openToc(page);
    await page.locator("#reader-toc-search-input").fill("1.2.161");
    await page.keyboard.press("Enter");

    // A jump within the current page scrolls in place and closes the TOC;
    // like the gutter anchors, it leaves the URL alone (`reader_view.client`).
    await expect(page.locator("#reader-toc-search-input")).toBeHidden();
    await expect(line).toBeInViewport();
    await expect(page).toHaveURL(new RegExp(`${JUVENAL}/1\\.2$`));
  });

  test("the TOC jump field works without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${DBG}/1.1`);
    // Without JS the drawer opens via its `:target` link.
    await page.locator("#reader-toc-btn").click();
    const input = page.locator("#reader-toc-search-input");
    await expect(input).toBeVisible();
    await input.fill("7.90");
    await input.press("Enter");

    await expect(page).toHaveURL(new RegExp(`${DBG}/7\\.90`));
    await expect(passage(page)).toContainText("Aeduos");
    await context.close();
  });

  test("translations load on demand and follow page turns", async ({
    page,
  }) => {
    await page.goto("/work/sallust/catalina1/1");
    await page.locator("#panel-tab-translation").click();
    const translation = page.locator("#panel-view-translation");
    await expect(translation).toContainText("government");

    await page.locator("#pager-next").click();
    await expect(translation).toContainText("Cyrus");
  });

  test("clicking a word in the passage shows its dictionary entry", async ({
    page,
  }) => {
    await page.goto(`${DBG}/1.1`);
    await disableSmoothScroll(page);
    const initialHistoryLength = await page.evaluate(() => history.length);

    await passage(page)
      .locator(".lat-word", { hasText: /^divisa$/ })
      .first()
      .click();

    await expect(page.locator("aside.reader-dict-panel")).not.toHaveClass(
      /\bdrawer-minimized\b/
    );
    // Part of the Lewis & Short entry for `divido`.
    await expect(
      page.frameLocator("#dict-frame").getByText("To force asunder", {
        exact: true,
      })
    ).toBeVisible();

    // Word lookups replace the iframe entry in-place without pushing ?q= or history entries.
    await expect(page).toHaveURL(new RegExp(`${DBG}/1\\.1$`));
    expect(await page.evaluate(() => history.length)).toBe(
      initialHistoryLength
    );
  });

  test("second and repeat passage word clicks swap dictionary results in place without reloading the iframe document", async ({
    page,
  }) => {
    await page.goto(`${DBG}/1.1`);
    await disableSmoothScroll(page);
    const initialHistoryLength = await page.evaluate(() => history.length);
    const frame = page.frameLocator("#dict-frame");

    // 1. Click word A ("divisa") -> initial document load in #dict-frame.
    await passage(page)
      .locator(".lat-word", { hasText: /^divisa$/ })
      .first()
      .click();
    await expect(
      frame.getByText("To force asunder", { exact: true })
    ).toBeVisible();
    await expect(
      frame.locator("morcus-dict-search[data-upgraded]")
    ).toBeAttached();

    const dictDocRequests: string[] = [];
    const dictAllRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/dicts")) {
        dictAllRequests.push(req.url());
        if (req.resourceType() === "document") {
          dictDocRequests.push(req.url());
        }
      }
    });

    // 2. Click word B ("omnis") -> in-place partial swap, no document request in frame.
    await passage(page)
      .locator(".lat-word", { hasText: /^omnis$/ })
      .first()
      .click();
    await expect(frame.locator("#dict-q")).toHaveValue("omnis");
    await expect(frame.locator("#dict-results")).toContainText("omnis");
    expect(dictDocRequests).toEqual([]);
    expect(
      dictAllRequests.some(
        (u) => u.includes("q=omnis") && u.includes("format=partial")
      )
    ).toBe(true);
    expect(await page.evaluate(() => history.length)).toBe(
      initialHistoryLength
    );

    // 3. Re-click word B ("omnis"), then click word C ("partes") to flush the request pipeline:
    // the only new /dicts request must be C's partial fetch (none for the re-click on B).
    dictAllRequests.length = 0;
    await passage(page)
      .locator(".lat-word", { hasText: /^omnis$/ })
      .first()
      .click();
    await passage(page)
      .locator(".lat-word", { hasText: /^partes$/ })
      .first()
      .click();
    await expect(frame.locator("#dict-q")).toHaveValue("partes");
    await expect(frame.locator("#dict-results")).toContainText("pars");
    expect(dictDocRequests).toEqual([]);
    expect(dictAllRequests.some((u) => u.includes("q=omnis"))).toBe(false);
    expect(
      dictAllRequests.some(
        (u) => u.includes("q=partes") && u.includes("format=partial")
      )
    ).toBe(true);
  });

  test("typing an English search in the iframe leaves lang=La, and the next passage word click reloads the frame back to lang=La", async ({
    page,
  }) => {
    await page.goto(`${DBG}/1.1`);
    await disableSmoothScroll(page);
    const frame = page.frameLocator("#dict-frame");

    await passage(page)
      .locator(".lat-word", { hasText: /^divisa$/ })
      .first()
      .click();
    await expect(
      frame.getByText("To force asunder", { exact: true })
    ).toBeVisible();
    await expect(
      frame.locator("morcus-dict-search[data-upgraded]")
    ).toBeAttached();

    // Type an English word in the iframe and submit -> leaves lang=La scope.
    const dictInput = frame.locator("#dict-q");
    await dictInput.fill("love");
    await dictInput.press("Enter");
    await expect(frame.locator("#dict-results")).toContainText("love");
    await expect(
      frame.locator("morcus-dict-search[data-upgraded]")
    ).toBeAttached();

    const dictDocRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/dicts") && req.resourceType() === "document") {
        dictDocRequests.push(req.url());
      }
    });

    // Click passage word C ("partes") -> declines in-place swap and does a full navigation back to lang=La.
    await passage(page)
      .locator(".lat-word", { hasText: /^partes$/ })
      .first()
      .click();
    await expect(frame.locator("#dict-q")).toHaveValue("partes");
    await expect(frame.locator("#dict-results")).toContainText("pars");
    expect(
      dictDocRequests.some(
        (u) => u.includes("q=partes") && u.includes("lang=La")
      )
    ).toBe(true);
  });

  test("clicking a passage word while autocomplete is open in the iframe closes the autocomplete list", async ({
    page,
  }) => {
    await page.goto(`${DBG}/1.1`);
    await disableSmoothScroll(page);
    const frame = page.frameLocator("#dict-frame");

    await passage(page)
      .locator(".lat-word", { hasText: /^divisa$/ })
      .first()
      .click();
    await expect(
      frame.getByText("To force asunder", { exact: true })
    ).toBeVisible();
    await expect(
      frame.locator("morcus-dict-search[data-upgraded]")
    ).toBeAttached();

    const dictInput = frame.locator("#dict-q");
    await dictInput.click();
    await dictInput.fill("");
    await page.keyboard.type("can", { delay: 30 });
    const listbox = frame.locator("#dict-suggestions-list");
    await expect(listbox).toBeVisible();

    await passage(page)
      .locator(".lat-word", { hasText: /^omnis$/ })
      .first()
      .click();
    await expect(listbox).toBeHidden();
    await expect(dictInput).toHaveValue("omnis");
  });

  test("defers the embedded dictionary iframe on JS load and arms it on '/'", async ({
    page,
    viewport,
  }) => {
    const dictRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/dicts")) {
        dictRequests.push(req.url());
      }
    });

    await page.goto(`${DBG}/1.1`);

    if ((viewport?.width ?? 1280) > 640) {
      await expect(page.locator(".reader-dict-landing")).toBeVisible();
    }
    expect(dictRequests).toEqual([]);

    await page.keyboard.press("/");
    const frame = page.frameLocator("#dict-frame");
    await expect(frame.locator('input[name="q"]')).toBeVisible();
    expect(dictRequests.some((u) => u.includes("/dicts?embedded=1"))).toBe(
      true
    );
  });

  test("copying across verse lines gives one line per verse", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Only Chromium lets the page read the clipboard back."
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`${JUVENAL}/1.1`);
    const first = passage(page).locator("#sec-1\\.1\\.1 .reader-line");
    const second = passage(page).locator("#sec-1\\.1\\.2 .reader-line");
    await expect(first).toContainText("Semper ego auditor");

    const copied = await page.evaluate(
      async ([from, to]) => {
        const range = document.createRange();
        range.setStartBefore(from!);
        range.setEndAfter(to!);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("copy");
        return navigator.clipboard.readText();
      },
      [await first.elementHandle(), await second.elementHandle()]
    );
    expect(copied.trim()).toBe(
      "Semper ego auditor tantum? numquamne reponam\n" +
        "vexatus totiens rauci Theseide Cordi?"
    );
  });

  test("verse gutter numbers show 1 and every 5th line, and elide prefixes on mobile", async ({
    page,
  }) => {
    await page.goto(`${JUVENAL}/1.1`);
    const line1Anchor = passage(page).locator(
      "#sec-1\\.1\\.1 a.section-anchor"
    );
    const line2Anchor = passage(page).locator(
      "#sec-1\\.1\\.2 a.section-anchor"
    );
    const line5Anchor = passage(page).locator(
      "#sec-1\\.1\\.5 a.section-anchor"
    );

    await expect(line1Anchor).not.toHaveClass(/\blatent\b/);
    await expect(line2Anchor).toHaveClass(/\blatent\b/);
    await expect(line5Anchor).not.toHaveClass(/\blatent\b/);

    expect(
      await line2Anchor.evaluate((el) => getComputedStyle(el).opacity)
    ).toBe("0");

    const isMobile = (page.viewportSize()?.width ?? 1280) <= 640;
    const prefixPosition = await line1Anchor
      .locator(".cite-prefix")
      .evaluate((el) => getComputedStyle(el).position);
    expect(prefixPosition).toBe(isMobile ? "absolute" : "static");
    await expect(line1Anchor.locator(".cite-local")).toHaveText("1");
    await expect(
      passage(page).getByRole("link", { name: /^1\.1\.\s*1$/ })
    ).toBeAttached();
  });

  test("section anchor opens action menu and pre-fills clean verse text in editor", async ({
    page,
  }) => {
    await page.goto(`${JUVENAL}/1.1`);
    const anchor = passage(page).locator("#sec-1\\.1\\.1 a.section-anchor");
    await anchor.scrollIntoViewIfNeeded();
    await anchor.click();

    const menu = page.locator(".section-action-menu");
    await expect(menu).toBeVisible();
    await menu.locator('[data-action="edit"]').click();

    const textarea = passage(page).locator(
      "#sec-1\\.1\\.1 textarea.section-edit-input"
    );
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(
      "Semper ego auditor tantum? numquamne reponam"
    );
  });

  test("matchText highlights target word range in section and scrolls it into view", async ({
    page,
  }) => {
    await page.goto(`${JUVENAL}/1.2?matchText=1.2.161~0~2`);
    const matches = passage(page).locator(
      "#sec-1\\.2\\.161 .lat-word.reader-match"
    );
    await expect(matches).toHaveCount(2);
    await expect(matches.first()).toBeInViewport();
  });

  test("opening Appearance from the reader settings keeps the scroll position and opens on screen", async ({
    page,
  }, testInfo) => {
    // On phones the app bar isn't sticky, so at the bottom of the page the
    // Appearance button is far above the viewport.
    test.skip(!testInfo.project.use.isMobile, "Mobile-only layout");
    await page.goto(`${DBG}/1.1`);
    await disableSmoothScroll(page);
    await expect(passage(page)).toBeVisible();
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      })
    );
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    await page.locator("#reader-settings-btn").click();
    await expect(page.locator("#reader-settings-popover")).toBeVisible();
    await page.locator("#reader-appearance-link").click();

    const menu = page.locator("#appearance-popover");
    await expect(menu).toBeVisible();
    await expect(menu).toBeInViewport();
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  });
});

test.describe("UI V2 dictionary autocomplete", () => {
  test("arrow keys pick a suggestion and Enter searches it", async ({
    page,
  }) => {
    await page.goto("/dicts");
    const input = page.locator("#dict-q");
    await input.click();
    await page.keyboard.type("can", { delay: 30 });

    const target = page.locator(".suggestion-item", { hasText: "cānăba" });
    await expect(target).toBeVisible();
    // Arrow down until the suggestion is the active option.
    const count = await page.locator(".suggestion-item").count();
    for (let i = 0; i < count; i++) {
      await page.keyboard.press("ArrowDown");
      if ((await target.getAttribute("aria-selected")) === "true") break;
    }
    await expect(target).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/dicts\?q=c%C4%81n%C4%83ba/);
    await expect(page.getByText("a hovel, hut").first()).toBeVisible();
  });
});
