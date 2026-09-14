/**
 * @jest-environment jsdom
 */
import {
  DEFAULT_READER_PREFS,
  MAX_DICT_SCALE,
  MAX_READER_SCALE,
  MIN_DICT_SCALE,
  MIN_READER_SCALE,
  MorcusReaderSettings,
  READER_SETTINGS_KEY,
  parseReaderPreferences,
  readerSettingsStore,
} from "@/web/v2/reader/reader_settings.client";

describe("Reader preferences validation & schema", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default preferences on null, empty string, or invalid JSON", () => {
    expect(parseReaderPreferences(null)).toEqual(DEFAULT_READER_PREFS);
    expect(parseReaderPreferences("")).toEqual(DEFAULT_READER_PREFS);
    expect(parseReaderPreferences("{invalid json")).toEqual(
      DEFAULT_READER_PREFS
    );
  });

  it("returns default preferences on non-object JSON", () => {
    expect(parseReaderPreferences("123")).toEqual(DEFAULT_READER_PREFS);
    expect(parseReaderPreferences('"serif"')).toEqual(DEFAULT_READER_PREFS);
    expect(parseReaderPreferences("[1, 2, 3]")).toEqual(DEFAULT_READER_PREFS);
  });

  it("parses valid preferences completely", () => {
    const valid = {
      readerScale: 120,
      dictScale: 90,
      showMacra: false,
      showGutter: false,
      fontFamily: "sans" as const,
      lineHeight: "compact" as const,
    };
    expect(parseReaderPreferences(JSON.stringify(valid))).toEqual(valid);
  });

  it("partially parses valid fields and falls back to defaults for missing ones", () => {
    const partial = {
      readerScale: 80,
      fontFamily: "sans" as const,
    };
    expect(parseReaderPreferences(JSON.stringify(partial))).toEqual({
      ...DEFAULT_READER_PREFS,
      readerScale: 80,
      fontFamily: "sans",
    });
  });

  it("drops corrupt or invalid union/numeric values and preserves defaults", () => {
    const corrupt = {
      readerScale: "invalid_string",
      dictScale: null,
      showMacra: "not_a_boolean",
      showGutter: 123,
      fontFamily: "comic-sans",
      lineHeight: "huge",
      extraField: "ignored",
    };
    expect(parseReaderPreferences(JSON.stringify(corrupt))).toEqual(
      DEFAULT_READER_PREFS
    );
  });

  it("preserves valid fields even when sibling fields are corrupt", () => {
    const mixed = {
      readerScale: 110,
      dictScale: "bad",
      fontFamily: "sans" as const,
      lineHeight: "super_relaxed",
    };
    expect(parseReaderPreferences(JSON.stringify(mixed))).toEqual({
      ...DEFAULT_READER_PREFS,
      readerScale: 110,
      fontFamily: "sans",
    });
  });
});

