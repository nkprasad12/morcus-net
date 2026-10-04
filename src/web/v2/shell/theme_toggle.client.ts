import {
  BaseElement,
  registerElement,
  settingsStore,
  syncIframeTheme,
} from "@/web/v2/core/index.client";
import { ICON_MOON, ICON_SUN } from "@/web/v2/core/icons.common";

const MOON_PATH = ICON_MOON;
const SUN_PATH = ICON_SUN;

export class MorcusThemeToggle extends BaseElement {
  private isDark: boolean = false;
  private buttonEl: HTMLButtonElement | null = null;
  private pathEl: SVGPathElement | null = null;

  protected override onConnect() {
    this.isDark = this.computeIsDark();
    this.buttonEl = this.scope.$<HTMLButtonElement>("button");
    this.pathEl = this.querySelector<SVGPathElement>("path");
    this.updateView();

    if (this.buttonEl) {
      this.scope.listen(this.buttonEl, "click", this.toggleTheme);
    }

    if (typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof mq?.addEventListener === "function") {
        this.scope.listen(mq, "change", () => {
          this.isDark = this.computeIsDark();
          this.updateView();
        });
      }
    }
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
      // Our button; toggles the theme itself
      e.preventDefault();
      // Click on our button is fully handled here
      e.stopPropagation();
    }
    const nextDark = !this.computeIsDark();
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
      syncIframeTheme(iframe, themeName);
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
}

registerElement("morcus-theme-toggle", MorcusThemeToggle);

declare module "@/web/v2/core/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-theme-toggle": MorcusThemeToggle;
  }
}
