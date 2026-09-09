import {
  BaseElement,
  bindDismissable,
  registerElement,
  settingsStore,
} from "@/web/v2/core/index.client";

const DEFAULT_STRENGTH = 50;

// Material Design "tune" / sliders SVG icon
const TUNE_PATH =
  "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z";

export class MorcusDictSettings extends BaseElement {
  private isOpen: boolean = false;
  private strength: number = DEFAULT_STRENGTH;

  private buttonEl: HTMLButtonElement | null = null;
  private popoverEl: HTMLElement | null = null;
  private sliderEl: HTMLInputElement | null = null;
  private valueDisplayEl: HTMLElement | null = null;

  protected override onConnect() {
    this.strength = this.computeInitialStrength();
    this.render();
    this.applyScale(this.strength);

    this.addDisposable(
      bindDismissable({
        container: () => this.popoverEl,
        isOpen: () => this.isOpen,
        onDismiss: () => this.closeSettingsPopover(),
        triggerEl: () => this.buttonEl,
        listenPointerDown: true,
        ignore: (target) => Boolean(this.buttonEl?.contains(target)),
      })
    );
  }

  private computeInitialStrength(): number {
    const settings = settingsStore.get();
    if (typeof settings.highlightStrength === "number") {
      return Math.max(0, Math.min(100, settings.highlightStrength));
    }
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

    this.buttonEl = this.$<HTMLButtonElement>(".v2-settings-btn");
    this.popoverEl = this.$(".v2-settings-popover");
    this.sliderEl = this.$<HTMLInputElement>(".v2-settings-slider");
    this.valueDisplayEl = this.$(".v2-settings-value");

    if (this.buttonEl) {
      this.listen(this.buttonEl, "click", this.toggleSettingsPopover);
    }

    if (this.sliderEl) {
      this.listen(this.sliderEl, "input", (e: Event) => {
        if (e.target instanceof HTMLInputElement) {
          this.updateStrength(Number(e.target.value), false);
        }
      });
      this.listen(this.sliderEl, "change", (e: Event) => {
        if (e.target instanceof HTMLInputElement) {
          this.updateStrength(Number(e.target.value), true);
        }
      });
    }
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

  private closeSettingsPopover() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.buttonEl) {
      this.buttonEl.setAttribute("aria-expanded", "false");
    }
    if (this.popoverEl) {
      this.popoverEl.hidden = true;
    }
  }

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
      settingsStore.update({ highlightStrength: newStrength });
    }
  }

  private applyScale(strength: number) {
    const scale = strength / 50;
    document.documentElement.style.setProperty(
      "--v2-highlight-scale",
      String(scale)
    );
  }
}

registerElement("morcus-dict-settings", MorcusDictSettings);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-dict-settings": MorcusDictSettings;
  }
}
