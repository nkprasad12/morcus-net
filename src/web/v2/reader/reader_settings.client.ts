import {
  BaseElement,
  type FieldCheckers,
  pickValid,
  registerElement,
  setupModalDialog,
} from "@/web/v2/core/index.client";
import {
  isBoolean,
  isLiteral,
  isNumber,
  isOneOf,
  Validator,
} from "@/web/utils/rpc/parsing";

export type ReaderFontFamily = "serif" | "sans";
export type ReaderLineHeight = "compact" | "normal" | "relaxed";

export interface ReaderPreferences {
  readerScale: number;
  dictScale: number;
  showMacra: boolean;
  showGutter: boolean;
  fontFamily: ReaderFontFamily;
  lineHeight: ReaderLineHeight;
}

export const DEFAULT_READER_PREFS: ReaderPreferences = {
  readerScale: 100,
  dictScale: 100,
  showMacra: true,
  showGutter: true,
  fontFamily: "serif",
  lineHeight: "normal",
};

export const MIN_READER_SCALE = 70;
export const MAX_READER_SCALE = 160;
export const MIN_DICT_SCALE = 70;
export const MAX_DICT_SCALE = 140;
export const SCALE_STEP = 10;

export const isReaderFontFamily: Validator<ReaderFontFamily> = isOneOf(
  isLiteral("serif"),
  isLiteral("sans")
);

export const isReaderLineHeight: Validator<ReaderLineHeight> = isOneOf(
  isLiteral("compact"),
  isOneOf(isLiteral("normal"), isLiteral("relaxed"))
);

export const READER_PREFS_CHECKERS: FieldCheckers<ReaderPreferences> = {
  readerScale: isNumber,
  dictScale: isNumber,
  showMacra: isBoolean,
  showGutter: isBoolean,
  fontFamily: isReaderFontFamily,
  lineHeight: isReaderLineHeight,
};

export const READER_SETTINGS_KEY = "morcus_reader_settings";

export function parseReaderPreferences(raw: string | null): ReaderPreferences {
  if (!raw) return { ...DEFAULT_READER_PREFS };
  try {
    const parsed: unknown = JSON.parse(raw);
    return {
      ...DEFAULT_READER_PREFS,
      ...pickValid<ReaderPreferences>(parsed, READER_PREFS_CHECKERS),
    };
  } catch {
    return { ...DEFAULT_READER_PREFS };
  }
}

export const readerSettingsStore = {
  get(): ReaderPreferences {
    try {
      return parseReaderPreferences(localStorage.getItem(READER_SETTINGS_KEY));
    } catch {
      return { ...DEFAULT_READER_PREFS };
    }
  },

  set(prefs: ReaderPreferences): void {
    try {
      localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage errors
    }
  },

  update(patch: Partial<ReaderPreferences>): ReaderPreferences {
    const current = readerSettingsStore.get();
    const updated = { ...current, ...patch };
    readerSettingsStore.set(updated);
    return updated;
  },
};

export interface ReaderSettingsChangeEventDetail {
  prefs: ReaderPreferences;
}

/**
 * Progressively enhanced Reader Settings dialog component (Light DOM mode).
 *
 * Coordinates the modal settings dialog, font scaling steppers, typography
 * selects, scholarly aids toggles, and persistence to localStorage. When
 * preferences are updated, dispatches a bubbling `reader-settings-change`
 * custom event.
 */
