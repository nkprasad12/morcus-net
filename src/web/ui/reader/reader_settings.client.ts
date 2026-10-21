import {
  BaseElement,
  type FieldCheckers,
  pickValid,
  registerElement,
  storage,
} from "@/web/ui/core/index.client";
// Not in the core barrel: only the reader uses it, so it ships in reader.js.
import { AnchoredPopoverController } from "@/web/ui/core/widgets/popover.client";
import {
  isBoolean,
  isLiteral,
  isNumber,
  isOneOf,
  Validator,
} from "@/web/utils/rpc/parsing";

type ReaderFontFamily = "serif" | "sans";
type ReaderLineHeight = "compact" | "normal" | "relaxed";

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
  fontFamily: "sans",
  lineHeight: "normal",
};

export const MIN_READER_SCALE = 70;
export const MAX_READER_SCALE = 160;
export const MIN_DICT_SCALE = 70;
export const MAX_DICT_SCALE = 140;
const SCALE_STEP = 10;

const isReaderFontFamily: Validator<ReaderFontFamily> = isOneOf(
  isLiteral("serif"),
  isLiteral("sans")
);

const isReaderLineHeight: Validator<ReaderLineHeight> = isOneOf(
  isLiteral("compact"),
  isOneOf(isLiteral("normal"), isLiteral("relaxed"))
);

type PersistedReaderPreferences = Omit<ReaderPreferences, "showMacra">;

