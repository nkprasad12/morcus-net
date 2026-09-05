import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";

const GLOBAL_SETTINGS_KEY = "GlobalSettings";

// Material Design SVG icon paths matching existing SPA
const MOON_PATH =
  "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z";
const SUN_PATH =
  "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z";

interface SettingsPayload {
  darkMode?: boolean;
}

function parseSettings(raw: string | null): SettingsPayload | null {
  if (!raw) return null;
  try {
    const val = JSON.parse(raw);
    if (val && typeof val === "object") {
      return val;
    }
  } catch {}
  return null;
}

@customElement("morcus-theme-toggle")
export class MorcusThemeToggle extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @state()
  private isDark: boolean = false;

  override connectedCallback() {
    super.connectedCallback();
    this.isDark = this.computeIsDark();
  }

  private computeIsDark(): boolean {
    const currentAttr = document.documentElement.getAttribute("data-theme");
    if (currentAttr === "dark") return true;
    if (currentAttr === "light") return false;

    // Check localStorage (GlobalSettings)
    try {
      const parsed = parseSettings(localStorage.getItem(GLOBAL_SETTINGS_KEY));
      if (parsed && typeof parsed.darkMode === "boolean") {
        return parsed.darkMode;
      }
    } catch {}

    // Fall back to system preference
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  private readonly toggleTheme = () => {
    const nextDark = !this.isDark;
    this.isDark = nextDark;
    const themeName = nextDark ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", themeName);

    try {
      const parsed =
        parseSettings(localStorage.getItem(GLOBAL_SETTINGS_KEY)) ?? {};
      parsed.darkMode = nextDark;
      localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(parsed));
    } catch (e) {
      console.warn("Could not persist theme to localStorage", e);
    }
  };

  override render() {
    const label = this.isDark ? "Switch to light mode" : "Switch to dark mode";
    const pathD = this.isDark ? SUN_PATH : MOON_PATH;

    return html`
      <button
        type="button"
        class="v2-theme-toggle-btn"
        aria-label="${label}"
        title="${label}"
        @click=${this.toggleTheme}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="${pathD}"></path>
        </svg>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "morcus-theme-toggle": MorcusThemeToggle;
  }
}