export class MorcusReaderSettings extends BaseElement {
  private currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };

  public getPreferences(): ReaderPreferences {
    return { ...this.currentPrefs };
  }

  protected override onConnect() {
    this.currentPrefs = readerSettingsStore.get();

    const dialog =
      this.$<HTMLDialogElement>("#v2-reader-settings-dialog") ??
      this.$<HTMLDialogElement>("dialog");
    const settingsBtn =
      this.$<HTMLButtonElement>("#v2-reader-settings-btn") ??
      this.ownerDocument.getElementById("v2-reader-settings-btn");

    if (dialog) {
      this.addDisposable(
        setupModalDialog(dialog, {
          trigger: settingsBtn,
        })
      );
    }

    const resetBtn = this.$<HTMLButtonElement>("#v2-reader-settings-reset-btn");
    const readerSizeDec = this.$<HTMLButtonElement>("#v2-reader-size-dec");
    const readerSizeInc = this.$<HTMLButtonElement>("#v2-reader-size-inc");
    const dictSizeDec = this.$<HTMLButtonElement>("#v2-dict-size-dec");
    const dictSizeInc = this.$<HTMLButtonElement>("#v2-dict-size-inc");
    const toggleMacra = this.$<HTMLInputElement>("#v2-toggle-macra");
    const toggleGutter = this.$<HTMLInputElement>("#v2-toggle-gutter");
    const fontSelect = this.$<HTMLSelectElement>("#v2-font-select");
    const lineHeightSelect = this.$<HTMLSelectElement>(
      "#v2-line-height-select"
    );

    this.syncUiWithPrefs(this.currentPrefs);

    // Stepper bindings
    if (readerSizeDec) {
      this.listen(readerSizeDec, "click", () => {
        this.currentPrefs.readerScale = Math.max(
          MIN_READER_SCALE,
          this.currentPrefs.readerScale - SCALE_STEP
        );
        this.saveAndEmit();
      });
    }

    if (readerSizeInc) {
      this.listen(readerSizeInc, "click", () => {
        this.currentPrefs.readerScale = Math.min(
          MAX_READER_SCALE,
          this.currentPrefs.readerScale + SCALE_STEP
        );
        this.saveAndEmit();
      });
    }

    if (dictSizeDec) {
      this.listen(dictSizeDec, "click", () => {
        this.currentPrefs.dictScale = Math.max(
          MIN_DICT_SCALE,
          this.currentPrefs.dictScale - SCALE_STEP
        );
        this.saveAndEmit();
      });
    }

    if (dictSizeInc) {
      this.listen(dictSizeInc, "click", () => {
        this.currentPrefs.dictScale = Math.min(
          MAX_DICT_SCALE,
          this.currentPrefs.dictScale + SCALE_STEP
        );
        this.saveAndEmit();
      });
    }

    // Toggle bindings
    if (toggleMacra) {
      this.listen(toggleMacra, "change", () => {
        this.currentPrefs.showMacra = toggleMacra.checked;
        this.saveAndEmit();
      });
    }

    if (toggleGutter) {
      this.listen(toggleGutter, "change", () => {
        this.currentPrefs.showGutter = toggleGutter.checked;
        this.saveAndEmit();
      });
    }

    // Select bindings
    if (fontSelect) {
      this.listen(fontSelect, "change", () => {
        this.currentPrefs.fontFamily =
          fontSelect.value === "sans" ? "sans" : "serif";
        this.saveAndEmit();
      });
    }

    if (lineHeightSelect) {
      this.listen(lineHeightSelect, "change", () => {
        const val = lineHeightSelect.value;
        this.currentPrefs.lineHeight =
          val === "compact" || val === "relaxed" ? val : "normal";
        this.saveAndEmit();
      });
    }

    // Reset defaults binding
    if (resetBtn) {
      this.listen(resetBtn, "click", () => {
        this.currentPrefs = { ...DEFAULT_READER_PREFS };
        this.saveAndEmit();
      });
    }
  }

  private syncUiWithPrefs(prefs: ReaderPreferences) {
    const readerSizeLabel = this.$<HTMLElement>("#v2-reader-size-label");
    const dictSizeLabel = this.$<HTMLElement>("#v2-dict-size-label");
    const toggleMacra = this.$<HTMLInputElement>("#v2-toggle-macra");
    const toggleGutter = this.$<HTMLInputElement>("#v2-toggle-gutter");
    const fontSelect = this.$<HTMLSelectElement>("#v2-font-select");
    const lineHeightSelect = this.$<HTMLSelectElement>(
      "#v2-line-height-select"
    );

    if (readerSizeLabel) {
      readerSizeLabel.textContent = `${prefs.readerScale}%`;
    }
    if (dictSizeLabel) {
      dictSizeLabel.textContent = `${prefs.dictScale}%`;
    }
    if (toggleMacra) {
      toggleMacra.checked = prefs.showMacra;
    }
    if (toggleGutter) {
      toggleGutter.checked = prefs.showGutter;
    }
    if (fontSelect) {
      fontSelect.value = prefs.fontFamily;
    }
    if (lineHeightSelect) {
      lineHeightSelect.value = prefs.lineHeight;
    }
  }

  private saveAndEmit() {
    this.syncUiWithPrefs(this.currentPrefs);
    readerSettingsStore.set(this.currentPrefs);
    this.emit<ReaderSettingsChangeEventDetail>("reader-settings-change", {
      prefs: this.currentPrefs,
    });
  }
}

registerElement("morcus-reader-settings", MorcusReaderSettings);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-reader-settings": MorcusReaderSettings;
  }
}
