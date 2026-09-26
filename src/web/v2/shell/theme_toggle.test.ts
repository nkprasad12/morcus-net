/**
 * @jest-environment jsdom
 */
import "@/web/v2/shell/theme_toggle.client";
import { settingsStore, syncIframeTheme } from "@/web/v2/core/index.client";

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

  test("respects OS prefers-color-scheme: dark when no saved preference exists", () => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });

    const el = document.createElement("morcus-theme-toggle");
    document.body.appendChild(el);

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

    // Clearing explicit theme removes data-theme from the iframe so OS media query applies
    document.documentElement.removeAttribute("data-theme");
    syncIframeTheme(iframe);
    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBeNull();
  });
});