const READER_PREFS_CHECKERS: FieldCheckers<PersistedReaderPreferences> = {
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

/**
 * Swipe page-turn toggle, stored under V1's key so existing choices carry
 * over (`storage.getBoolean` also accepts V1's `{"w":true}` encoding). Kept
 * out of {@link ReaderPreferences}: the page-nav controller reads it at
 * gesture time, so nothing needs to be re-applied when it changes.
 */
export const SWIPE_NAV_KEY = "RD_MB_NAV_SWIPE";

export const isSwipeNavOn = () => storage.getBoolean(SWIPE_NAV_KEY, true);

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
  #currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };
  readonly #popoverController = this.addController(
    new AnchoredPopoverController({
      root: this,
      group: "reader-chrome",
      align: "end",
      defaultWidth: 320,
      getPanel: () => this.scope.$<HTMLElement>("#reader-settings-popover"),
      getTrigger: () =>
        this.scope.$<HTMLButtonElement>("#reader-settings-btn") ??
        this.ownerDocument.getElementById("reader-settings-btn"),
      getBackdrop: () =>
        this.scope.$<HTMLElement>("#reader-settings-backdrop") ??
        this.ownerDocument.getElementById("reader-settings-backdrop"),
      getCloseBtn: () =>
        this.scope.$<HTMLButtonElement>("#reader-settings-close-btn"),
    })
  );

  // Controls read in more than one place. Getters, not cached fields: each
  // read hits the live DOM, so no reference can outlive a markup swap.
  get #toggleMacra() {
    return this.scope.$<HTMLInputElement>("#toggle-macra");
  }
  get #toggleGutter() {
    return this.scope.$<HTMLInputElement>("#toggle-gutter");
  }
  get #fontSelect() {
    return this.scope.$<HTMLSelectElement>("#font-select");
  }
  get #lineHeightSelect() {
    return this.scope.$<HTMLSelectElement>("#line-height-select");
  }

  public getPreferences(): ReaderPreferences {
    return { ...this.#currentPrefs };
  }

  public getWorkId(): string | null {
    return (
      this.dataset.work ||
      this.closest<HTMLElement>("morcus-reader-view")?.dataset.work ||
      null
    );
  }

  public isOpen(): boolean {
    return this.#popoverController.isOpen;
  }

  public open(): void {
    this.#popoverController.open();
  }

  public close(): void {
    this.#popoverController.close();
  }

  public toggle(): void {
    this.#popoverController.toggle();
  }

  public updatePosition(): void {
    this.#popoverController.updatePosition();
  }

  protected override onConnect() {
    this.#currentPrefs = readerSettingsStore.get();
    const workId = this.getWorkId();
    if (workId) {
      this.#currentPrefs.showMacra = getWorkMacra(workId);
    }

    const resetBtn = this.scope.$<HTMLButtonElement>(
      "#reader-settings-reset-btn"
    );
    const readerSizeDec = this.scope.$<HTMLButtonElement>("#reader-size-dec");
    const readerSizeInc = this.scope.$<HTMLButtonElement>("#reader-size-inc");
    const dictSizeDec = this.scope.$<HTMLButtonElement>("#dict-size-dec");
    const dictSizeInc = this.scope.$<HTMLButtonElement>("#dict-size-inc");
    const toggleMacra = this.#toggleMacra;
    const toggleGutter = this.#toggleGutter;
    const fontSelect = this.#fontSelect;
    const lineHeightSelect = this.#lineHeightSelect;

    this.#syncUiWithPrefs(this.#currentPrefs);

    // Stepper bindings
    if (readerSizeDec) {
      this.scope.listen(readerSizeDec, "click", () => {
        this.#currentPrefs.readerScale = Math.max(
          MIN_READER_SCALE,
          this.#currentPrefs.readerScale - SCALE_STEP
        );
        this.#saveAndEmit();
      });
    }

    if (readerSizeInc) {
      this.scope.listen(readerSizeInc, "click", () => {
        this.#currentPrefs.readerScale = Math.min(
          MAX_READER_SCALE,
          this.#currentPrefs.readerScale + SCALE_STEP
        );
        this.#saveAndEmit();
      });
    }

    if (dictSizeDec) {
      this.scope.listen(dictSizeDec, "click", () => {
        this.#currentPrefs.dictScale = Math.max(
          MIN_DICT_SCALE,
          this.#currentPrefs.dictScale - SCALE_STEP
        );
        this.#saveAndEmit();
      });
    }

    if (dictSizeInc) {
      this.scope.listen(dictSizeInc, "click", () => {
        this.#currentPrefs.dictScale = Math.min(
          MAX_DICT_SCALE,
          this.#currentPrefs.dictScale + SCALE_STEP
        );
        this.#saveAndEmit();
      });
    }

    // Toggle bindings
    if (toggleMacra) {
      this.scope.listen(toggleMacra, "change", () => {
        const workId = this.getWorkId();
        if (workId) {
          setWorkMacra(workId, toggleMacra.checked);
        }
        this.#currentPrefs.showMacra = toggleMacra.checked;
        this.#saveAndEmit();
      });
    }

    if (toggleGutter) {
      this.scope.listen(toggleGutter, "change", () => {
        this.#currentPrefs.showGutter = toggleGutter.checked;
        this.#saveAndEmit();
      });
    }

    // Select bindings
    if (fontSelect) {
      this.scope.listen(fontSelect, "change", () => {
        this.#currentPrefs.fontFamily =
          fontSelect.value === "sans" ? "sans" : "serif";
        this.#saveAndEmit();
      });
    }

    if (lineHeightSelect) {
      this.scope.listen(lineHeightSelect, "change", () => {
        const val = lineHeightSelect.value;
        this.#currentPrefs.lineHeight =
          val === "compact" || val === "relaxed" ? val : "normal";
        this.#saveAndEmit();
      });
    }

    // The swipe toggle is read by the page-nav controller at gesture time, so
    // writing storage is all a change needs.
    const toggleSwipe = this.scope.$<HTMLInputElement>("#toggle-swipe-nav");
    if (toggleSwipe) {
      toggleSwipe.checked = isSwipeNavOn();
      this.scope.listen(toggleSwipe, "change", () => {
        storage.setBoolean(SWIPE_NAV_KEY, toggleSwipe.checked);
      });
    }

    // Reset defaults binding
    if (resetBtn) {
      this.scope.listen(resetBtn, "click", () => {
        const workId = this.getWorkId();
        if (workId) {
          removeWorkMacra(workId);
        }
        storage.remove(SWIPE_NAV_KEY);
        if (toggleSwipe) toggleSwipe.checked = isSwipeNavOn();
        this.#currentPrefs = { ...DEFAULT_READER_PREFS };
        this.#saveAndEmit();
      });
    }
  }

  #syncUiWithPrefs(prefs: ReaderPreferences) {
    const readerSizeLabel = this.scope.$<HTMLElement>("#reader-size-label");
    const dictSizeLabel = this.scope.$<HTMLElement>("#dict-size-label");
    const toggleMacra = this.#toggleMacra;
    const toggleGutter = this.#toggleGutter;
    const fontSelect = this.#fontSelect;
    const lineHeightSelect = this.#lineHeightSelect;

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

  #saveAndEmit() {
    this.#syncUiWithPrefs(this.#currentPrefs);
    readerSettingsStore.set(this.#currentPrefs);
    this.emit<ReaderSettingsChangeEventDetail>("reader-settings-change", {
      prefs: this.#currentPrefs,
    });
  }
}

registerElement("morcus-reader-settings", MorcusReaderSettings);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-reader-settings": MorcusReaderSettings;
  }
}
