/**
 * @jest-environment jsdom
 */
import "@/web/v2/shell/theme_toggle.client";
import { settingsStore } from "@/web/v2/core/index.client";

describe("MorcusThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("toggles theme and persists to settingsStore", () => {
    const el = document.createElement("morcus-theme-toggle");
    document.body.appendChild(el);

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

  test("propagates theme change to same-origin iframes on toggle", () => {
    // Create an iframe simulating the embedded reader dictionary frame
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    // Populate iframe contentDocument with a basic HTML document
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    const el = document.createElement("morcus-theme-toggle");
    document.body.appendChild(el);

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
  });
});
