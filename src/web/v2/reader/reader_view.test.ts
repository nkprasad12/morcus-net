/**
 * @jest-environment jsdom
 */
import {
  DEFAULT_READER_PREFS,
  MorcusReaderView,
  READER_SETTINGS_KEY,
  parseReaderPreferences,
} from "@/web/v2/reader/reader_view.client";

import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

describe("MorcusReaderView client tokenization & macra handling", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function createReaderView(innerPassageHtml: string): MorcusReaderView {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="v2-reader-split-layout v2-reader-layout-empty">
        <section class="v2-reader-text-panel">
          <div class="v2-reader-text-card">
            <article class="v2-reader-passage" id="v2-reader-passage">
              ${innerPassageHtml}
            </article>
          </div>
        </section>
        <aside class="v2-reader-dict-panel">
          <div class="v2-reader-sheet-bar">
            <div class="v2-reader-sheet-teaser">
              <span class="v2-reader-sheet-label">Tap any word</span>
            </div>
          </div>
          <iframe id="v2-dict-frame" src="/v2/dicts?embedded=1"></iframe>
        </aside>
        <morcus-reader-settings>
          <dialog id="v2-reader-settings-dialog">
            <input type="checkbox" id="v2-toggle-macra" checked />
            <button id="v2-dict-size-dec">-</button>
            <span id="v2-dict-size-label">100%</span>
            <button id="v2-dict-size-inc">+</button>
          </dialog>
        </morcus-reader-settings>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  test("tokenizes Aeneid text with decomposed NFD macra without splitting words", () => {
    // Aeneid 1.8 with combining macrons (\u0304): Mūsa, mihī causās memorā, quō nūmine laesō
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304, quo\u0304 nu\u0304mine laeso\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    // Verified: Musa is NOT split into 'Mu' and 'sa'
    expect(wordTexts).toEqual([
      "Mu\u0304sa",
      "mihi\u0304",
      "causa\u0304s",
      "memora\u0304",
      "quo\u0304",
      "nu\u0304mine",
      "laeso\u0304",
    ]);

    // Data-word attributes preserved
    expect(words[0].getAttribute("data-word")).toBe("Mu\u0304sa");
    expect(words[2].getAttribute("data-word")).toBe("causa\u0304s");

    // Interstitial punctuation and spaces preserved
    const line = el.querySelector(".v2-reader-line")!;
    expect(line.textContent).toBe(
      "Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304, quo\u0304 nu\u0304mine laeso\u0304."
    );
  });

  test("tokenizes precomposed NFC macra without splitting", () => {
    // Composed: Mūsa, causās
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">M\u016Bsa, mihi caus\u0101s memor\u0101.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    expect(wordTexts).toEqual(["Mūsa", "mihi", "causās", "memorā"]);
  });

  test("clicking a word with macra opens dictionary with query and activates word", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const musaWord = el.querySelector<HTMLElement>(".v2-lat-word")!;
    expect(musaWord.textContent).toBe("Mu\u0304sa");

    musaWord.click();

    // Word receives active highlight class
    expect(musaWord.classList.contains("v2-word-active")).toBe(true);

    // Dictionary iframe source is updated with Latin filter and forced inflections (o=1)
    const iframe = el.querySelector<HTMLIFrameElement>("#v2-dict-frame")!;
    expect(iframe.src).toContain(
      "/v2/dicts?q=Mu%CC%84sa&lang=La&o=1&embedded=1"
    );

    // Sheet label updated
    const sheetLabel = el.querySelector<HTMLElement>(".v2-reader-sheet-label")!;
    expect(sheetLabel.innerHTML).toContain("Mu\u0304sa");
  });

  test("clicking a word reflects customized dictScale in iframe query param", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({ dictScale: 120 })
    );
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.1">
        <span class="v2-reader-line">arma virumque cano</span>
      </div>
    `;
    const el = createReaderView(passageHtml);
    const armaWord = el.querySelector<HTMLElement>(".v2-lat-word")!;
    armaWord.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const iframe = el.querySelector<HTMLIFrameElement>("#v2-dict-frame")!;
    expect(iframe.src).toContain(
      "/v2/dicts?q=arma&lang=La&o=1&embedded=1&scale=120"
    );
    localStorage.removeItem(READER_SETTINGS_KEY);
  });

  test("findWordElement highlights word matching unaccented, NFC, or NFD queries", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const musaWord = el.querySelector<HTMLElement>(".v2-lat-word")!;

    // Case 1: Search unaccented "musa" matches "Mūsa"
    // @ts-expect-error accessing private method for test verification
    const matchUnaccented = el.findWordElement("musa");
    expect(matchUnaccented).toBe(musaWord);

    // Case 2: Search NFC precomposed "Mūsa" matches "Mu\u0304sa"
    // @ts-expect-error accessing private method for test verification
    const matchNfc = el.findWordElement("M\u016Bsa");
    expect(matchNfc).toBe(musaWord);

    // Case 3: Search exact NFD "Mu\u0304sa" matches
    // @ts-expect-error accessing private method for test verification
    const matchNfd = el.findWordElement("Mu\u0304sa");
    expect(matchNfd).toBe(musaWord);
  });

  test("toggling Show Macra in settings strips and restores vowel markings", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));
    expect(words[0].textContent).toBe("Mu\u0304sa");
    expect(words[2].textContent).toBe("causa\u0304s");

    const toggleMacra = el.querySelector<HTMLInputElement>("#v2-toggle-macra")!;
    expect(toggleMacra).not.toBeNull();

    // Toggle macra OFF
    toggleMacra.checked = false;
    toggleMacra.dispatchEvent(new Event("change"));

    expect(words[0].textContent).toBe("Musa");
    expect(words[2].textContent).toBe("causas");
    // data-word attribute remains intact for search/click lookup
    expect(words[0].getAttribute("data-word")).toBe("Mu\u0304sa");

    // Toggle macra back ON
    toggleMacra.checked = true;
    toggleMacra.dispatchEvent(new Event("change"));

    expect(words[0].textContent).toBe("Mu\u0304sa");
    expect(words[2].textContent).toBe("causa\u0304s");
  });

  test("synchronizes reader data-theme to dictionary iframe on connect and on iframe load", () => {
    document.documentElement.setAttribute("data-theme", "dark");

    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.1">
        <span class="v2-reader-line">Arma virumque cano.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const iframe = el.querySelector<HTMLIFrameElement>("#v2-dict-frame")!;

    // Populate iframe contentDocument with a basic HTML document
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    // Trigger iframe load event to simulate navigation/reload
    iframe.dispatchEvent(new Event("load"));

    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBe("dark");

    // Clean up
    document.documentElement.removeAttribute("data-theme");
  });

  test("syncs --v2-dict-scale to iframe on stepper change and iframe reload", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.1">
        <span class="v2-reader-line">Arma virumque cano.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const iframe = el.querySelector<HTMLIFrameElement>("#v2-dict-frame")!;

    // Populate iframe contentDocument with a basic HTML document
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    const incBtn = el.querySelector<HTMLButtonElement>("#v2-dict-size-inc")!;
    incBtn.click();

    expect(
      iframe.contentDocument!.documentElement.style.getPropertyValue(
        "--v2-dict-scale"
      )
    ).toBe("1.10");

    // Re-trigger iframe load event to simulate navigation/reload
    iframe.dispatchEvent(new Event("load"));

    expect(
      iframe.contentDocument!.documentElement.style.getPropertyValue(
        "--v2-dict-scale"
      )
    ).toBe("1.10");

    const decBtn = el.querySelector<HTMLButtonElement>("#v2-dict-size-dec")!;
    decBtn.click();
    expect(
      iframe.contentDocument!.documentElement.style.getPropertyValue(
        "--v2-dict-scale"
      )
    ).toBe("1.00");
  });

  describe("sheet label rendering", () => {
    const passageHtml = `
      <div class="v2-reader-section" id="sec-1.1">
        <span class="v2-reader-line">Arma virumque cano.</span>
      </div>
    `;

    function sheetLabelOf(el: MorcusReaderView): HTMLElement {
      return el.querySelector<HTMLElement>(".v2-reader-sheet-label")!;
    }

    test("renders the query inside a <strong> that CSS targets", () => {
      const el = createReaderView(passageHtml);
      el.querySelector<HTMLElement>(".v2-lat-word")!.click();

      const label = sheetLabelOf(el);
      // `.v2-reader-sheet-label strong` in core/drawer.css styles this element,
      // so the wrapper must remain a real <strong>, not plain text.
      const strong = label.querySelector("strong");
      expect(strong).not.toBeNull();
      expect(strong!.textContent).toBe("Arma");
      expect(label.textContent).toBe("Definitions for Arma");
    });

    test("appends the 'tap to expand' hint only when minimized", () => {
      const el = createReaderView(passageHtml);
      el.querySelector<HTMLElement>(".v2-lat-word")!.click();

      // Restored state: no hint.
      expect(sheetLabelOf(el).textContent).toBe("Definitions for Arma");

      el.minimizeDrawer();

      const label = sheetLabelOf(el);
      expect(label.textContent).toBe(
        "Definitions for Arma \u00b7 tap to expand"
      );
      const hint = label.querySelector<HTMLElement>("span");
      expect(hint!.textContent).toBe("tap to expand");
      expect(hint!.style.opacity).toBe("0.8");
      expect(hint!.style.fontWeight).toBe("400");

      el.restoreDrawer();
      expect(sheetLabelOf(el).textContent).toBe("Definitions for Arma");
    });

    test("does not execute markup supplied via the ?q= parameter", () => {
      const payload = '<img src=x onerror="globalThis.__xss = true">';
      history.replaceState(
        null,
        "",
        `/v2/reader?q=${encodeURIComponent(payload)}`
      );

      try {
        const el = createReaderView(passageHtml);
        // Force the label to render the attacker-controlled query.
        el.restoreDrawer();
        el.minimizeDrawer();

        const label = sheetLabelOf(el);
        expect(label.querySelector("img")).toBeNull();
        // The payload survives as literal text, not as markup.
        expect(label.textContent).toContain(payload);
        expect((globalThis as Record<string, unknown>).__xss).toBeUndefined();
      } finally {
        history.replaceState(null, "", "/");
        delete (globalThis as Record<string, unknown>).__xss;
      }
    });
  });

  describe("active word highlight", () => {
    const PASSAGE = `
      <div class="v2-reader-section" id="sec-1.8">
        <span class="v2-reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const textPanelWords = (el: MorcusReaderView) =>
      Array.from(
        el.querySelectorAll<HTMLElement>(".v2-reader-text-panel .v2-lat-word")
      );

    test("moves the highlight so exactly one word is ever active", () => {
      const el = createReaderView(PASSAGE);
      const words = textPanelWords(el);

      words[0].click();
      expect(el.querySelectorAll(".v2-word-active")).toHaveLength(1);
      expect(words[0].classList.contains("v2-word-active")).toBe(true);

      words[2].click();
      expect(el.querySelectorAll(".v2-word-active")).toHaveLength(1);
      expect(words[2].classList.contains("v2-word-active")).toBe(true);
      expect(words[0].classList.contains("v2-word-active")).toBe(false);
    });

    test("dismissing the dictionary clears the highlight", () => {
      const el = createReaderView(PASSAGE);
      const word = textPanelWords(el)[0];

      word.click();
      expect(word.classList.contains("v2-word-active")).toBe(true);

      // @ts-expect-error accessing private method for test verification
      el.dismissDictionary(false);

      expect(el.querySelectorAll(".v2-word-active")).toHaveLength(0);
    });

    /**
     * `linkifyText` also emits `v2-word-active`, on dictionary entry markup. Clearing
     * the passage highlight must not reach into the dictionary panel, which is why the
     * query stays scoped to `.v2-reader-text-panel`.
     */
    test("leaves an active word outside the text panel alone", () => {
      const el = createReaderView(PASSAGE);
      const entryWord = document.createElement("a");
      entryWord.className = "v2-lat-word v2-word-active";
      el.querySelector(".v2-reader-dict-panel")!.appendChild(entryWord);

      textPanelWords(el)[0].click();
      expect(entryWord.classList.contains("v2-word-active")).toBe(true);

      // @ts-expect-error accessing private method for test verification
      el.dismissDictionary(false);
      expect(entryWord.classList.contains("v2-word-active")).toBe(true);
    });

    // Clicking supplies the anchor directly, so nothing needs to look at the rest of
    // the chapter; the highlight to clear is found by querying for the highlight.
    test("does not enumerate every word in the chapter on click", () => {
      const el = createReaderView(PASSAGE);
      const word = textPanelWords(el)[0];
      const querySelectorAll = jest.spyOn(el, "querySelectorAll");

      word.click();

      const wordScans = querySelectorAll.mock.calls
        .map(([selector]) => selector)
        .filter((selector) => selector.includes("v2-lat-word"));
      expect(wordScans).toEqual([]);

      querySelectorAll.mockRestore();
    });
  });
});

