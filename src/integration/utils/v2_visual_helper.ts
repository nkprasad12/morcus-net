import { test, expect, type Page } from "@playwright/test";

export interface V2VisualScenarioOptions {
  /** Relative URL path to test, e.g. "/v2/dicts" */
  path: string;
  /** Optional selector to wait for before taking the screenshot */
  waitFor?: string;
  /** JavaScript modes to test. Defaults to ["js", "nojs"] */
  jsModes?: ("js" | "nojs")[];
  /** Themes to test. Defaults to ["light", "dark"] */
  themes?: ("light" | "dark")[];
  /** Optional selectors of dynamic elements to mask during snapshot */
  mask?: string[];
  /** Optional custom interaction (e.g. opening a drawer or clicking a toggle) before screenshot */
  action?: (page: Page) => Promise<void>;
}

/**
 * How many viewports tall the coverage shot may be.
 *
 * Uncapped whole-page shots do not pay for themselves. `/v2/library` renders
 * 29135px tall on mobile; no reviewer reads an image that size, so when it
 * diffs the only realistic response is to re-record it, and a baseline that is
 * always rubber-stamped detects nothing. Three screens is the point where a
 * human can still scan the image top to bottom, and it covers the part of the
 * page a reader plausibly reaches. Below that, content on these pages is
 * repetitive — the 400th item in the library grid tells you nothing the 3rd
 * did not.
 */
const COVERAGE_VIEWPORTS = 3;

/**
 * The region the coverage shot captures: the top `COVERAGE_VIEWPORTS` screens.
 *
 * Playwright intersects `clip` with the document rect, so pages shorter than
 * the cap are captured whole rather than erroring or being padded.
 */
function coverageClip(page: Page) {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("Visual scenarios require a fixed viewport size.");
  }
  return {
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height * COVERAGE_VIEWPORTS,
  };
}

/**
 * Holds the page at the scroll offset it settled on, for the duration of the
 * screenshot assertion.
 *
 * A `fullPage` capture briefly resizes the viewport, and on `isMobile`
 * contexts Chromium does not put the scroll offset back afterwards: on
 * /v2/dicts?q=gladius it walks 162 -> 213 -> 263 -> 312 with every capture.
 * Each offset paints `position: fixed` chrome somewhere new, so consecutive
 * captures never match and `toHaveScreenshot` fails with "Failed to take two
 * consecutive stable screenshots" — its own stability loop re-captures without
 * restoring scroll, so it drives the very drift it is waiting out.
 *
 * Locking the offset inside the page fixes that at the source: every capture
 * then starts from the same place, and `toHaveScreenshot` converges normally.
 * The lock does not stop the drift *during* a capture, so fixed chrome still
 * lands about 50px below where a user would see it; what it buys is a baseline
 * that is a function of the page rather than of capture order.
 *
 * Only applied to JS runs. No-JS pages never scroll, so they do not drift, and
 * `page.evaluate` would throw in a context with JavaScript disabled anyway.
 */
async function lockScrollPosition(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window.scrollY;
    const restore = () => {
      if (window.scrollY !== target) {
        window.scrollTo({ top: target, left: 0, behavior: "instant" });
      }
    };
    window.addEventListener("scroll", restore, { passive: true });
    window.addEventListener("resize", restore, { passive: true });
  });
}

/**
 * Declares a multi-dimensional visual regression scenario across JS/NoJS and Light/Dark modes.
 * Browser (Chromium / Firefox) and Viewport (Desktop / Mobile) are handled by Playwright projects.
 *
 * Each scenario takes two kinds of shot:
 *
 * - A **viewport** shot, `<scenario>-<js>-<theme>.png`, over the whole matrix.
 *   This is the primary baseline: it is the only one that shows the page as a
 *   user actually meets it, with `position: fixed` chrome where they see it.
 * - A **coverage** shot, `<scenario>-coverage.png`, capped at
 *   `COVERAGE_VIEWPORTS` screens, recorded once per browser project rather
 *   than once per js/theme combination. It exists to catch regressions below
 *   the fold, which the viewport shot structurally cannot see.
 *
 * The coverage shot is taken in the js/light combination because that is the
 * richest DOM: client enhancements have run, so it is a superset of what the
 * no-JS render produces. The tradeoff this scheme accepts is that a
 * dark-mode-only colour regression *below the fold* will not be caught.
 */
export function v2VisualScenario(
  scenarioName: string,
  options: V2VisualScenarioOptions
) {
  const jsModes = options.jsModes ?? ["js", "nojs"];
  const themes = options.themes ?? ["light", "dark"];

  for (const js of jsModes) {
    for (const theme of themes) {
      test(`${scenarioName} [${js}] [${theme}]`, async ({ browser }) => {
        const isDark = theme === "dark";
        const context = await browser.newContext({
          javaScriptEnabled: js === "js",
          colorScheme: theme,
        });

        const page = await context.newPage();

        if (js === "js") {
          await page.addInitScript((dark) => {
            try {
              localStorage.setItem(
                "GlobalSettings",
                JSON.stringify({ darkMode: dark })
              );
            } catch {}
            document.documentElement.setAttribute(
              "data-theme",
              dark ? "dark" : "light"
            );
          }, isDark);
        }

        try {
          await page.goto(options.path);
          if (options.waitFor) {
            await page.waitForSelector(options.waitFor, { state: "visible" });
          }
          if (options.action) {
            await options.action(page);
          }

          const maskLocators = options.mask
            ? options.mask.map((selector) => page.locator(selector))
            : undefined;

          if (js === "js") {
            await lockScrollPosition(page);
          }

          // First, because the coverage shot below perturbs the scroll offset.
          await expect(page).toHaveScreenshot(
            `${scenarioName}-${js}-${theme}.png`,
            {
              fullPage: false,
              animations: "disabled",
              mask: maskLocators,
            }
          );

          if (js === "js" && theme === "light") {
            await expect(page).toHaveScreenshot(
              `${scenarioName}-coverage.png`,
              {
                fullPage: true,
                clip: coverageClip(page),
                animations: "disabled",
                mask: maskLocators,
              }
            );
          }
        } finally {
          await context.close();
        }
      });
    }
  }
}
