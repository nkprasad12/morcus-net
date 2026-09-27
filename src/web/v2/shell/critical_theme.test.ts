/**
 * @jest-environment jsdom
 */
import { READER_SETTINGS_KEY } from "@/web/v2/reader/reader_settings.client";
import { READER_DICT_WIDTH_STORAGE_KEY } from "@/web/v2/reader/reader_layout.client";

jest.mock("@/web/v2/v2-critical.css", () => ({}));

const root = document.documentElement;

function resetState() {
  localStorage.clear();
  root.removeAttribute("style");
  root.removeAttribute("data-reader-hide-gutter");
}

async function runCriticalScript() {
  await jest.isolateModulesAsync(async () => {
    await import("@/web/v2/shell/critical_theme.client");
  });
}

beforeEach(resetState);
afterEach(resetState);

// PRE_HYDRATION.md PH11: layout-affecting reader prefs must land before paint.
describe("critical_theme reader preferences", () => {
  test("mirrors saved reader typography onto :root", async () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({
        readerScale: 125,
        fontFamily: "sans",
        lineHeight: "relaxed",
        showGutter: false,
      })
    );

    await runCriticalScript();

    expect(root.style.getPropertyValue("--reader-scale")).toBe("1.25");
    expect(root.style.getPropertyValue("--reader-font")).toBe(
      "var(--font-sans)"
    );
    expect(root.style.getPropertyValue("--reader-line-height")).toBe("1.85");
    expect(root.hasAttribute("data-reader-hide-gutter")).toBe(true);
  });

  test("leaves defaults to the CSS fallbacks", async () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({
        fontFamily: "serif",
        lineHeight: "normal",
        showGutter: true,
      })
    );

    await runCriticalScript();

    expect(root.style.getPropertyValue("--reader-font")).toBe("");
    expect(root.style.getPropertyValue("--reader-line-height")).toBe("");
    expect(root.hasAttribute("data-reader-hide-gutter")).toBe(false);
  });

  test("mirrors a valid saved splitter width and ignores invalid ones", async () => {
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "512");
    await runCriticalScript();
    expect(root.style.getPropertyValue("--dict-width")).toBe("512px");

    resetState();
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "120");
    await runCriticalScript();
    expect(root.style.getPropertyValue("--dict-width")).toBe("");

    resetState();
    localStorage.setItem(READER_DICT_WIDTH_STORAGE_KEY, "garbage");
    await runCriticalScript();
    expect(root.style.getPropertyValue("--dict-width")).toBe("");
  });

  test("tolerates corrupt reader settings", async () => {
    localStorage.setItem(READER_SETTINGS_KEY, "{not json");
    await expect(runCriticalScript()).resolves.toBeUndefined();
    expect(root.getAttribute("style") ?? "").toBe("");
  });
});
