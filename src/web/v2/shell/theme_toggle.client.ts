import {
  BaseElement,
  registerElement,
  settingsStore,
} from "@/web/v2/core/index.client";
import { ICON_PATHS } from "@/web/v2/core/icons.common";

const MOON_PATH = ICON_PATHS.moon;
const SUN_PATH = ICON_PATHS.sun;

export class MorcusThemeToggle extends BaseElement {
  private isDark: boolean = false;
  private buttonEl: HTMLButtonElement | null = null;
  private pathEl: SVGPathElement | null = null;

  protected override onConnect() {
    this.isDark = this.computeIsDark();
    this.render();
  }

  private computeIsDark(): boolean {
    const currentAttr = document.documentElement.getAttribute("data-theme");
    if (currentAttr === "dark") return true;
    if (currentAttr === "light") return false;

    // Check localStorage settings
    const settings = settingsStore.get();
    if (typeof settings.darkMode === "boolean") {
      return settings.darkMode;
    }

    // Fall back to system preference
    return typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  }

  private readonly toggleTheme = (e?: Event) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const nextDark = !this.isDark;
    this.isDark = nextDark;
    const themeName = nextDark ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", themeName);
    settingsStore.update({ darkMode: nextDark });
    this.updateView();
    this.syncIframesTheme(themeName);
  };

  private syncIframesTheme(themeName: string) {
    const iframes = document.querySelectorAll<HTMLIFrameElement>("iframe");
    for (const iframe of iframes) {
      try {
        if (iframe.contentDocument?.documentElement) {
          iframe.contentDocument.documentElement.setAttribute(
            "data-theme",
            themeName
          );
        }
      } catch {
        // Cross-origin security barrier; safely ignored
      }
    }
  }

  private updateView() {
    const label = this.isDark ? "Switch to light mode" : "Switch to dark mode";
    const pathD = this.isDark ? SUN_PATH : MOON_PATH;

    if (this.buttonEl) {
      this.buttonEl.setAttribute("aria-label", label);
      this.buttonEl.setAttribute("title", label);
    }
    if (this.pathEl) {
      this.pathEl.setAttribute("d", pathD);
    }
  }

  private render() {
    const label = this.isDark ? "Switch to light mode" : "Switch to dark mode";
    const pathD = this.isDark ? SUN_PATH : MOON_PATH;

    this.innerHTML = `
      <button
        type="button"
        class="v2-theme-toggle-btn"
        aria-label="${label}"
        title="${label}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="${pathD}"></path>
        </svg>
      </button>
    `;

    this.buttonEl = this.$<HTMLButtonElement>("button");
    this.pathEl = this.querySelector<SVGPathElement>("path");
    if (this.buttonEl) {
      this.listen(this.buttonEl, "click", this.toggleTheme);
    }
  }
}

registerElement("morcus-theme-toggle", MorcusThemeToggle);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-theme-toggle": MorcusThemeToggle;
  }
}
