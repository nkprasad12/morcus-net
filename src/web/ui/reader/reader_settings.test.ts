/**
 * @jest-environment jsdom
 */
import {
  DEFAULT_READER_PREFS,
  MAX_DICT_SCALE,
  MIN_DICT_SCALE,
  MorcusReaderSettings,
  READER_SETTINGS_KEY,
  getWorkMacra,
  macronStorageKey,
  parseReaderPreferences,
  readerSettingsStore,
  removeWorkMacra,
  setWorkMacra,
  SWIPE_NAV_KEY,
} from "@/web/ui/reader/reader_settings.client";
import {
  OPEN_APPEARANCE_EVENT,
  type OpenAppearanceDetail,
} from "@/web/ui/shell/appearance_events.common";

describe("Reader preferences validation & schema", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("macronStorageKey", () => {
    it("generates exact V1-compatible storage keys", () => {
      expect(macronStorageKey("dbg")).toBe("macronButton-dbg");
      expect(macronStorageKey("phi0690.phi003.perseus-lat2")).toBe(
        "macronButton-phi0690.phi003.perseus-lat2"
      );
    });
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
    const valid = { dictScale: 90, showGutter: false };
    expect(parseReaderPreferences(JSON.stringify(valid))).toEqual({
      ...valid,
      showMacra: DEFAULT_READER_PREFS.showMacra,
    });
  });

  it("ignores showMacra in global settings JSON because macra is scoped per work", () => {
    const raw = JSON.stringify({ dictScale: 110, showMacra: false });
    expect(parseReaderPreferences(raw).showMacra).toBe(true);
  });

  it("drops legacy typography fields now owned by the Appearance menu", () => {
    const legacy = {
      readerScale: 120,
      fontFamily: "serif",
      lineHeight: "compact",
      dictScale: 90,
    };
    expect(parseReaderPreferences(JSON.stringify(legacy))).toEqual({
      ...DEFAULT_READER_PREFS,
      dictScale: 90,
    });
  });

  it("persists only dictScale and showGutter to localStorage", () => {
    readerSettingsStore.set({
      ...DEFAULT_READER_PREFS,
      showMacra: false,
      dictScale: 120,
    });
    const stored = JSON.parse(localStorage.getItem(READER_SETTINGS_KEY)!);
    expect(stored).toEqual({ dictScale: 120, showGutter: true });
  });

  it("update merges a patch into the stored preferences", () => {
    readerSettingsStore.set({ ...DEFAULT_READER_PREFS, dictScale: 80 });
    expect(readerSettingsStore.update({ showGutter: false })).toEqual({
      ...DEFAULT_READER_PREFS,
      dictScale: 80,
      showGutter: false,
    });
    expect(readerSettingsStore.get()).toEqual({
      ...DEFAULT_READER_PREFS,
      dictScale: 80,
      showGutter: false,
    });
  });

  it("partially parses valid fields and falls back to defaults for missing ones", () => {
    expect(parseReaderPreferences(JSON.stringify({ dictScale: 80 }))).toEqual({
      ...DEFAULT_READER_PREFS,
      dictScale: 80,
    });
  });

  it("drops corrupt or invalid values and preserves defaults", () => {
    const corrupt = {
      dictScale: null,
      showMacra: "not_a_boolean",
      showGutter: 123,
      extraField: "ignored",
    };
    expect(parseReaderPreferences(JSON.stringify(corrupt))).toEqual(
      DEFAULT_READER_PREFS
    );
  });

  it("preserves valid fields even when sibling fields are corrupt", () => {
    const mixed = { dictScale: "bad", showGutter: false };
    expect(parseReaderPreferences(JSON.stringify(mixed))).toEqual({
      ...DEFAULT_READER_PREFS,
      showGutter: false,
    });
  });
});

