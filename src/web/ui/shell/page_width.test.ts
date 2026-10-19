/**
 * @jest-environment jsdom
 */
import {
  getSurfaceWidth,
  resolveSurfaceWidth,
  setSurfaceWidth,
  syncSurfaceWidth,
  WIDTH_SURFACES,
} from "@/web/ui/core/widgets/page_width.client";
import {
  GLOBAL_SETTINGS_KEY,
  parseSettings,
  settingsStore,
} from "@/web/ui/core/state/settings.client";
import { renderPageWidthHandles } from "@/web/ui/shell/page_width.server";
import { renderPageShell } from "@/web/ui/shell/page_shell.server";
import { renderDictSearchBar } from "@/web/ui/dict/search/search_bar.server";
import { renderDictPageHtml } from "@/web/ui/dict/dict_page.server";
import { renderReaderSettingsPopover } from "@/web/ui/reader/reader_dialogs.server";
import "@/web/ui/reader/reader_settings.client";

jest.mock("@/web/ui/critical.css", () => ({}));
jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "",
  getV2CriticalJs: () => "",
}));

const root = document.documentElement;

function resetState() {
  localStorage.clear();
  root.removeAttribute("style");
  document.body.innerHTML = "";
}

function saveSettings(settings: object) {
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(settings));
}

async function runCriticalScript() {
  await jest.isolateModulesAsync(async () => {
    await import("@/web/ui/shell/critical_theme.client");
  });
}

function mount(markup: string): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = markup;
  return container;
}

beforeEach(resetState);
afterEach(resetState);

describe("page width settings", () => {
  test("parses valid widths and drops invalid ones", () => {
    expect(
      parseSettings(
        JSON.stringify({
          readerWidth: 1234,
          libraryWidth: "full",
          dictWidth: "full",
        })
      )
    ).toEqual({ readerWidth: 1234, libraryWidth: "full", dictWidth: "full" });
    expect(
      parseSettings(
        JSON.stringify({
          readerWidth: "wide",
          corpusWidth: -5,
          libraryWidth: "default",
          dictWidth: "huge",
        })
      )
    ).toEqual({});
  });

  test("getSurfaceWidth is undefined by default", () => {
    expect(getSurfaceWidth("reader")).toBeUndefined();
    saveSettings({ readerWidth: 1100 });
    expect(getSurfaceWidth("reader")).toBe(1100);
    expect(getSurfaceWidth("library")).toBeUndefined();
  });

  test("setSurfaceWidth applies the custom property and persists", () => {
    saveSettings({ darkMode: true });
    setSurfaceWidth("reader", 1234);
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("1234px");
    expect(settingsStore.get()).toEqual({ darkMode: true, readerWidth: 1234 });

    setSurfaceWidth("corpus", "full");
    expect(root.style.getPropertyValue("--corpus-page-max")).toBe("100vw");
    expect(settingsStore.get().corpusWidth).toBe("full");
  });

  test("setSurfaceWidth with the default or undefined clears it", () => {
    setSurfaceWidth("reader", 1100);
    setSurfaceWidth("reader", WIDTH_SURFACES.reader.def);
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
    expect(localStorage.getItem(GLOBAL_SETTINGS_KEY)).toBe("{}");

    setSurfaceWidth("reader", "full");
    setSurfaceWidth("reader", undefined);
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });

  test("the dictionary is a dragged surface too", () => {
    setSurfaceWidth("dict", 1140);
    expect(root.style.getPropertyValue("--dict-page-max")).toBe("1140px");
    expect(settingsStore.get().dictWidth).toBe(1140);
    setSurfaceWidth("dict", WIDTH_SURFACES.dict.def);
    expect(settingsStore.get().dictWidth).toBeUndefined();
    expect(parseSettings(JSON.stringify({ dictWidth: "wide" }))).toEqual({});
  });
});

describe("resolveSurfaceWidth", () => {
  const reader = WIDTH_SURFACES.reader;

  test("clamps to the minimum", () => {
    expect(resolveSurfaceWidth(100, reader, 2000)).toBe(reader.min);
  });

  test("returns full at (or near) the viewport width", () => {
    expect(resolveSurfaceWidth(5000, reader, 2000)).toBe("full");
    expect(resolveSurfaceWidth(1985, reader, 2000)).toBe("full");
    expect(resolveSurfaceWidth(1975, reader, 2000)).toBe(1975);
  });

  test("snaps to presets within 20px", () => {
    expect(resolveSurfaceWidth(1415, reader, 2000)).toBe(1400);
    expect(resolveSurfaceWidth(1085, reader, 2000)).toBe(1100);
    expect(resolveSurfaceWidth(1425, reader, 2000)).toBe(1425);
  });

  test("never snaps to a preset wider than the viewport", () => {
    // 1680 is within 20px of 1670 but not narrower than max, so: full.
    expect(resolveSurfaceWidth(1670, reader, 1680)).toBe("full");
  });
});

