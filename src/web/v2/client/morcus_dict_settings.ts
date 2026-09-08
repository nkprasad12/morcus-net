const GLOBAL_SETTINGS_KEY = "GlobalSettings";
const DEFAULT_STRENGTH = 50;

// Material Design "tune" / sliders SVG icon
const TUNE_PATH =
  "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z";

interface SettingsPayload {
  darkMode?: boolean;
  highlightStrength?: number;
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

export class MorcusDictSettings extends HTMLElement {
  private isOpen: boolean = false;
  private strength: number = DEFAULT_STRENGTH;

  private buttonEl: HTMLButtonElement | null = null;
  private popoverEl: HTMLElement | null = null;
  private sliderEl: HTMLInputElement | null = null;
  private valueDisplayEl: HTMLElement | null = null;

  connectedCallback() {
    this.strength = this.computeInitialStrength();
    this.render();
    this.applyScale(this.strength);

    document.addEventListener("pointerdown", this.handleDocumentClick);
    document.addEventListener("mousedown", this.handleDocumentClick);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  disconnectedCallback() {
    document.removeEventListener("pointerdown", this.handleDocumentClick);
    document.removeEventListener("mousedown", this.handleDocumentClick);
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private computeInitialStrength(): number {
    try {
      const parsed = parseSettings(localStorage.getItem(GLOBAL_SETTINGS_KEY));
      if (parsed && typeof parsed.highlightStrength === "number") {
        return Math.max(0, Math.min(100, parsed.highlightStrength));
      }
    } catch {}
    return DEFAULT_STRENGTH;
  }

  private render() {
    this.innerHTML = `
      <button
        type="button"
        class="v2-settings-btn"
        aria-label="Highlight settings"
        title="Highlight settings"
        aria-haspopup="true"
        aria-expanded="false"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="${TUNE_PATH}"></path>
        </svg>
      </button>

      <div class="v2-settings-popover" hidden>
        <div class="v2-settings-header">
          <span class="v2-settings-title">Highlight Strength</span>
          <span class="v2-settings-value">${this.strength}%</span>
        </div>

        <div class="v2-settings-control-row">
          <input
            type="range"
            min="0"
            max="100"
            step="10"
            value="${this.strength}"
            class="v2-settings-slider"
            aria-label="Highlight strength"
          />
        </div>

        <div class="v2-settings-preview" aria-hidden="true">
          <span class="lsOrth">Caesar</span>
          <span class="lsGrammar">noun</span>
          <span class="lsBibl">Gall. 1.1</span>
          <span class="lsQuote">omnia</span>
        </div>
      </div>
    `;

    this.buttonEl = this.querySelector(".v2-settings-btn");
    this.popoverEl = this.querySelector(".v2-settings-popover");
    this.sliderEl = this.querySelector(".v2-settings-slider");
    this.valueDisplayEl = this.querySelector(".v2-settings-value");

    this.buttonEl?.addEventListener("click", this.toggleSettingsPopover);

    this.sliderEl?.addEventListener("input", (e: Event) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.updateStrength(val, false);
    });

    this.sliderEl?.addEventListener("change", (e: Event) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.updateStrength(val, true);
    });
  }

  private readonly toggleSettingsPopover = (e?: Event) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this.isOpen = !this.isOpen;
    if (this.buttonEl) {
      this.buttonEl.setAttribute("aria-expanded", String(this.isOpen));
    }
    if (this.popoverEl) {
      this.popoverEl.hidden = !this.isOpen;
    }
  };

  private readonly closeSettingsPopover = () => {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.buttonEl) {
      this.buttonEl.setAttribute("aria-expanded", "false");
    }
    if (this.popoverEl) {
      this.popoverEl.hidden = true;
    }
  };

  private readonly handleDocumentClick = (e: Event) => {
    if (!this.isOpen) return;
    if (e.target instanceof Node && !this.contains(e.target)) {
      this.closeSettingsPopover();
    }
  };

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.isOpen) {
      this.closeSettingsPopover();
      this.buttonEl?.focus();
    }
  };

  private updateStrength(newStrength: number, persist: boolean) {
    this.strength = newStrength;
    this.applyScale(newStrength);

    if (this.sliderEl && Number(this.sliderEl.value) !== newStrength) {
      this.sliderEl.value = String(newStrength);
    }
    if (this.valueDisplayEl) {
      this.valueDisplayEl.textContent = `${newStrength}%`;
    }

    if (persist) {
      this.persistStrength(newStrength);
    }
  }

  private applyScale(strength: number) {
    const scale = strength / 50;
    document.documentElement.style.setProperty(
      "--v2-highlight-scale",
      String(scale)
    );
  }

  private persistStrength(strength: number) {
    try {
      const parsed =
        parseSettings(localStorage.getItem(GLOBAL_SETTINGS_KEY)) ?? {};
      parsed.highlightStrength = strength;
      localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(parsed));
    } catch (e) {
      console.warn("Could not persist highlight strength to localStorage", e);
    }
  }
}

if (!customElements.get("morcus-dict-settings")) {
  customElements.define("morcus-dict-settings", MorcusDictSettings);
}