describe("per-work macra storage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default showMacra (true) when no per-work preference is set or workId is null", () => {
    expect(getWorkMacra("vergil/aeneid")).toBe(true);
    expect(getWorkMacra(null)).toBe(true);
    expect(getWorkMacra(undefined)).toBe(true);
  });

  it("persists per-work macra preference to macronButton-${workId}", () => {
    setWorkMacra("vergil/aeneid", false);
    expect(localStorage.getItem("macronButton-vergil/aeneid")).toBe("false");
    expect(getWorkMacra("vergil/aeneid")).toBe(false);

    // Other works remain unaffected (defaults to true)
    expect(getWorkMacra("ovid/amores")).toBe(true);
  });

  it("reads V1-format string boolean values seamlessly", () => {
    localStorage.setItem("macronButton-caesar/dbg", "false");
    expect(getWorkMacra("caesar/dbg")).toBe(false);

    localStorage.setItem("macronButton-catullus", "true");
    expect(getWorkMacra("catullus")).toBe(true);
  });

  it("removes per-work macra override and restores default (true)", () => {
    setWorkMacra("vergil/aeneid", false);
    expect(getWorkMacra("vergil/aeneid")).toBe(false);

    removeWorkMacra("vergil/aeneid");
    expect(localStorage.getItem("macronButton-vergil/aeneid")).toBeNull();
    expect(getWorkMacra("vergil/aeneid")).toBe(true);
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

  function createSettingsElement(attrs: { workId?: string } = {}): {
    el: MorcusReaderSettings;
    popover: HTMLDialogElement;
    closeBtn: HTMLButtonElement;
    triggerBtn: HTMLButtonElement;
    dictSizeDec: HTMLButtonElement;
    dictSizeInc: HTMLButtonElement;
    dictSizeLabel: HTMLElement;
    toggleMacra: HTMLInputElement;
    toggleGutter: HTMLInputElement;
    appearanceLink: HTMLButtonElement;
    resetBtn: HTMLButtonElement;
  } {
    const workAttr = attrs.workId ? ` data-work="${attrs.workId}"` : "";
    container.innerHTML = `
      <button type="button" id="reader-settings-btn" aria-expanded="false" aria-controls="reader-settings-popover">Settings</button>
      <morcus-reader-settings${workAttr}>
        <dialog class="reader-settings-popover" id="reader-settings-popover">
          <button type="button" id="reader-settings-close-btn" data-dialog-close>&times;</button>
          <button type="button" id="reader-appearance-link" class="appearance-link">Text appearance</button>

          <button type="button" id="dict-size-dec">-</button>
          <span id="dict-size-label">100%</span>
          <button type="button" id="dict-size-inc">+</button>

          <input type="checkbox" id="toggle-macra" checked />
          <input type="checkbox" id="toggle-gutter" checked />

          <button type="button" id="reader-settings-reset-btn">Reset</button>
        </dialog>
      </morcus-reader-settings>
    `;

    const $ = <T extends HTMLElement>(sel: string) =>
      container.querySelector<T>(sel)!;
    return {
      el: $<MorcusReaderSettings>("morcus-reader-settings"),
      popover: $<HTMLDialogElement>("#reader-settings-popover"),
      closeBtn: $<HTMLButtonElement>("#reader-settings-close-btn"),
      triggerBtn: $<HTMLButtonElement>("#reader-settings-btn"),
      dictSizeDec: $<HTMLButtonElement>("#dict-size-dec"),
      dictSizeInc: $<HTMLButtonElement>("#dict-size-inc"),
      dictSizeLabel: $("#dict-size-label"),
      toggleMacra: $<HTMLInputElement>("#toggle-macra"),
      toggleGutter: $<HTMLInputElement>("#toggle-gutter"),
      appearanceLink: $<HTMLButtonElement>("#reader-appearance-link"),
      resetBtn: $<HTMLButtonElement>("#reader-settings-reset-btn"),
    };
  }

  test("hydrates UI with defaults when localStorage is empty", () => {
    const { dictSizeLabel, toggleMacra, toggleGutter } =
      createSettingsElement();

    expect(dictSizeLabel.textContent).toBe("85%");
    expect(toggleMacra.checked).toBe(true);
    expect(toggleGutter.checked).toBe(true);
  });

  test("hydrates UI with saved settings from localStorage", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({ dictScale: 90, showGutter: false })
    );
    setWorkMacra("phi0690", false);

    const { dictSizeLabel, toggleMacra, toggleGutter } = createSettingsElement({
      workId: "phi0690",
    });

    expect(dictSizeLabel.textContent).toBe("90%");
    expect(toggleMacra.checked).toBe(false);
    expect(toggleGutter.checked).toBe(false);
  });

  test("hydrates safely when localStorage contains corrupt data", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({ dictScale: 130, showGutter: "corrupt" })
    );

    const { dictSizeLabel, toggleGutter } = createSettingsElement();

    expect(dictSizeLabel.textContent).toBe("130%");
    expect(toggleGutter.checked).toBe(true);
  });

  test("clamps and snaps a saved size to the stepper's range and steps", () => {
    for (const [saved, shown] of [
      [500, "130%"],
      [10, "60%"],
      [87, "85%"],
    ] as const) {
      localStorage.setItem(
        READER_SETTINGS_KEY,
        JSON.stringify({ dictScale: saved })
      );
      expect(readerSettingsStore.get().dictScale).toBe(parseInt(shown));
      const { dictSizeLabel } = createSettingsElement();
      expect(dictSizeLabel.textContent).toBe(shown);
    }
  });

  test("hydrates safely when localStorage is not JSON", () => {
    localStorage.setItem(READER_SETTINGS_KEY, "{not json");

    const { el, dictSizeLabel } = createSettingsElement();

    expect(dictSizeLabel.textContent).toBe("85%");
    expect(el.getPreferences()).toEqual(DEFAULT_READER_PREFS);
  });

  test("stepper dec/inc adjusts the side panel size in 5% steps within [60, 130]", () => {
    const { el, dictSizeDec, dictSizeInc, dictSizeLabel } =
      createSettingsElement();

    const changeEvents: unknown[] = [];
    el.addEventListener("reader-settings-change", (e: Event) => {
      changeEvents.push((e as CustomEvent).detail);
    });

    dictSizeDec.click();
    expect(dictSizeLabel.textContent).toBe("80%");
    expect(readerSettingsStore.get().dictScale).toBe(80);
    expect(changeEvents).toEqual([
      { prefs: expect.objectContaining({ dictScale: 80 }) },
    ]);

    // Clamp min, where the decrease button is disabled
    for (let i = 0; i < 10; i++) dictSizeDec.click();
    expect(dictSizeLabel.textContent).toBe(`${MIN_DICT_SCALE}%`);
    expect(readerSettingsStore.get().dictScale).toBe(MIN_DICT_SCALE);
    expect(dictSizeDec.disabled).toBe(true);
    expect(dictSizeInc.disabled).toBe(false);

    // Clamp max
    for (let i = 0; i < 20; i++) dictSizeInc.click();
    expect(dictSizeLabel.textContent).toBe(`${MAX_DICT_SCALE}%`);
    expect(readerSettingsStore.get().dictScale).toBe(MAX_DICT_SCALE);
    expect(dictSizeInc.disabled).toBe(true);
  });

  test("toggles macra and gutter update store and dispatch events", () => {
    const { el, toggleMacra, toggleGutter } = createSettingsElement({
      workId: "phi0690",
    });

    const changeEvents: unknown[] = [];
    el.addEventListener("reader-settings-change", (e: Event) => {
      changeEvents.push((e as CustomEvent).detail);
    });

    toggleMacra.checked = false;
    toggleMacra.dispatchEvent(new Event("change"));
    expect(getWorkMacra("phi0690")).toBe(false);

    toggleGutter.checked = false;
    toggleGutter.dispatchEvent(new Event("change"));
    expect(readerSettingsStore.get().showGutter).toBe(false);

    expect(changeEvents).toHaveLength(2);
  });

  test("reset button restores defaults", () => {
    const { resetBtn, dictSizeLabel, dictSizeInc, toggleGutter } =
      createSettingsElement();

    dictSizeInc.click();
    toggleGutter.checked = false;
    toggleGutter.dispatchEvent(new Event("change"));
    expect(dictSizeLabel.textContent).toBe("90%");

    resetBtn.click();
    expect(dictSizeLabel.textContent).toBe("85%");
    expect(toggleGutter.checked).toBe(true);
    expect(readerSettingsStore.get()).toEqual(DEFAULT_READER_PREFS);
  });

  test("appearance link closes the dialog and opens the Appearance menu", () => {
    const { el, appearanceLink } = createSettingsElement();
    const opened = jest.fn((_e: Event) => {
      // Closed first, so the two modal dialogs never overlap.
      expect(el.isOpen()).toBe(false);
    });
    document.addEventListener(OPEN_APPEARANCE_EVENT, opened);
    try {
      el.open();
      expect(el.isOpen()).toBe(true);

      appearanceLink.click();

      expect(el.isOpen()).toBe(false);
      expect(opened).toHaveBeenCalledTimes(1);
      const event = opened.mock.calls[0][0];
      expect(event).toBeInstanceOf(CustomEvent);
      // Anchored to the sticky-bar trigger, which stays on screen on phones.
      expect((event as CustomEvent<OpenAppearanceDetail>).detail.anchor).toBe(
        document.getElementById("reader-settings-btn")
      );
    } finally {
      document.removeEventListener(OPEN_APPEARANCE_EVENT, opened);
    }
  });

  test("appearance link does not change reader preferences", () => {
    const { el, appearanceLink } = createSettingsElement();
    const changes = jest.fn();
    el.addEventListener("reader-settings-change", changes);

    appearanceLink.click();

    expect(changes).not.toHaveBeenCalled();
    expect(localStorage.getItem(READER_SETTINGS_KEY)).toBeNull();
  });

  test("trigger opens the modal dialog and syncs aria-expanded", () => {
    const { el, popover, triggerBtn } = createSettingsElement();

    expect(el.isOpen()).toBe(false);
    expect(popover.open).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");

    triggerBtn.click();
    expect(el.isOpen()).toBe(true);
    // jsdom has no showModal(); setupModalDialog falls back to `open`.
    expect(popover.open).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");

    el.close();
    expect(el.isOpen()).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
  });

  test("toggle() opens and closes (the A shortcut)", () => {
    const { el } = createSettingsElement();
    el.toggle();
    expect(el.isOpen()).toBe(true);
    el.toggle();
    expect(el.isOpen()).toBe(false);
  });

  test("closes via the close button, a backdrop click, and a native close (Escape)", () => {
    const { el, popover, closeBtn, triggerBtn } = createSettingsElement();
    popover.getBoundingClientRect = () =>
      ({ top: 60, left: 500, width: 320, height: 300 } as DOMRect);

    // 1. Close button
    el.open();
    closeBtn.click();
    expect(el.isOpen()).toBe(false);

    // 2. A click on the ::backdrop targets the dialog, outside its box; one
    // inside it doesn't close.
    el.open();
    popover.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 600, clientY: 100 })
    );
    expect(el.isOpen()).toBe(true);
    popover.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 })
    );
    expect(el.isOpen()).toBe(false);

    // 3. Escape: the browser closes the dialog and fires `close`.
    el.open();
    popover.removeAttribute("open");
    popover.dispatchEvent(new Event("close"));
    expect(el.isOpen()).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
  });

  test("positions the dialog under its trigger with right edges aligned, and a caret", () => {
    const { el, popover, triggerBtn } = createSettingsElement();

    triggerBtn.getBoundingClientRect = () =>
      ({
        top: 20,
        bottom: 50,
        left: 800,
        right: 840,
        width: 40,
        height: 30,
      } as DOMRect);

    Object.defineProperty(popover, "offsetWidth", {
      value: 320,
      configurable: true,
    });

    el.open();

    expect(popover.style.top).toBe("58px"); // bottom (50) + 8
    expect(popover.style.left).toBe("520px"); // right (840) - 320
    expect(popover.style.getPropertyValue("--caret-left")).toBe("300px");
  });

  test("follows its trigger on resize while open, and stops once closed", () => {
    const { el, popover, triggerBtn } = createSettingsElement();
    let bottom = 50;
    triggerBtn.getBoundingClientRect = () =>
      ({ top: 20, bottom, left: 800, right: 840, width: 40 } as DOMRect);

    el.open();
    expect(popover.style.top).toBe("58px");

    bottom = 100;
    window.dispatchEvent(new Event("resize"));
    expect(popover.style.top).toBe("108px");

    el.close();
    bottom = 200;
    window.dispatchEvent(new Event("resize"));
    expect(popover.style.top).toBe("108px");
  });

  test("closes the dialog when disconnected", () => {
    const { el, popover, triggerBtn } = createSettingsElement();
    el.open();
    el.remove();
    expect(popover.open).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
  });

  test("scopes macra toggle to workId and persists to macronButton-${workId}", () => {
    const { el, toggleMacra } = createSettingsElement({
      workId: "phi0690.phi003.perseus-lat2",
    });

    expect(el.getWorkId()).toBe("phi0690.phi003.perseus-lat2");
    expect(toggleMacra.checked).toBe(true);

    // Toggle off
    toggleMacra.checked = false;
    toggleMacra.dispatchEvent(new Event("change"));

    expect(
      localStorage.getItem("macronButton-phi0690.phi003.perseus-lat2")
    ).toBe("false");
    expect(getWorkMacra("phi0690.phi003.perseus-lat2")).toBe(false);

    // Other works unaffected
    expect(getWorkMacra("other-work")).toBe(true);
  });

  test("reset button clears per-work macra preference in localStorage", () => {
    setWorkMacra("vergil/aeneid", false);
    expect(localStorage.getItem("macronButton-vergil/aeneid")).toBe("false");

    const { toggleMacra, resetBtn } = createSettingsElement({
      workId: "vergil/aeneid",
    });

    expect(toggleMacra.checked).toBe(false);

    resetBtn.click();
    expect(toggleMacra.checked).toBe(true);
    expect(localStorage.getItem("macronButton-vergil/aeneid")).toBeNull();
    expect(getWorkMacra("vergil/aeneid")).toBe(true);
  });

  test("inherits workId from parent morcus-reader-view", () => {
    container.innerHTML = `
      <morcus-reader-view data-work="parent-work">
        <morcus-reader-settings>
          <dialog id="reader-settings-popover">
            <input type="checkbox" id="toggle-macra" checked />
          </dialog>
        </morcus-reader-settings>
      </morcus-reader-view>
    `;

    const el = container.querySelector<MorcusReaderSettings>(
      "morcus-reader-settings"
    )!;
    expect(el.getWorkId()).toBe("parent-work");
  });

  describe("non-macronized editions (omitted toggle-macra)", () => {
    test("mounts and functions cleanly when toggle-macra is omitted from DOM", () => {
      container.innerHTML = `
        <button type="button" id="reader-settings-btn">Settings</button>
        <morcus-reader-settings data-work="caesar_dbg">
          <dialog id="reader-settings-popover">
            <button type="button" id="dict-size-dec">-</button>
            <span id="dict-size-label">100%</span>
            <button type="button" id="dict-size-inc">+</button>
            <input type="checkbox" id="toggle-gutter" checked />
            <button type="button" id="reader-settings-reset-btn">Reset</button>
          </dialog>
        </morcus-reader-settings>
      `;

      const el = container.querySelector<MorcusReaderSettings>(
        "morcus-reader-settings"
      )!;
      const resetBtn = container.querySelector<HTMLButtonElement>(
        "#reader-settings-reset-btn"
      )!;
      const dictSizeInc =
        container.querySelector<HTMLButtonElement>("#dict-size-inc")!;

      // Interactions on other controls work normally
      dictSizeInc.click();
      expect(el.getPreferences().dictScale).toBe(90);

      // Reset works cleanly
      resetBtn.click();
      expect(el.getPreferences().dictScale).toBe(
        DEFAULT_READER_PREFS.dictScale
      );
    });
  });
});

