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
import { OPEN_APPEARANCE_EVENT } from "@/web/ui/shell/appearance_events.common";

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
    popover: HTMLElement;
    backdrop: HTMLElement;
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
      <div id="reader-settings-backdrop" class="reader-settings-backdrop" hidden></div>
      <morcus-reader-settings${workAttr}>
        <div class="reader-settings-popover" id="reader-settings-popover" role="dialog" hidden>
          <button type="button" id="reader-settings-close-btn">&times;</button>
          <button type="button" id="reader-appearance-link" class="appearance-link">Text appearance</button>

          <button type="button" id="dict-size-dec">-</button>
          <span id="dict-size-label">100%</span>
          <button type="button" id="dict-size-inc">+</button>

          <input type="checkbox" id="toggle-macra" checked />
          <input type="checkbox" id="toggle-gutter" checked />

          <button type="button" id="reader-settings-reset-btn">Reset</button>
        </div>
      </morcus-reader-settings>
    `;

    const $ = <T extends HTMLElement>(sel: string) =>
      container.querySelector<T>(sel)!;
    return {
      el: $<MorcusReaderSettings>("morcus-reader-settings"),
      popover: $("#reader-settings-popover"),
      backdrop: $("#reader-settings-backdrop"),
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

  test("appearance link closes the popover and opens the Appearance menu", () => {
    const { el, appearanceLink } = createSettingsElement();
    const opened = jest.fn();
    const docClick = jest.fn();
    document.addEventListener(OPEN_APPEARANCE_EVENT, opened);
    document.addEventListener("click", docClick);
    try {
      el.open();
      expect(el.isOpen()).toBe(true);

      appearanceLink.click();

      expect(el.isOpen()).toBe(false);
      expect(opened).toHaveBeenCalledTimes(1);
      expect(opened.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
      // The click must not reach document-level outside-click handlers, or
      // it would immediately dismiss the menu it just opened.
      expect(docClick).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener(OPEN_APPEARANCE_EVENT, opened);
      document.removeEventListener("click", docClick);
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

  test("enforces bidirectional mutual exclusion with ReaderTocController via reader-chrome popover group", () => {
    const { el } = createSettingsElement();
    const tocDrawer = document.createElement("div");
    tocDrawer.id = "reader-toc-drawer";
    tocDrawer.setAttribute("hidden", "");
    const tocBackdrop = document.createElement("div");
    tocBackdrop.id = "reader-toc-backdrop";
    tocBackdrop.setAttribute("hidden", "");
    const tocBtn = document.createElement("button");
    tocBtn.id = "reader-toc-btn";
    tocBtn.setAttribute("aria-expanded", "false");
    container.appendChild(tocDrawer);
    container.appendChild(tocBackdrop);
    container.appendChild(tocBtn);

    const { ReaderTocController } = jest.requireActual<
      typeof import("@/web/ui/reader/reader_toc.client")
    >("@/web/ui/reader/reader_toc.client");
    const toc = new ReaderTocController({ root: container });
    toc.connect();

    // 1. Open TOC drawer -> TOC is open
    toc.open();
    expect(toc.isOpen()).toBe(true);
    expect(tocDrawer.hasAttribute("hidden")).toBe(false);

    // 2. Opening settings closes TOC via morcus:popover-will-open ("reader-chrome")
    el.open();
    expect(el.isOpen()).toBe(true);
    expect(toc.isOpen()).toBe(false);
    expect(tocDrawer.hasAttribute("hidden")).toBe(true);
    expect(tocBtn.getAttribute("aria-expanded")).toBe("false");

    // 3. Re-opening TOC closes settings via morcus:popover-will-open ("reader-chrome")
    toc.open();
    expect(toc.isOpen()).toBe(true);
    expect(el.isOpen()).toBe(false);

    toc.dispose();
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
            <button type="button" id="dict-size-dec">-</button>
            <span id="dict-size-label">100%</span>
            <button type="button" id="dict-size-inc">+</button>
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
        <div id="reader-settings-popover" hidden>
          <input type="checkbox" id="toggle-swipe-nav" checked />
          <button type="button" id="reader-settings-reset-btn">Reset</button>
        </div>
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
