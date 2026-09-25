/**
 * @jest-environment jsdom
 */
import { getPageWidth, setPageWidth } from "@/web/v2/core/page_width.client";
import {
  GLOBAL_SETTINGS_KEY,
  parseSettings,
  settingsStore,
} from "@/web/v2/core/settings.client";
import { renderPageWidthSelect } from "@/web/v2/shell/page_width.server";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";
import { renderDictPageHtml } from "@/web/v2/dict/dict_page.server";
import { renderReaderSettingsPopover } from "@/web/v2/reader/reader_dialogs.server";
import "@/web/v2/dict/dict_settings.client";
import "@/web/v2/reader/reader_settings.client";

jest.mock("@/web/v2/v2-critical.css", () => ({}));
jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "",
  getV2CriticalJs: () => "",
}));

const root = document.documentElement;

function resetState() {
  localStorage.clear();
  root.removeAttribute("data-reader-width");
  root.removeAttribute("data-dict-width");
  document.body.innerHTML = "";
}

function saveSettings(settings: object) {
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(settings));
}

async function runCriticalScript() {
  await jest.isolateModulesAsync(async () => {
    await import("@/web/v2/shell/critical_theme.client");
  });
}

function mount(markup: string): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = markup;
  return container;
}

function changeSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(resetState);
afterEach(resetState);

describe("page width settings", () => {
  test("parses valid presets and drops invalid ones", () => {
    expect(
      parseSettings(JSON.stringify({ readerWidth: "wide", dictWidth: "full" }))
    ).toEqual({ readerWidth: "wide", dictWidth: "full" });
    expect(
      parseSettings(
        JSON.stringify({ readerWidth: "default", dictWidth: "huge" })
      )
    ).toEqual({});
  });

  test("getPageWidth defaults to 'default'", () => {
    expect(getPageWidth("reader")).toBe("default");
    saveSettings({ readerWidth: "narrow" });
    expect(getPageWidth("reader")).toBe("narrow");
    expect(getPageWidth("dict")).toBe("default");
  });

  test("setPageWidth applies the attribute and persists", () => {
    saveSettings({ darkMode: true });
    setPageWidth("dict", "wide");
    expect(root.getAttribute("data-dict-width")).toBe("wide");
    expect(settingsStore.get()).toEqual({ darkMode: true, dictWidth: "wide" });
  });

  test("setPageWidth with default or unknown values clears the preset", () => {
    setPageWidth("reader", "full");
    setPageWidth("reader", "default");
    expect(root.hasAttribute("data-reader-width")).toBe(false);
    expect(localStorage.getItem(GLOBAL_SETTINGS_KEY)).toBe("{}");

    setPageWidth("reader", "full");
    setPageWidth("reader", "bogus");
    expect(root.hasAttribute("data-reader-width")).toBe(false);
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });
});

describe("critical script", () => {
  test("applies saved presets before paint", async () => {
    saveSettings({ readerWidth: "narrow", dictWidth: "full" });
    await runCriticalScript();
    expect(root.getAttribute("data-reader-width")).toBe("narrow");
    expect(root.getAttribute("data-dict-width")).toBe("full");
  });

  test("ignores invalid, default, and missing values", async () => {
    saveSettings({ readerWidth: "default", dictWidth: "wide; x" });
    await runCriticalScript();
    expect(root.hasAttribute("data-reader-width")).toBe(false);
    expect(root.hasAttribute("data-dict-width")).toBe(false);

    localStorage.clear();
    await runCriticalScript();
    expect(root.hasAttribute("data-reader-width")).toBe(false);
  });
});

describe("server markup", () => {
  test("select has four presets with Default selected and no name", () => {
    const html = renderPageWidthSelect("x-select", "Label");
    const select = mount(html).querySelector("select")!;
    expect(Array.from(select.options, (o) => o.value)).toEqual([
      "narrow",
      "default",
      "wide",
      "full",
    ]);
    expect(select.value).toBe("default");
    expect(select.hasAttribute("name")).toBe(false);
  });

  test("dictionary search bar renders the row only when requested", () => {
    const base = { query: "", action: "/v2/dicts" };
    expect(renderDictSearchBar(base)).not.toContain("dict-width-select");
    expect(renderDictSearchBar({ ...base, includePageWidth: true })).toContain(
      'id="dict-width-select"'
    );
  });

  test("standalone dictionary page gets body-dict and the control", () => {
    const html = renderDictPageHtml({ query: "" });
    expect(html).toMatch(/<body class="body-dict">/);
    expect(html).toContain('id="dict-width-select"');
  });

  test("embedded dictionary page gets neither", () => {
    const html = renderDictPageHtml({ query: "", embedded: true });
    expect(html).not.toContain("body-dict");
    expect(html).not.toContain("dict-width-select");
    expect(html).not.toContain("page-width-row");
  });
});

describe("dictionary control", () => {
  function mountDictSettings(): HTMLSelectElement {
    const container = mount(
      renderDictSearchBar({
        query: "",
        action: "/v2/dicts",
        includePageWidth: true,
      })
    );
    return container.querySelector<HTMLSelectElement>("#dict-width-select")!;
  }

  test("hydrates from storage", () => {
    saveSettings({ dictWidth: "narrow" });
    expect(mountDictSettings().value).toBe("narrow");
  });

  test("changing the select applies and persists", () => {
    const select = mountDictSettings();
    changeSelect(select, "wide");
    expect(root.getAttribute("data-dict-width")).toBe("wide");
    expect(settingsStore.get().dictWidth).toBe("wide");

    changeSelect(select, "default");
    expect(root.hasAttribute("data-dict-width")).toBe(false);
    expect(settingsStore.get().dictWidth).toBeUndefined();
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
      select: container.querySelector<HTMLSelectElement>(
        "#reader-width-select"
      )!,
      resetBtn: container.querySelector<HTMLButtonElement>(
        "#reader-settings-reset-btn"
      )!,
    };
  }

  test("hydrates from storage and applies changes", () => {
    saveSettings({ readerWidth: "full" });
    const { select } = mountReaderSettings();
    expect(select.value).toBe("full");

    changeSelect(select, "narrow");
    expect(root.getAttribute("data-reader-width")).toBe("narrow");
    expect(settingsStore.get().readerWidth).toBe("narrow");
  });

  test("Reset Defaults clears the width", () => {
    const { select, resetBtn } = mountReaderSettings();
    changeSelect(select, "wide");
    resetBtn.click();
    expect(select.value).toBe("default");
    expect(root.hasAttribute("data-reader-width")).toBe(false);
    expect(settingsStore.get().readerWidth).toBeUndefined();
  });

  test("does not touch the dictionary preset", () => {
    saveSettings({ dictWidth: "wide" });
    const { select } = mountReaderSettings();
    changeSelect(select, "narrow");
    expect(settingsStore.get().dictWidth).toBe("wide");
  });
});
