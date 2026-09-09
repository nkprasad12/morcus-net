import {
  BaseElement,
  bindDismissable,
  dictSettingsStore,
  registerElement,
  settingsStore,
} from "@/web/v2/core/index.client";
import { LatinDict } from "@/common/dictionaries/latin_dicts";

const DEFAULT_STRENGTH = 50;

// Material Design "tune" / sliders SVG icon
const TUNE_PATH =
  "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z";

export class MorcusDictSettings extends BaseElement {
  private isOpen: boolean = false;
  private strength: number = DEFAULT_STRENGTH;
  private activeDictKeys: Set<string> = new Set();

  private detailsEl: HTMLDetailsElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private popoverEl: HTMLElement | null = null;
  private sliderEl: HTMLInputElement | null = null;
  private valueDisplayEl: HTMLElement | null = null;

  protected override onConnect() {
    this.strength = this.computeInitialStrength();
    this.initActiveDicts();
    this.enhanceMarkup();
    this.applyScale(this.strength);

    this.addDisposable(
      bindDismissable({
        container: () => this.popoverEl,
        isOpen: () => (this.detailsEl ? this.detailsEl.open : this.isOpen),
        onDismiss: () => this.closeSettingsPopover(),
        triggerEl: () => this.summaryEl,
        listenPointerDown: true,
        ignore: (target) => Boolean(this.summaryEl?.contains(target)),
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

  private initActiveDicts() {
    // 1. Synchronize cookie with localStorage if cookie was missing
    dictSettingsStore.syncWithCookie();

    // 2. Check if URL has explicit dictionary override
    const searchParams = new URLSearchParams(window.location.search);
    const inParam = searchParams.get("in") || searchParams.get("dict");
    if (inParam) {
      const keys = inParam.split(inParam.includes(",") ? "," : "-");
      const normalized = keys.map((k) => k.replace(/([a-zA-Z])n([a-zA-Z])/g, "$1&$2"));
      this.activeDictKeys = new Set(
        LatinDict.AVAILABLE.filter(
          (d) =>
            normalized.some(
              (n) =>
                n.toLowerCase() === d.key.toLowerCase() ||
                (n.toLowerCase() === "ls" && d.key === "L&S") ||
                (n.toLowerCase() === "sh" && d.key === "S&H")
            )
        ).map((d) => d.key)
      );
      return;
    }

    // 3. Fallback to localStorage
    const stored = dictSettingsStore.get();
    if (stored && stored.length > 0) {
      this.activeDictKeys = new Set(stored);
      return;
    }

    // 4. Fallback to default (all Latin dicts except Pozo)
    this.activeDictKeys = new Set(
      LatinDict.AVAILABLE.filter((d) => d !== LatinDict.Pozo).map((d) => d.key)
    );
  }

  private enhanceMarkup() {
    this.detailsEl = this.$<HTMLDetailsElement>(".v2-dict-settings-details");
    this.summaryEl = this.$<HTMLElement>(".v2-settings-btn");
    this.popoverEl = this.$<HTMLElement>(".v2-settings-popover");

    // If SSR details element doesn't exist (e.g. standalone test), build full structure
    if (!this.detailsEl || !this.popoverEl) {
      const dictItemsHtml = LatinDict.AVAILABLE.map((d) => {
        const isChecked = this.activeDictKeys.has(d.key);
        const langText = `${d.languages.from} \u2192 ${d.languages.to}`;
        return `
          <label class="v2-dict-item" title="${d.displayName} (${langText})">
            <input
              type="checkbox"
              name="dict"
              value="${d.key}"
              class="v2-dict-checkbox"
              data-key="${d.key}"
              ${isChecked ? "checked" : ""}
            />
            <span class="v2-dict-name">${d.displayName}</span>
            <span class="v2-dict-lang">${langText}</span>
          </label>
        `;
      }).join("");

      this.innerHTML = `
        <details class="v2-dict-settings-details">
          <summary
            class="v2-settings-btn"
            aria-label="Dictionary and highlight settings"
            title="Dictionary and highlight settings"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="${TUNE_PATH}"></path>
            </svg>
          </summary>

          <div class="v2-settings-popover">
            <div class="v2-settings-section-title">Enabled Dictionaries</div>
            <div class="v2-dict-list">
              ${dictItemsHtml}
            </div>
          </div>
        </details>
      `;

      this.detailsEl = this.$<HTMLDetailsElement>(".v2-dict-settings-details");
      this.summaryEl = this.$<HTMLElement>(".v2-settings-btn");
      this.popoverEl = this.$<HTMLElement>(".v2-settings-popover");
    }

    // Sync SSR checkboxes with activeDictKeys
    const checkboxes = this.querySelectorAll<HTMLInputElement>(".v2-dict-checkbox");
    checkboxes.forEach((cb) => {
      const key = cb.dataset.key || cb.value;
      if (key) {
        cb.checked = this.activeDictKeys.has(key);
      }
    });

    // Progressively inject highlight slider if not present
    if (this.popoverEl && !this.$(".v2-settings-slider")) {
      const sliderControls = document.createElement("div");
      sliderControls.className = "v2-settings-slider-section";
      sliderControls.innerHTML = `
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

        <div class="v2-settings-divider" role="separator"></div>
      `;
      this.popoverEl.prepend(sliderControls);
    }

    this.sliderEl = this.$<HTMLInputElement>(".v2-settings-slider");
    this.valueDisplayEl = this.$(".v2-settings-value");

    if (this.summaryEl) {
      this.listen(this.summaryEl, "click", (e: MouseEvent) => {
        if (this.detailsEl) {
          // JSDOM does not natively toggle details.open on summary click
          this.detailsEl.open = !this.detailsEl.open;
          this.isOpen = this.detailsEl.open;
          e.preventDefault();
        }
      });
    }

    if (this.detailsEl) {
      this.listen(this.detailsEl, "toggle", () => {
        this.isOpen = Boolean(this.detailsEl?.open);
      });
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

    // Checkbox listener
    this.listen(this, "change", (e: Event) => {
      const target = e.target;
      if (target instanceof HTMLInputElement && target.classList.contains("v2-dict-checkbox")) {
        const key = target.dataset.key || target.value;
        if (!key) return;
        if (target.checked) {
          this.activeDictKeys.add(key);
        } else {
          this.activeDictKeys.delete(key);
        }
        this.saveDictSelection();
      }
    });
  }

  private saveDictSelection() {
    const keys = Array.from(this.activeDictKeys);
    dictSettingsStore.set(keys);
    this.dispatchEvent(
      new CustomEvent("dict-selection-change", {
        bubbles: true,
        composed: true,
        detail: { dictKeys: keys },
      })
    );
  }

  private readonly toggleSettingsPopover = (e?: Event) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this.isOpen = !this.isOpen;
    if (this.detailsEl) {
      this.detailsEl.open = this.isOpen;
    }
    if (this.summaryEl) {
      this.summaryEl.setAttribute("aria-expanded", String(this.isOpen));
    }
    if (this.popoverEl && !this.detailsEl) {
      this.popoverEl.hidden = !this.isOpen;
    }
  };

  private closeSettingsPopover() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.detailsEl) {
      this.detailsEl.open = false;
    }
    if (this.summaryEl) {
      this.summaryEl.setAttribute("aria-expanded", "false");
    }
    if (this.popoverEl && !this.detailsEl) {
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
