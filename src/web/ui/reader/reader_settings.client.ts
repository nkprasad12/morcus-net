import {
  BaseElement,
  type FieldCheckers,
  pickValid,
  registerElement,
  storage,
} from "@/web/ui/core/index.client";
import {
  type AnchoredDialog,
  setupAnchoredDialog,
} from "@/web/ui/reader/reader_anchored_dialog.client";
import { isBoolean, isNumber } from "@/web/utils/rpc/parsing";
import { OPEN_APPEARANCE_EVENT } from "@/web/ui/shell/appearance_events.common";
import { DEFAULT_PANEL_SCALE } from "@/web/ui/reader/reader_scale.common";

/**
 * Reader-only preferences. The reading-text font, size and line spacing are
 * app-wide and live in the app-bar Appearance menu (`appearance.client.ts`).
 */
export interface ReaderPreferences {
  /**
   * The side panel's text size (dictionary, translation, notes), in percent
   * of the main reading text. The name predates the translation and notes.
   */
  dictScale: number;
  showMacra: boolean;
  showGutter: boolean;
}

export const DEFAULT_READER_PREFS: ReaderPreferences = {
  dictScale: DEFAULT_PANEL_SCALE,
  showMacra: true,
  showGutter: true,
};

export const MIN_DICT_SCALE = 60;
export const MAX_DICT_SCALE = 130;
const SCALE_STEP = 5;

/** Clamps to the stepper's range and snaps to its steps. */
function clampDictScale(value: number): number {
  const snapped = Math.round(value / SCALE_STEP) * SCALE_STEP;
  return Math.min(MAX_DICT_SCALE, Math.max(MIN_DICT_SCALE, snapped));
}

type PersistedReaderPreferences = Omit<ReaderPreferences, "showMacra">;

const READER_PREFS_CHECKERS: FieldCheckers<PersistedReaderPreferences> = {
  dictScale: isNumber,
  showGutter: isBoolean,
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
    const prefs = {
      ...DEFAULT_READER_PREFS,
      ...pickValid<PersistedReaderPreferences>(parsed, READER_PREFS_CHECKERS),
    };
    prefs.dictScale = clampDictScale(prefs.dictScale);
    return prefs;
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
      dictScale: prefs.dictScale,
      showGutter: prefs.showGutter,
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
 * Progressively enhanced reader settings dialog (Light DOM mode).
 *
 * Coordinates the anchored modal dialog (`reader_anchored_dialog.client.ts`),
 * the side panel's text-size stepper,
 * the scholarly aids and swipe toggles, and persistence to localStorage. The
 * reading-text font, size and spacing are app-wide: the "Text appearance" link
 * opens the app-bar Appearance menu for them. When preferences are updated,
 * dispatches a bubbling `reader-settings-change` custom event.
 */
export class MorcusReaderSettings extends BaseElement {
  #currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };
  #dialog: AnchoredDialog | null = null;

  // Controls read in more than one place. Getters, not cached fields: each
  // read hits the live DOM, so no reference can outlive a markup swap.
  get #toggleMacra() {
    return this.scope.$<HTMLInputElement>("#toggle-macra");
  }
  get #toggleGutter() {
    return this.scope.$<HTMLInputElement>("#toggle-gutter");
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
    return this.#dialog?.isOpen() ?? false;
  }

  public open(): void {
    this.#dialog?.open();
  }

  public close(): void {
    this.#dialog?.close();
  }

  public toggle(): void {
    this.#dialog?.toggle();
  }

  public updatePosition(): void {
    this.#dialog?.updatePosition();
  }

  protected override onConnect() {
    const dialog = this.scope.$<HTMLDialogElement>("#reader-settings-popover");
    this.#dialog = dialog
      ? setupAnchoredDialog(this.scope, {
          dialog,
          // In the sticky bar, outside this element.
          trigger:
            this.scope.$<HTMLButtonElement>("#reader-settings-btn") ??
            this.ownerDocument.getElementById("reader-settings-btn"),
          align: "end",
          defaultWidth: 320,
          getInitialFocus: () =>
            this.scope.$<HTMLButtonElement>("#reader-settings-close-btn"),
        })
      : null;

    this.#currentPrefs = readerSettingsStore.get();
    const workId = this.getWorkId();
    if (workId) {
      this.#currentPrefs.showMacra = getWorkMacra(workId);
    }

    const resetBtn = this.scope.$<HTMLButtonElement>(
      "#reader-settings-reset-btn"
    );
    const dictSizeDec = this.scope.$<HTMLButtonElement>("#dict-size-dec");
    const dictSizeInc = this.scope.$<HTMLButtonElement>("#dict-size-inc");
    const toggleMacra = this.#toggleMacra;
    const toggleGutter = this.#toggleGutter;

    this.#syncUiWithPrefs(this.#currentPrefs);

    // Stepper bindings
    if (dictSizeDec) {
      this.scope.listen(dictSizeDec, "click", () => {
        this.#currentPrefs.dictScale = clampDictScale(
          this.#currentPrefs.dictScale - SCALE_STEP
        );
        this.#saveAndEmit();
      });
    }

    if (dictSizeInc) {
      this.scope.listen(dictSizeInc, "click", () => {
        this.#currentPrefs.dictScale = clampDictScale(
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

    // The text font, size and spacing are app-wide: this link opens the
    // app-bar Appearance menu instead of duplicating its controls.
    const appearanceLink = this.scope.$<HTMLButtonElement>(
      "#reader-appearance-link"
    );
    this.scope.listen(appearanceLink, "click", () => {
      this.close();
      this.ownerDocument.dispatchEvent(new CustomEvent(OPEN_APPEARANCE_EVENT));
    });

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
    const dictSizeLabel = this.scope.$<HTMLElement>("#dict-size-label");
    const toggleMacra = this.#toggleMacra;
    const toggleGutter = this.#toggleGutter;

    if (dictSizeLabel) {
      dictSizeLabel.textContent = `${prefs.dictScale}%`;
    }
    const dec = this.scope.$<HTMLButtonElement>("#dict-size-dec");
    const inc = this.scope.$<HTMLButtonElement>("#dict-size-inc");
    if (dec) dec.disabled = prefs.dictScale <= MIN_DICT_SCALE;
    if (inc) inc.disabled = prefs.dictScale >= MAX_DICT_SCALE;
    if (toggleMacra) {
      toggleMacra.checked = prefs.showMacra;
    }
    if (toggleGutter) {
      toggleGutter.checked = prefs.showGutter;
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
