/**
 * @jest-environment jsdom
 */
import "@/web/ui/shell/theme_toggle.client";
import {
  PREPAINT_KEY,
  settingsStore,
  syncIframeTheme,
} from "@/web/ui/core/index.client";
import { renderAppBar } from "@/web/ui/shell/page_shell.server";
import { THEME_COLOR } from "@/web/ui/shell/theme_color.common";

function prepaintSnapshot(): Record<string, string> {
  return JSON.parse(localStorage.getItem(PREPAINT_KEY) ?? "{}");
}

function mountThemeToggle(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderAppBar("dicts");
  const el = wrapper.querySelector<HTMLElement>("morcus-theme-toggle")!;
  document.body.appendChild(el);
  return el;
}

describe("MorcusThemeToggle", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = "";
  });

  test("toggles theme and persists to settingsStore", () => {
    const el = mountThemeToggle();

    const button = el.querySelector<HTMLButtonElement>("button")!;
    expect(button).not.toBeNull();

    // Default: light mode (unless prefers-color-scheme)
    button.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(settingsStore.get().darkMode).toBe(true);

    button.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(settingsStore.get().darkMode).toBe(false);
  });

  test("records the theme in the pre-paint snapshot on toggle", () => {
    const button = mountThemeToggle().querySelector("button")!;

    button.click();
    expect(prepaintSnapshot()["data-theme"]).toBe("dark");
    button.click();
    expect(prepaintSnapshot()["data-theme"]).toBe("light");
  });

  test("heals the snapshot from the saved choice on connect", () => {
    settingsStore.update({ darkMode: true });
    localStorage.setItem(
      PREPAINT_KEY,
      JSON.stringify({ "data-theme": "light" })
    );
    document.documentElement.setAttribute("data-theme", "light");

    mountThemeToggle();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(prepaintSnapshot()["data-theme"]).toBe("dark");
  });

  test("clears a stale snapshot theme when nothing is saved", () => {
    localStorage.setItem(
      PREPAINT_KEY,
      JSON.stringify({ "data-theme": "dark" })
    );
    document.documentElement.setAttribute("data-theme", "dark");

    mountThemeToggle();

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(prepaintSnapshot()).not.toHaveProperty("data-theme");
  });

  test("keeps <meta name=theme-color> in step with the theme", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = THEME_COLOR.light;
    document.head.appendChild(meta);
    try {
      settingsStore.update({ darkMode: true });
      const button = mountThemeToggle().querySelector("button")!;
      expect(meta.content).toBe(THEME_COLOR.dark);

      button.click();
      expect(meta.content).toBe(THEME_COLOR.light);
    } finally {
      meta.remove();
    }
  });

  test("respects OS prefers-color-scheme: dark when no saved preference exists", () => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    const el = mountThemeToggle();

    const button = el.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-label")).toBe("Switch to light mode");

    button.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(settingsStore.get().darkMode).toBe(false);
  });

  test("propagates theme change to same-origin iframes on toggle and clears data-theme when unset", () => {
    // Create an iframe simulating the embedded reader dictionary frame
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    // Populate iframe contentDocument with a basic HTML document
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    const el = mountThemeToggle();

    const button = el.querySelector<HTMLButtonElement>("button")!;

    // Toggle to dark mode
    button.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBe("dark");

    // Toggle back to light mode
    button.click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBe("light");

    // Clearing explicit theme removes data-theme from the iframe so OS media query applies
    document.documentElement.removeAttribute("data-theme");
    syncIframeTheme(iframe);
    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBeNull();
  });

  test("updates settingsStore before data-theme and stays consistent across rapid double-toggle", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    const el = mountThemeToggle();
    const button = el.querySelector<HTMLButtonElement>("button")!;

    let attrAtStoreUpdate: string | null = "unset";
    const origUpdate = settingsStore.update.bind(settingsStore);
    jest.spyOn(settingsStore, "update").mockImplementation((partial) => {
      attrAtStoreUpdate = document.documentElement.getAttribute("data-theme");
      return origUpdate(partial);
    });

    try {
      // First click: light -> dark (store updates while data-theme is still null)
      button.click();
      expect(attrAtStoreUpdate).toBeNull();
      expect(settingsStore.get().darkMode).toBe(true);
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      // Rapid second click: dark -> light (store updates while data-theme is still "dark")
      button.click();
      expect(attrAtStoreUpdate).toBe("dark");
      expect(settingsStore.get().darkMode).toBe(false);
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(
        iframe.contentDocument!.documentElement.getAttribute("data-theme")
      ).toBe("light");
    } finally {
      jest.restoreAllMocks();
    }
  });
});