describe("MorcusReaderSettings custom element", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
  });

  function createSettingsElement(): {
    el: MorcusReaderSettings;
    dialog: HTMLDialogElement;
    triggerBtn: HTMLButtonElement;
    readerSizeDec: HTMLButtonElement;
    readerSizeInc: HTMLButtonElement;
    readerSizeLabel: HTMLElement;
    dictSizeDec: HTMLButtonElement;
    dictSizeInc: HTMLButtonElement;
    dictSizeLabel: HTMLElement;
    toggleMacra: HTMLInputElement;
    toggleGutter: HTMLInputElement;
    fontSelect: HTMLSelectElement;
    lineHeightSelect: HTMLSelectElement;
    resetBtn: HTMLButtonElement;
  } {
    container.innerHTML = `
      <button type="button" id="v2-reader-settings-btn">Settings</button>
      <morcus-reader-settings>
        <dialog class="v2-dialog v2-reader-settings-dialog" id="v2-reader-settings-dialog">
          <button type="button" id="v2-reader-size-dec">-</button>
          <span id="v2-reader-size-label">100%</span>
          <button type="button" id="v2-reader-size-inc">+</button>

          <button type="button" id="v2-dict-size-dec">-</button>
          <span id="v2-dict-size-label">100%</span>
          <button type="button" id="v2-dict-size-inc">+</button>

          <input type="checkbox" id="v2-toggle-macra" checked />
          <input type="checkbox" id="v2-toggle-gutter" checked />

          <select id="v2-font-select">
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
          </select>

          <select id="v2-line-height-select">
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="relaxed">Relaxed</option>
          </select>

          <button type="button" id="v2-reader-settings-reset-btn">Reset</button>
        </dialog>
      </morcus-reader-settings>
    `;

    const el = container.querySelector<MorcusReaderSettings>(
      "morcus-reader-settings"
    )!;
    return {
      el,
      dialog: container.querySelector<HTMLDialogElement>(
        "#v2-reader-settings-dialog"
      )!,
      triggerBtn: container.querySelector<HTMLButtonElement>(
        "#v2-reader-settings-btn"
      )!,
      readerSizeDec: container.querySelector<HTMLButtonElement>(
        "#v2-reader-size-dec"
      )!,
      readerSizeInc: container.querySelector<HTMLButtonElement>(
        "#v2-reader-size-inc"
      )!,
      readerSizeLabel: container.querySelector<HTMLElement>(
        "#v2-reader-size-label"
      )!,
      dictSizeDec:
        container.querySelector<HTMLButtonElement>("#v2-dict-size-dec")!,
      dictSizeInc:
        container.querySelector<HTMLButtonElement>("#v2-dict-size-inc")!,
      dictSizeLabel: container.querySelector<HTMLElement>(
        "#v2-dict-size-label"
      )!,
      toggleMacra:
        container.querySelector<HTMLInputElement>("#v2-toggle-macra")!,
      toggleGutter:
        container.querySelector<HTMLInputElement>("#v2-toggle-gutter")!,
      fontSelect:
        container.querySelector<HTMLSelectElement>("#v2-font-select")!,
      lineHeightSelect: container.querySelector<HTMLSelectElement>(
        "#v2-line-height-select"
      )!,
      resetBtn: container.querySelector<HTMLButtonElement>(
        "#v2-reader-settings-reset-btn"
      )!,
    };
  }

  test("hydrates UI with defaults when localStorage is empty", () => {
    const {
      readerSizeLabel,
      dictSizeLabel,
      toggleMacra,
      toggleGutter,
      fontSelect,
      lineHeightSelect,
    } = createSettingsElement();

    expect(readerSizeLabel.textContent).toBe("100%");
    expect(dictSizeLabel.textContent).toBe("100%");
    expect(toggleMacra.checked).toBe(true);
    expect(toggleGutter.checked).toBe(true);
    expect(fontSelect.value).toBe("serif");
    expect(lineHeightSelect.value).toBe("normal");
  });

  test("hydrates UI with saved settings from localStorage", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({
        readerScale: 120,
        dictScale: 90,
        showMacra: false,
        showGutter: false,
        fontFamily: "sans",
        lineHeight: "compact",
      })
    );

    const {
      readerSizeLabel,
      dictSizeLabel,
      toggleMacra,
      toggleGutter,
      fontSelect,
      lineHeightSelect,
    } = createSettingsElement();

    expect(readerSizeLabel.textContent).toBe("120%");
    expect(dictSizeLabel.textContent).toBe("90%");
    expect(toggleMacra.checked).toBe(false);
    expect(toggleGutter.checked).toBe(false);
    expect(fontSelect.value).toBe("sans");
    expect(lineHeightSelect.value).toBe("compact");
  });

  test("hydrates safely when localStorage contains corrupt data", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({
        readerScale: "invalid",
        dictScale: 130,
        fontFamily: "comic-sans",
        lineHeight: "relaxed",
      })
    );

    const { readerSizeLabel, dictSizeLabel, fontSelect, lineHeightSelect } =
      createSettingsElement();

    expect(readerSizeLabel.textContent).toBe("100%");
    expect(dictSizeLabel.textContent).toBe("130%");
    expect(fontSelect.value).toBe("serif");
    expect(lineHeightSelect.value).toBe("relaxed");
  });

  test("stepper dec/inc adjusts reader text size within bounds and dispatches event", () => {
    const { el, readerSizeDec, readerSizeInc, readerSizeLabel } =
      createSettingsElement();

    const changeEvents: unknown[] = [];
    el.addEventListener("reader-settings-change", (e: Event) => {
      changeEvents.push((e as CustomEvent).detail);
    });

    // Dec from 100 -> 90
    readerSizeDec.click();
    expect(readerSizeLabel.textContent).toBe("90%");
    expect(readerSettingsStore.get().readerScale).toBe(90);
    expect(changeEvents).toHaveLength(1);
    expect(changeEvents[0]).toEqual({
      prefs: expect.objectContaining({ readerScale: 90 }),
    });

    // Inc back to 100 -> 110
    readerSizeInc.click();
    readerSizeInc.click();
    expect(readerSizeLabel.textContent).toBe("110%");
    expect(readerSettingsStore.get().readerScale).toBe(110);

    // Test minimum bound clamping (70)
    for (let i = 0; i < 15; i++) {
      readerSizeDec.click();
    }
    expect(readerSizeLabel.textContent).toBe(`${MIN_READER_SCALE}%`);
    expect(readerSettingsStore.get().readerScale).toBe(MIN_READER_SCALE);

    // Test maximum bound clamping (160)
    for (let i = 0; i < 20; i++) {
      readerSizeInc.click();
    }
    expect(readerSizeLabel.textContent).toBe(`${MAX_READER_SCALE}%`);
    expect(readerSettingsStore.get().readerScale).toBe(MAX_READER_SCALE);
  });

  test("stepper dec/inc adjusts dict text size within bounds [70, 140]", () => {
    const { dictSizeDec, dictSizeInc, dictSizeLabel } = createSettingsElement();

    dictSizeDec.click();
    expect(dictSizeLabel.textContent).toBe("90%");
    expect(readerSettingsStore.get().dictScale).toBe(90);

    // Clamp min
    for (let i = 0; i < 10; i++) dictSizeDec.click();
    expect(dictSizeLabel.textContent).toBe(`${MIN_DICT_SCALE}%`);
    expect(readerSettingsStore.get().dictScale).toBe(MIN_DICT_SCALE);

    // Clamp max
    for (let i = 0; i < 20; i++) dictSizeInc.click();
    expect(dictSizeLabel.textContent).toBe(`${MAX_DICT_SCALE}%`);
    expect(readerSettingsStore.get().dictScale).toBe(MAX_DICT_SCALE);
  });

  test("toggles macra and gutter update store and dispatch events", () => {
    const { el, toggleMacra, toggleGutter } = createSettingsElement();

    const changeEvents: unknown[] = [];
    el.addEventListener("reader-settings-change", (e: Event) => {
      changeEvents.push((e as CustomEvent).detail);
    });

    toggleMacra.checked = false;
    toggleMacra.dispatchEvent(new Event("change"));
    expect(readerSettingsStore.get().showMacra).toBe(false);

    toggleGutter.checked = false;
    toggleGutter.dispatchEvent(new Event("change"));
    expect(readerSettingsStore.get().showGutter).toBe(false);

    expect(changeEvents).toHaveLength(2);
  });

  test("dropdown changes update fontFamily and lineHeight in store", () => {
    const { fontSelect, lineHeightSelect } = createSettingsElement();

    fontSelect.value = "sans";
    fontSelect.dispatchEvent(new Event("change"));
    expect(readerSettingsStore.get().fontFamily).toBe("sans");

    lineHeightSelect.value = "relaxed";
    lineHeightSelect.dispatchEvent(new Event("change"));
    expect(readerSettingsStore.get().lineHeight).toBe("relaxed");
  });

  test("reset button restores defaults", () => {
    const {
      resetBtn,
      readerSizeLabel,
      dictSizeLabel,
      fontSelect,
      readerSizeInc,
    } = createSettingsElement();

    readerSizeInc.click();
    expect(readerSizeLabel.textContent).toBe("110%");

    resetBtn.click();
    expect(readerSizeLabel.textContent).toBe("100%");
    expect(dictSizeLabel.textContent).toBe("100%");
    expect(fontSelect.value).toBe("serif");
    expect(readerSettingsStore.get()).toEqual(DEFAULT_READER_PREFS);
  });

  test("hooks up dialog trigger button via setupModalDialog", () => {
    const { dialog, triggerBtn } = createSettingsElement();

    const showModalSpy = jest.fn();
    dialog.showModal = showModalSpy;

    triggerBtn.click();
    expect(showModalSpy).toHaveBeenCalled();
  });
});
