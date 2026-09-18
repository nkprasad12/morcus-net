import {
  AnchoredPopoverController,
  BaseElement,
  type FieldCheckers,
  pickValid,
  registerElement,
  storage,
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

export type PersistedReaderPreferences = Omit<ReaderPreferences, "showMacra">;

export const READER_PREFS_CHECKERS: FieldCheckers<PersistedReaderPreferences> =
  {
    readerScale: isNumber,
    dictScale: isNumber,
    showGutter: isBoolean,
    fontFamily: isReaderFontFamily,
    lineHeight: isReaderLineHeight,
  };

export const READER_SETTINGS_KEY = "morcus_reader_settings";

/**
 * Generates the per-work localStorage key for macra toggle, matching V1 exactly.
 */
export function macronStorageKey(workId: string): string {
  return `macronButton-${workId}`;
}

export function getWorkMacra(workId?: string | null): boolean {
  if (!workId) return true;
  return storage.getBoolean(macronStorageKey(workId), true);
}

export function setWorkMacra(workId: string, show: boolean): void {
  storage.setBoolean(macronStorageKey(workId), show);
}

export function removeWorkMacra(workId: string): void {
  storage.remove(macronStorageKey(workId));
}

export function parseReaderPreferences(raw: string | null): ReaderPreferences {
  if (!raw) return { ...DEFAULT_READER_PREFS };
  try {
    const parsed: unknown = JSON.parse(raw);
    return {
      ...DEFAULT_READER_PREFS,
      ...pickValid<PersistedReaderPreferences>(parsed, READER_PREFS_CHECKERS),
    };
  } catch {
    return { ...DEFAULT_READER_PREFS };
  }
}

export const readerSettingsStore = {
  get(): ReaderPreferences {
    return parseReaderPreferences(storage.get(READER_SETTINGS_KEY));
  },

  set(prefs: ReaderPreferences): void {
    const persisted: PersistedReaderPreferences = {
      readerScale: prefs.readerScale,
      dictScale: prefs.dictScale,
      showGutter: prefs.showGutter,
      fontFamily: prefs.fontFamily,
      lineHeight: prefs.lineHeight,
    };
    storage.setJson(READER_SETTINGS_KEY, persisted);
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
 * Progressively enhanced Reader Appearance & Typography popover component (Light DOM mode).
 *
 * Coordinates the anchored settings popover, font scaling steppers, typography
 * selects, scholarly aids toggles, and persistence to localStorage. When
 * preferences are updated, dispatches a bubbling `reader-settings-change`
 * custom event.
 */
export class MorcusReaderSettings extends BaseElement {
  private currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };
  private readonly popoverController = this.addController(
    new AnchoredPopoverController({
      root: this,
      group: "reader-chrome",
      align: "end",
      defaultWidth: 320,
      getPanel: () => this.$<HTMLElement>("#reader-settings-popover"),
      getTrigger: () =>
        this.$<HTMLButtonElement>("#reader-settings-btn") ??
        this.ownerDocument.getElementById("reader-settings-btn"),
      getBackdrop: () =>
        this.$<HTMLElement>("#reader-settings-backdrop") ??
        this.ownerDocument.getElementById("reader-settings-backdrop"),
      getCloseBtn: () =>
        this.$<HTMLButtonElement>("#reader-settings-close-btn"),
    })
  );

  public getPreferences(): ReaderPreferences {
    return { ...this.currentPrefs };
  }

  public getWorkId(): string | null {
    return (
      this.dataset.work ||
      this.closest("morcus-reader-view")?.dataset.work ||
      null
    );
  }

  public isOpen(): boolean {
    return this.popoverController.isOpen;
  }

  public open(): void {
    this.popoverController.open();
  }

  public close(): void {
    this.popoverController.close();
  }

  public toggle(): void {
    this.popoverController.toggle();
  }

  public updatePosition(): void {
    this.popoverController.updatePosition();
  }

  protected override onConnect() {
    this.currentPrefs = readerSettingsStore.get();
    const workId = this.getWorkId();
    if (workId) {
      this.currentPrefs.showMacra = getWorkMacra(workId);
    }

    const resetBtn = this.$<HTMLButtonElement>("#reader-settings-reset-btn");
    const readerSizeDec = this.$<HTMLButtonElement>("#reader-size-dec");
    const readerSizeInc = this.$<HTMLButtonElement>("#reader-size-inc");
    const dictSizeDec = this.$<HTMLButtonElement>("#dict-size-dec");
    const dictSizeInc = this.$<HTMLButtonElement>("#dict-size-inc");
    const toggleMacra = this.$<HTMLInputElement>("#toggle-macra");
    const toggleGutter = this.$<HTMLInputElement>("#toggle-gutter");
    const fontSelect = this.$<HTMLSelectElement>("#font-select");
    const lineHeightSelect = this.$<HTMLSelectElement>("#line-height-select");

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
        const workId = this.getWorkId();
        if (workId) {
          setWorkMacra(workId, toggleMacra.checked);
        }
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
        const workId = this.getWorkId();
        if (workId) {
          removeWorkMacra(workId);
        }
        this.currentPrefs = { ...DEFAULT_READER_PREFS };
        this.saveAndEmit();
      });
    }
  }

  private syncUiWithPrefs(prefs: ReaderPreferences) {
    const readerSizeLabel = this.$<HTMLElement>("#reader-size-label");
    const dictSizeLabel = this.$<HTMLElement>("#dict-size-label");
    const toggleMacra = this.$<HTMLInputElement>("#toggle-macra");
    const toggleGutter = this.$<HTMLInputElement>("#toggle-gutter");
    const fontSelect = this.$<HTMLSelectElement>("#font-select");
    const lineHeightSelect = this.$<HTMLSelectElement>("#line-height-select");

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