describe("pre-paint", () => {
  test("a saved width is applied by the critical script on the next load", async () => {
    setSurfaceWidth("reader", 1234);
    setSurfaceWidth("library", "full");
    setSurfaceWidth("dict", "full");
    // Next load: <html> starts bare.
    root.removeAttribute("style");
    await runCriticalScript();
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("1234px");
    expect(root.style.getPropertyValue("--library-page-max")).toBe("100vw");
    expect(root.style.getPropertyValue("--dict-page-max")).toBe("100vw");
  });

  test("clearing a width clears it from pre-paint", async () => {
    setSurfaceWidth("reader", 1500);
    setSurfaceWidth("reader", undefined);
    root.removeAttribute("style");
    await runCriticalScript();
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("");
  });

  test("sync heals a stale snapshot from GlobalSettings", async () => {
    setSurfaceWidth("reader", 1500);
    setSurfaceWidth("dict", 1140);
    saveSettings({ readerWidth: 900, dictWidth: 760 });
    syncSurfaceWidth("reader");
    syncSurfaceWidth("dict");
    root.removeAttribute("style");
    await runCriticalScript();
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("900px");
    expect(root.style.getPropertyValue("--dict-page-max")).toBe("760px");
  });
});

describe("server markup", () => {
  test("dictionary search bar has no page width select", () => {
    const html = renderDictSearchBar({ query: "", action: "/dicts" });
    expect(html).not.toContain("dict-width-select");
    expect(html).not.toContain("page-width-row");
  });

  test("standalone dictionary page gets body-dict and handles", () => {
    const html = renderDictPageHtml({ query: "" });
    expect(html).toMatch(/<body class="body-dict">/);
    expect(html).toContain('data-surface="dict"');
  });

  test("handles are JS-only separators with default ARIA values", () => {
    const el = mount(renderPageWidthHandles("reader")).querySelector(
      "morcus-page-width"
    )!;
    expect(el.hasAttribute("data-js-only")).toBe(true);
    expect(el.getAttribute("data-surface")).toBe("reader");
    const handles = el.querySelectorAll(".page-handle");
    expect(Array.from(handles, (h) => h.getAttribute("data-side"))).toEqual([
      "left",
      "right",
    ]);
    for (const h of Array.from(handles)) {
      expect(h.getAttribute("role")).toBe("separator");
      expect(h.getAttribute("aria-valuemin")).toBe("720");
      expect(h.getAttribute("aria-valuenow")).toBe("1400");
    }
  });

  test("only pages with a width surface get handles", () => {
    const base = {
      title: "T",
      activePage: "library" as const,
      contentHtml: "",
    };
    expect(renderPageShell(base)).not.toContain("morcus-page-width");
    const library = renderPageShell({ ...base, widthSurface: "library" });
    expect(library).toContain('data-surface="library"');
    expect(library).toMatch(/<body class="body-library">/);
    const reader = renderPageShell({
      ...base,
      isReader: true,
      widthSurface: "reader",
    });
    expect(reader).toMatch(/<body class="body-reader">/);
    expect(reader).toContain('data-surface="reader"');
    const embedded = renderPageShell({
      ...base,
      hideAppBar: true,
      widthSurface: "corpus",
    });
    expect(embedded).not.toContain("morcus-page-width");
  });

  test("embedded dictionary page gets neither", () => {
    const html = renderDictPageHtml({ query: "", embedded: true });
    expect(html).not.toContain("body-dict");
    expect(html).not.toContain("morcus-page-width");
  });
});

describe("reader control", () => {
  function mountReaderSettings() {
    const container = mount(`
      <button type="button" id="reader-settings-btn">Settings</button>
      <div id="reader-settings-backdrop" hidden></div>
      ${renderReaderSettingsPopover()}
    `);
    return {
      container,
      resetBtn: container.querySelector<HTMLButtonElement>(
        "#reader-settings-reset-btn"
      )!,
    };
  }

  test("the Appearance popover has no page width select", () => {
    const { container } = mountReaderSettings();
    expect(container.querySelector("select#reader-width-select")).toBeNull();
    expect(container.querySelector(".page-width-row")).toBeNull();
  });

  test("Reset Defaults leaves the page widths alone", () => {
    setSurfaceWidth("reader", 1100);
    setSurfaceWidth("dict", 1140);
    const { resetBtn } = mountReaderSettings();
    resetBtn.click();
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("1100px");
    expect(settingsStore.get().readerWidth).toBe(1100);
    expect(settingsStore.get().dictWidth).toBe(1140);
  });
});