describe("MorcusReaderSettings swipe navigation toggle", () => {
  function create() {
    document.body.innerHTML = `
      <morcus-reader-settings>
        <dialog id="reader-settings-popover">
          <input type="checkbox" id="toggle-swipe-nav" checked />
          <button type="button" id="reader-settings-reset-btn">Reset</button>
        </dialog>
      </morcus-reader-settings>`;
    const $ = <T extends HTMLElement>(sel: string) =>
      document.querySelector<T>(sel)!;
    return {
      swipe: $<HTMLInputElement>("#toggle-swipe-nav"),
      resetBtn: $<HTMLButtonElement>("#reader-settings-reset-btn"),
    };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => (document.body.innerHTML = ""));

  it("hydrates from V1's stored key and format", () => {
    localStorage.setItem(SWIPE_NAV_KEY, '{"w":false}');
    const { swipe } = create();
    expect(swipe.checked).toBe(false);
  });

  it("persists changes", () => {
    const { swipe } = create();
    swipe.click();
    expect(localStorage.getItem(SWIPE_NAV_KEY)).toBe("false");
  });

  it("restores the default on reset", () => {
    localStorage.setItem(SWIPE_NAV_KEY, "false");
    const { swipe, resetBtn } = create();
    expect(swipe.checked).toBe(false);
    resetBtn.click();
    expect(swipe.checked).toBe(true);
    expect(localStorage.getItem(SWIPE_NAV_KEY)).toBeNull();
  });
});
