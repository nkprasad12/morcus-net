import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.REUSE_DEV_SERVER ? process.env.PORT : "1337";
if (PORT === undefined) {
  throw new Error(`$PORT must be set when reusing the dev server.`);
}
const BASE_URL = `http://localhost:${PORT}`;

process.env.BASE_URL = BASE_URL;
const MOBILE_TEMPLATE = devices["Pixel 5"];
const FUNCTIONAL_CI = process.env.CI && !process.env.PERF_TEST;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./src/integration",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: FUNCTIONAL_CI ? 1 : 0,
  /* Github Actions uses runners with 4 CPUs, so try using default parallelism. */
  // workers: process.env.CI ? 4 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["html"], FUNCTIONAL_CI ? ["github"] : ["line"]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  globalSetup: require.resolve(
    "@/integration/utils/playwright_global.setup.ts"
  ),

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Test against mobile viewports. */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Firefox Small Screen",
      use: {
        ...MOBILE_TEMPLATE,
        isMobile: false,
        defaultBrowserType: "firefox",
      },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],
});
