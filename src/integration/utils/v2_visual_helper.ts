import { test, expect, type Page } from "@playwright/test";

export interface V2VisualScenarioOptions {
  /** Relative URL path to test, e.g. "/dicts" */
  path: string;
  /** Optional selector to wait for before taking the screenshot */
  waitFor?: string;
  /** JavaScript modes to test. Defaults to ["js", "nojs"] */
  jsModes?: ("js" | "nojs")[];
  /** Themes to test. Defaults to ["light"] */
  themes?: ("light" | "dark")[];
  /** Optional selectors of dynamic elements to mask during snapshot */
  mask?: string[];
  /** Optional custom interaction (e.g. opening a drawer or clicking a toggle) before screenshot */
  action?: (page: Page) => Promise<void>;
  /** Optional selector to capture only this specific element instead of the viewport */
  locator?: string;
  /** Optional initial cookies to seed into the browser context before navigation */
  cookies?: {
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
  }[];
}

/**
 * Declares a multi-dimensional visual regression scenario across JS/NoJS and Light/Dark modes.
 * Browser (Chromium / Firefox) and Viewport (Desktop / Mobile) are handled by Playwright projects.
 *
 * Each scenario takes a true viewport shot (`fullPage: false` or element `locator`), showing
 * the page exactly as the user experiences it, with `position: fixed` and `position: sticky`
 * chrome positioned naturally without artificial viewport stretching or scroll drift.
 */
export function v2VisualScenario(
  scenarioName: string,
  options: V2VisualScenarioOptions
) {
  const jsModes = options.jsModes ?? ["js", "nojs"];
  const themes = options.themes ?? ["light"];

  for (const js of jsModes) {
    for (const theme of themes) {
      test(`${scenarioName} [${js}] [${theme}]`, async ({
        browser,
        baseURL,
      }) => {
        const isDark = theme === "dark";
        const context = await browser.newContext({
          javaScriptEnabled: js === "js",
          colorScheme: theme,
        });

        if (options.cookies && options.cookies.length > 0) {
          const defaultUrl = baseURL ?? "http://localhost:5757";
          await context.addCookies(
            options.cookies.map((cookie) => ({
              ...(cookie.url || cookie.domain ? {} : { url: defaultUrl }),
              ...cookie,
            }))
          );
        }

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

          const target = options.locator ? page.locator(options.locator) : page;

          await expect(target).toHaveScreenshot(
            `${scenarioName}-${js}-${theme}.png`,
            {
              fullPage: false,
              animations: "disabled",
              mask: maskLocators,
            }
          );
        } finally {
          await context.close();
        }
      });
    }
  }
}