describe("Reader preferences validation & hydration", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
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
      fontFamily: "sans",
      lineHeight: "compact",
    };
    expect(parseReaderPreferences(JSON.stringify(valid))).toEqual(valid);
  });

  it("partially parses valid fields and falls back to defaults for missing ones", () => {
    const partial = {
      readerScale: 80,
      fontFamily: "sans",
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
      fontFamily: "comic-sans", // not "serif" | "sans"
      lineHeight: "huge", // not "compact" | "normal" | "relaxed"
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
      fontFamily: "sans",
      lineHeight: "super_relaxed",
    };
    expect(parseReaderPreferences(JSON.stringify(mixed))).toEqual({
      ...DEFAULT_READER_PREFS,
      readerScale: 110,
      fontFamily: "sans",
    });
  });

  it("initializes reader view dialog safely with corrupted localStorage data", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({
        readerScale: "corrupt",
        dictScale: 120,
        fontFamily: "papyrus",
        lineHeight: "compact",
      })
    );

    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="v2-reader-split-layout">
        <section class="v2-reader-text-panel">
          <article class="v2-reader-passage"></article>
        </section>
        <morcus-reader-settings>
          <dialog id="v2-reader-settings-dialog">
            <button id="v2-reader-settings-btn"></button>
            <span id="v2-reader-size-label"></span>
            <span id="v2-dict-size-label"></span>
            <select id="v2-font-select">
              <option value="serif">Serif</option>
              <option value="sans">Sans</option>
            </select>
            <select id="v2-line-height-select">
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed</option>
            </select>
            <input type="checkbox" id="v2-toggle-macra" />
            <input type="checkbox" id="v2-toggle-gutter" />
          </dialog>
        </morcus-reader-settings>
      </div>
    `;
    document.body.appendChild(el);

    const fontSelect = el.querySelector<HTMLSelectElement>("#v2-font-select")!;
    const lineSelect = el.querySelector<HTMLSelectElement>(
      "#v2-line-height-select"
    )!;
    const readerLabel = el.querySelector<HTMLElement>("#v2-reader-size-label")!;
    const dictLabel = el.querySelector<HTMLElement>("#v2-dict-size-label")!;

    // Corrupt readerScale dropped -> default 100%
    expect(readerLabel.textContent).toBe("100%");
    // Valid dictScale kept -> 120%
    expect(dictLabel.textContent).toBe("120%");
    // Corrupt fontFamily "papyrus" dropped -> default "serif"
    expect(fontSelect.value).toBe("serif");
    // Valid lineHeight "compact" kept
    expect(lineSelect.value).toBe("compact");
  });
});

describe("MorcusReaderView desktop splitter drag", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function createSplitterReaderView(): {
    el: MorcusReaderView;
    splitLayout: HTMLElement;
    splitter: HTMLElement;
    dictPanel: HTMLElement;
  } {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="v2-reader-split-layout">
        <section class="v2-reader-text-panel">
          <div class="v2-reader-text-card">
            <article class="v2-reader-passage" id="v2-reader-passage">
              <span class="v2-reader-line">arma virumque cano</span>
            </article>
          </div>
        </section>
        <div class="v2-reader-splitter" role="separator" aria-valuenow="420"></div>
        <aside class="v2-reader-dict-panel">
          <div class="v2-reader-sheet-bar">
            <span class="v2-reader-sheet-label">Tap any word</span>
          </div>
          <iframe id="v2-dict-frame" src="/v2/dicts?embedded=1"></iframe>
        </aside>
      </div>
    `;
    document.body.appendChild(el);
    return {
      el,
      splitLayout: el.querySelector<HTMLElement>(".v2-reader-split-layout")!,
      splitter: el.querySelector<HTMLElement>(".v2-reader-splitter")!,
      dictPanel: el.querySelector<HTMLElement>(".v2-reader-dict-panel")!,
    };
  }

  test("updates --v2-dict-width and aria-valuenow without layout reads during pointermove", () => {
    const { splitLayout, splitter, dictPanel } = createSplitterReaderView();

    const splitSpy = jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);
    const dictSpy = jest
      .spyOn(dictPanel, "getBoundingClientRect")
      .mockReturnValue({ width: 420 } as DOMRect);

    // 1. Pointerdown (drag start) measures container and panel
    splitter.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        clientX: 800,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(splitSpy).toHaveBeenCalledTimes(1);
    expect(dictSpy).toHaveBeenCalledTimes(1);
    splitSpy.mockClear();
    dictSpy.mockClear();

    // 2. Pointermove (drag left by 50px -> dx = -50)
    splitter.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 750,
        clientY: 300,
        pointerId: 1,
      })
    );

    // Width should increase by 50px: 420 - (-50) = 470px
    expect(splitLayout.style.getPropertyValue("--v2-dict-width")).toBe("470px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("470");

    // CRITICAL: No layout reads performed during pointermove!
    expect(splitSpy).not.toHaveBeenCalled();
    expect(dictSpy).not.toHaveBeenCalled();

    // 3. Pointerup finishes drag and persists to localStorage
    splitter.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 750,
        clientY: 300,
        pointerId: 1,
      })
    );

    expect(localStorage.getItem("morcus_v2_reader_dict_width")).toBe("470");

    splitSpy.mockRestore();
    dictSpy.mockRestore();
  });

  test("keyboard arrow keys resize splitter within bounds", () => {
    const { splitLayout, splitter } = createSplitterReaderView();
    const splitSpy = jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);

    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    // default 420 + 24 = 444
    expect(splitLayout.style.getPropertyValue("--v2-dict-width")).toBe("444px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("444");

    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    // 444 - 24 = 420
    expect(splitLayout.style.getPropertyValue("--v2-dict-width")).toBe("420px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("420");

    splitSpy.mockRestore();
  });

  test("initializes ReaderLayoutController and exposes it via getLayoutController", () => {
    const { el } = createSplitterReaderView();
    const layoutController = el.getLayoutController();

    expect(layoutController).not.toBeNull();
    expect(layoutController?.getWidth()).toBe(420);

    // Disconnect tears down controller
    el.remove();
    expect(el.getLayoutController()).toBeNull();
  });

  test("initializes ReaderTocController and toggles on KeyT", () => {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="v2-sticky-expanded-row">
        <button type="button" id="v2-reader-toc-btn" aria-expanded="false">Contents</button>
      </div>
      <div id="v2-reader-toc-drawer" class="v2-reader-toc-drawer" hidden>
        <button type="button" id="v2-reader-toc-close-btn">&times;</button>
        <div id="v2-reader-toc-list">
          <a class="v2-reader-toc-item" href="#">Item 1</a>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    const tocController = el.getTocController();
    expect(tocController).not.toBeNull();
    expect(tocController?.isOpen()).toBe(false);

    // Press 't' shortcut
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
    expect(tocController?.isOpen()).toBe(true);

    // Press 'T' shortcut
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "T" }));
    expect(tocController?.isOpen()).toBe(false);

    // Disconnect removes controller
    el.remove();
    expect(el.getTocController()).toBeNull();
  });
});
