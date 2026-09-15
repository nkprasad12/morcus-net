import {
  BaseElement,
  bindDismissable,
  html,
  joinHtml,
  registerElement,
  setHtml,
  settingsStore,
} from "@/web/v2/core/index.client";
import {
  dictSettingsStore,
  inflectedSettingsStore,
} from "@/web/v2/dict/dict_preferences.client";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { encodeDictBitmask } from "@/web/v2/dict/dict_bitmask.common";
import {
  DEFAULT_DICT_KEYS,
  parseInflectionParam,
  resolveDictParams,
} from "@/web/v2/dict/dict_selection.common";
import { ICON_PATHS } from "@/web/v2/core/icons.common";

const DEFAULT_STRENGTH = 50;

const TUNE_PATH = ICON_PATHS.tune;

export class MorcusDictSettings extends BaseElement {
  private isOpen: boolean = false;
  private strength: number = DEFAULT_STRENGTH;
  private activeDictKeys: Set<string> = new Set();
  private isInflected: boolean = true;

  private detailsEl: HTMLDetailsElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private popoverEl: HTMLElement | null = null;
  private sliderEl: HTMLInputElement | null = null;
  private valueDisplayEl: HTMLElement | null = null;
  private inflectedCheckboxEl: HTMLInputElement | null = null;

  protected override onConnect() {
    this.strength = this.computeInitialStrength();
    this.initActiveDicts();
    this.initInflectedState();
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

    // 2. URL override: 'dict' checkboxes > 'd' bitmask > legacy 'in'
    const searchParams = new URLSearchParams(window.location.search);
    const keysFromQuery = resolveDictParams({
      dictParam: searchParams.getAll("dict"),
      bitmaskParam: searchParams.get("d"),
      inParam: searchParams.getAll("in"),
    });
    if (keysFromQuery) {
      this.activeDictKeys = new Set(keysFromQuery);
      return;
    }

    // 3. Fallback to localStorage
    const stored = dictSettingsStore.get();
    if (stored && stored.length > 0) {
      this.activeDictKeys = new Set(stored);
      return;
    }

    // 4. Fallback to default (all Latin dicts except Pozo)
    this.activeDictKeys = new Set(DEFAULT_DICT_KEYS);
  }

  private initInflectedState() {
    inflectedSettingsStore.syncWithCookie();
    const searchParams = new URLSearchParams(window.location.search);
    // getAll, not get: a No-JS form submits the hidden "0" and the checked box's "1" together.
    this.isInflected =
      parseInflectionParam(searchParams.getAll("o")) ??
      inflectedSettingsStore.get() ??
      true;
  }

  private enhanceMarkup() {
    this.detailsEl = this.$<HTMLDetailsElement>(".dict-settings-details");
    this.summaryEl = this.$<HTMLElement>(".settings-btn");
    this.popoverEl = this.$<HTMLElement>(".settings-popover");

    // If SSR details element doesn't exist (e.g. standalone test), build full structure
    if (!this.detailsEl || !this.popoverEl) {
      const dictItems = LatinDict.AVAILABLE.map((d) => {
        const isChecked = this.activeDictKeys.has(d.key);
        const langText = `${d.languages.from} \u2192 ${d.languages.to}`;
        return html`
          <label class="dict-item" title="${d.displayName} (${langText})">
            <input
              type="checkbox"
              name="dict"
              value="${d.key}"
              class="dict-checkbox"
              data-key="${d.key}"
              ${isChecked ? "checked" : ""} />
            <span class="dict-name">${d.displayName}</span>
            <span class="dict-lang">${langText}</span>
          </label>
        `;
      });

      setHtml(
        this,
        html`
          <details class="dict-settings-details">
            <summary
              class="settings-btn"
              aria-label="Dictionary and highlight settings"
              title="Dictionary and highlight settings">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="${TUNE_PATH}"></path>
              </svg>
            </summary>

            <div class="settings-popover">
              <div class="settings-section-title">Enabled Dictionaries</div>
              <div class="dict-list">${joinHtml(dictItems)}</div>
            </div>
          </details>
        `
      );

      this.detailsEl = this.$<HTMLDetailsElement>(".dict-settings-details");
      this.summaryEl = this.$<HTMLElement>(".settings-btn");
      this.popoverEl = this.$<HTMLElement>(".settings-popover");
    }

    // Sync SSR checkboxes with activeDictKeys
    const checkboxes =
      this.querySelectorAll<HTMLInputElement>(".dict-checkbox");
    checkboxes.forEach((cb) => {
      const key = cb.dataset.key || cb.value;
      if (key) {
        cb.checked = this.activeDictKeys.has(key);
      }
    });

    // Sync inflection checkbox
    this.inflectedCheckboxEl = this.$<HTMLInputElement>("#toggle-inflected");
    if (this.inflectedCheckboxEl) {
      this.inflectedCheckboxEl.checked = this.isInflected;
    }

    // Progressively inject highlight slider if not present
    if (this.popoverEl && !this.$(".settings-slider")) {
      const sliderControls = document.createElement("div");
      sliderControls.className = "settings-slider-section";
      setHtml(
        sliderControls,
        html`
          <div class="settings-header">
            <span class="settings-title">Highlight Strength</span>
            <span class="settings-value">${this.strength}%</span>
          </div>

          <div class="settings-control-row">
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              value="${this.strength}"
              class="settings-slider"
              aria-label="Highlight strength" />
          </div>

          <div class="settings-preview" aria-hidden="true">
            <span class="lsOrth">Caesar</span>
            <span class="lsGrammar">noun</span>
            <span class="lsBibl">Gall. 1.1</span>
            <span class="lsQuote">omnia</span>
          </div>

          <div class="settings-divider" role="separator"></div>
        `
      );
      this.popoverEl.prepend(sliderControls);
    }

    this.sliderEl = this.$<HTMLInputElement>(".settings-slider");
    this.valueDisplayEl = this.$(".settings-value");

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

    // Checkbox listener for both dict selection and inflection toggle
    this.listen(this, "change", (e: Event) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement &&
        target.classList.contains("dict-checkbox")
      ) {
        const key = target.dataset.key || target.value;
        if (!key) return;
        if (target.checked) {
          this.activeDictKeys.add(key);
        } else {
          this.activeDictKeys.delete(key);
        }
        this.saveDictSelection();
      } else if (
        target instanceof HTMLInputElement &&
        (target.id === "toggle-inflected" ||
          target.classList.contains("inflected-checkbox"))
      ) {
        this.isInflected = target.checked;
        inflectedSettingsStore.set(this.isInflected);
        this.dispatchEvent(
          new CustomEvent("dict-inflected-change", {
            bubbles: true,
            composed: true,
            detail: { isInflected: this.isInflected },
          })
        );
      }
    });
  }

  private saveDictSelection() {
    const keys = Array.from(this.activeDictKeys);
    dictSettingsStore.set(keys);
    const bitmask = encodeDictBitmask(keys);
    this.dispatchEvent(
      new CustomEvent("dict-selection-change", {
        bubbles: true,
        composed: true,
        detail: { dictKeys: keys, bitmask },
      })
    );
  }

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
      "--highlight-scale",
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
