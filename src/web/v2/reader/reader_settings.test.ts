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
  getWorkMacra,
  macronStorageKey,
  parseReaderPreferences,
  readerSettingsStore,
  removeWorkMacra,
  setWorkMacra,
} from "@/web/v2/reader/reader_settings.client";

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
    const valid = {
      readerScale: 120,
      dictScale: 90,
      showGutter: false,
      fontFamily: "sans" as const,
      lineHeight: "compact" as const,
    };
    expect(parseReaderPreferences(JSON.stringify(valid))).toEqual({
      ...valid,
      showMacra: DEFAULT_READER_PREFS.showMacra,
    });
  });

  it("ignores showMacra in global settings JSON because macra is scoped per work", () => {
    const raw = JSON.stringify({
      readerScale: 110,
      showMacra: false,
    });
    expect(parseReaderPreferences(raw).showMacra).toBe(true);
  });

  it("strips showMacra when persisting readerSettingsStore to localStorage", () => {
    readerSettingsStore.set({
      ...DEFAULT_READER_PREFS,
      showMacra: false,
    });
    const stored = JSON.parse(localStorage.getItem(READER_SETTINGS_KEY)!);
    expect(stored.showMacra).toBeUndefined();
    expect(stored.readerScale).toBe(100);
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
    popover: HTMLElement;
    dialog: HTMLElement;
    backdrop: HTMLElement;
    closeBtn: HTMLButtonElement;
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
    const workAttr = attrs.workId ? ` data-work="${attrs.workId}"` : "";
    container.innerHTML = `
      <button type="button" id="reader-settings-btn" aria-expanded="false" aria-controls="reader-settings-popover">Settings</button>
      <div id="reader-settings-backdrop" class="reader-settings-backdrop" hidden></div>
      <morcus-reader-settings${workAttr}>
        <div class="reader-settings-popover" id="reader-settings-popover" role="dialog" hidden>
          <button type="button" id="reader-settings-close-btn">&times;</button>
          <button type="button" id="reader-size-dec">-</button>
          <span id="reader-size-label">100%</span>
          <button type="button" id="reader-size-inc">+</button>

          <button type="button" id="dict-size-dec">-</button>
          <span id="dict-size-label">100%</span>
          <button type="button" id="dict-size-inc">+</button>

          <input type="checkbox" id="toggle-macra" checked />
          <input type="checkbox" id="toggle-gutter" checked />

          <select id="font-select">
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
          </select>

          <select id="line-height-select">
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="relaxed">Relaxed</option>
          </select>

          <button type="button" id="reader-settings-reset-btn">Reset</button>
        </div>
      </morcus-reader-settings>
    `;

    const el = container.querySelector<MorcusReaderSettings>(
      "morcus-reader-settings"
    )!;
    const popover = container.querySelector<HTMLElement>(
      "#reader-settings-popover"
    )!;
    return {
      el,
      popover,
      dialog: popover,
      backdrop: container.querySelector<HTMLElement>(
        "#reader-settings-backdrop"
      )!,
      closeBtn: container.querySelector<HTMLButtonElement>(
        "#reader-settings-close-btn"
      )!,
      triggerBtn: container.querySelector<HTMLButtonElement>(
        "#reader-settings-btn"
      )!,
      readerSizeDec:
        container.querySelector<HTMLButtonElement>("#reader-size-dec")!,
      readerSizeInc:
        container.querySelector<HTMLButtonElement>("#reader-size-inc")!,
      readerSizeLabel:
        container.querySelector<HTMLElement>("#reader-size-label")!,
      dictSizeDec:
        container.querySelector<HTMLButtonElement>("#dict-size-dec")!,
      dictSizeInc:
        container.querySelector<HTMLButtonElement>("#dict-size-inc")!,
      dictSizeLabel: container.querySelector<HTMLElement>("#dict-size-label")!,
      toggleMacra: container.querySelector<HTMLInputElement>("#toggle-macra")!,
      toggleGutter:
        container.querySelector<HTMLInputElement>("#toggle-gutter")!,
      fontSelect: container.querySelector<HTMLSelectElement>("#font-select")!,
      lineHeightSelect: container.querySelector<HTMLSelectElement>(
        "#line-height-select"
      )!,
      resetBtn: container.querySelector<HTMLButtonElement>(
        "#reader-settings-reset-btn"
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
        showGutter: false,
        fontFamily: "sans",
        lineHeight: "compact",
      })
    );
    setWorkMacra("phi0690", false);

    const {
      readerSizeLabel,
      dictSizeLabel,
      toggleMacra,
      toggleGutter,
      fontSelect,
      lineHeightSelect,
    } = createSettingsElement({ workId: "phi0690" });

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

  test("toggles popover open and closed on trigger button click", () => {
    const { el, popover, backdrop, triggerBtn } = createSettingsElement();

    expect(el.isOpen()).toBe(false);
    expect(popover.hasAttribute("hidden")).toBe(true);
    expect(backdrop.hasAttribute("hidden")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");

    // Click trigger opens popover
    triggerBtn.click();
    expect(el.isOpen()).toBe(true);
    expect(popover.hasAttribute("hidden")).toBe(false);
    expect(backdrop.hasAttribute("hidden")).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");

    // Click trigger again closes popover
    triggerBtn.click();
    expect(el.isOpen()).toBe(false);
    expect(popover.hasAttribute("hidden")).toBe(true);
    expect(backdrop.hasAttribute("hidden")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
  });

  test("dismisses popover via close button, backdrop, Escape key, and outside click", () => {
    const { el, closeBtn, backdrop, triggerBtn } = createSettingsElement();

    // 1. Close button dismisses and focuses trigger
    el.open();
    expect(el.isOpen()).toBe(true);
    closeBtn.click();
    expect(el.isOpen()).toBe(false);
    expect(document.activeElement).toBe(triggerBtn);

    // 2. Backdrop click dismisses
    el.open();
    expect(el.isOpen()).toBe(true);
    backdrop.click();
    expect(el.isOpen()).toBe(false);

    // 3. Escape key dismisses and focuses trigger
    el.open();
    expect(el.isOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(el.isOpen()).toBe(false);
    expect(document.activeElement).toBe(triggerBtn);

    // 4. Outside document click dismisses
    el.open();
    expect(el.isOpen()).toBe(true);
    document.body.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    expect(el.isOpen()).toBe(false);
  });

  test("anchors popover and computes --caret-left offset in updatePosition", () => {
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

    expect(popover.style.position).toBe("fixed");
    expect(popover.style.top).toBe("58px"); // bottom (50) + 8
    expect(popover.style.getPropertyValue("--caret-left")).toBeTruthy();
  });

  test("cycles keyboard focus with Tab and Shift+Tab within popover and moves initial focus to close button", () => {
    const { el, closeBtn, resetBtn, triggerBtn } = createSettingsElement();
    el.open();

    // Initial focus lands on closeBtn
    expect(document.activeElement).toBe(closeBtn);

    // If focus is outside popover (e.g. On triggerBtn), pressing forward Tab wraps to first focusable
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);
    const outsideTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(outsideTab);
    expect(document.activeElement).toBe(closeBtn);

    // Focus last focusable (resetBtn) and press Tab -> should wrap to first (closeBtn)
    resetBtn.focus();
    expect(document.activeElement).toBe(resetBtn);

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(closeBtn);

    // Focus first focusable (closeBtn) and press Shift+Tab -> should wrap to last (resetBtn)
    closeBtn.focus();
    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(resetBtn);
  });

  test("enforces mutual exclusion by closing TOC drawer when settings popover opens", () => {
    const { el } = createSettingsElement();
    const tocDrawer = document.createElement("div");
    tocDrawer.id = "reader-toc-drawer";
    const tocBackdrop = document.createElement("div");
    tocBackdrop.id = "reader-toc-backdrop";
    const tocBtn = document.createElement("button");
    tocBtn.id = "reader-toc-btn";
    tocBtn.setAttribute("aria-expanded", "true");
    document.body.appendChild(tocDrawer);
    document.body.appendChild(tocBackdrop);
    document.body.appendChild(tocBtn);

    // TOC is initially open
    expect(tocDrawer.hasAttribute("hidden")).toBe(false);

    // Opening settings closes TOC
    el.open();
    expect(el.isOpen()).toBe(true);
    expect(tocDrawer.hasAttribute("hidden")).toBe(true);

    tocDrawer.remove();
    tocBackdrop.remove();
    tocBtn.remove();
  });

  test("enforces mutual exclusion by invoking getTocController().close() when hosted in morcus-reader-view", () => {
    const parent = document.createElement("morcus-reader-view");
    const closeSpy = jest.fn();
    (parent as any).getTocController = () => ({
      isOpen: () => true,
      close: closeSpy,
    });
    const { el } = createSettingsElement();
    parent.appendChild(el);
    document.body.appendChild(parent);

    el.open();
    expect(closeSpy).toHaveBeenCalled();

    parent.remove();
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
          <div id="reader-settings-popover" hidden>
            <input type="checkbox" id="toggle-macra" checked />
          </div>
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
          <div id="reader-settings-popover" hidden>
            <button type="button" id="reader-size-dec">-</button>
            <span id="reader-size-label">100%</span>
            <button type="button" id="reader-size-inc">+</button>
            <input type="checkbox" id="toggle-gutter" checked />
            <button type="button" id="reader-settings-reset-btn">Reset</button>
          </div>
        </morcus-reader-settings>
      `;

      const el = container.querySelector<MorcusReaderSettings>(
        "morcus-reader-settings"
      )!;
      const resetBtn = container.querySelector<HTMLButtonElement>(
        "#reader-settings-reset-btn"
      )!;
      const readerSizeInc =
        container.querySelector<HTMLButtonElement>("#reader-size-inc")!;

      // Interactions on other controls work normally
      readerSizeInc.click();
      expect(el.getPreferences().readerScale).toBe(110);

      // Reset works cleanly
      resetBtn.click();
      expect(el.getPreferences().readerScale).toBe(100);
    });
  });
});
