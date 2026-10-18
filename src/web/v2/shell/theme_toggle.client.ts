import {
  BaseElement,
  registerElement,
  setPrepaint,
  settingsStore,
  syncIframeTheme,
} from "@/web/v2/core/index.client";
import { ICON_MOON, ICON_SUN } from "@/web/v2/core/widgets/icons.common";
import { THEME_COLOR } from "@/web/v2/shell/theme_color.common";

/**
 * Owner of the theme preference: `GlobalSettings.darkMode` is the saved
 * choice, and `data-theme` on <html> is its pre-paint value, which the
 * critical script restores on the next load. With no saved choice there is no
 * `data-theme` and the OS colour scheme applies.
 */
class MorcusThemeToggle extends BaseElement {
  #isDark: boolean = false;
  #buttonEl: HTMLButtonElement | null = null;
  #pathEl: SVGPathElement | null = null;

  protected override onConnect() {
    // Re-record on every connect, so a stale or missing snapshot heals.
    const saved = settingsStore.get().darkMode;
    setPrepaint(
      "data-theme",
      saved === undefined ? null : saved ? "dark" : "light"
    );
    this.#isDark = this.#computeIsDark();
    this.#buttonEl = this.scope.$<HTMLButtonElement>("button");
    this.#pathEl = this.querySelector<SVGPathElement>("path");
    this.#updateView();

    if (this.#buttonEl) {
      this.scope.listen(this.#buttonEl, "click", this.#toggleTheme);
    }

    if (typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof mq?.addEventListener === "function") {
        this.scope.listen(mq, "change", () => {
          this.#isDark = this.#computeIsDark();
          this.#updateView();
        });
      }
    }
  }

  #computeIsDark(): boolean {
    const currentAttr = document.documentElement.getAttribute("data-theme");
    if (currentAttr === "dark") return true;
    if (currentAttr === "light") return false;

    // No saved choice: follow the system preference
    return typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  }

  readonly #toggleTheme = (e?: Event) => {
    if (e) {
      // Our button; toggles the theme itself
      e.preventDefault();
      // Click on our button is fully handled here
      e.stopPropagation();
    }
    const nextDark = !this.#computeIsDark();
    this.#isDark = nextDark;
    const themeName = nextDark ? "dark" : "light";

    setPrepaint("data-theme", themeName);
    settingsStore.update({ darkMode: nextDark });
    this.#updateView();
    this.#syncIframesTheme(themeName);
  };

  #syncIframesTheme(themeName: string) {
    const iframes = document.querySelectorAll<HTMLIFrameElement>("iframe");
    for (const iframe of iframes) {
      syncIframeTheme(iframe, themeName);
    }
  }

  #updateView() {
    const label = this.#isDark ? "Switch to light mode" : "Switch to dark mode";
    const pathD = this.#isDark ? ICON_SUN : ICON_MOON;

    if (this.#buttonEl) {
      this.#buttonEl.setAttribute("aria-label", label);
      this.#buttonEl.setAttribute("title", label);
    }
    if (this.#pathEl) {
      this.#pathEl.setAttribute("d", pathD);
    }
    // The server renders the light colour; a dark page corrects it here.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR[this.#isDark ? "dark" : "light"]);
  }
}

registerElement("morcus-theme-toggle", MorcusThemeToggle);

declare module "@/web/v2/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-theme-toggle": MorcusThemeToggle;
  }
}
