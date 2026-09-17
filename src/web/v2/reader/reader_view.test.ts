/**
 * @jest-environment jsdom
 */
import {
  DEFAULT_READER_PREFS,
  MorcusReaderView,
  READER_SETTINGS_KEY,
  parseReaderPreferences,
} from "@/web/v2/reader/reader_view.client";
import {
  DRAWER_DEFAULT_DVH,
  DRAWER_EXPANDED_DVH,
  DRAWER_FLOOR_DVH,
} from "@/web/v2/core/drawer.client";
import { savedSpotsStore } from "@/web/v2/reader/saved_spots.client";

import { installPointerEventShims } from "@/web/v2/testing/pointer_events";

installPointerEventShims();

function createReaderView(
  innerPassageHtml: string,
  options: { workId?: string; hasMacra?: boolean; notesHtml?: string } = {}
): MorcusReaderView {
  const el = document.createElement("morcus-reader-view") as MorcusReaderView;
  if (options.workId) el.dataset.work = options.workId;
  if (options.hasMacra !== undefined) {
    el.dataset.hasMacra = String(options.hasMacra);
  }
  const hasMacra = options.hasMacra ?? true;
  el.innerHTML = `
    <div class="reader-split-layout reader-layout-empty">
      <section class="reader-text-panel">
        <div class="reader-text-card">
          <article class="reader-passage" id="reader-passage">
            ${innerPassageHtml}
          </article>
          ${options.notesHtml ?? ""}
        </div>
      </section>
      <aside class="reader-dict-panel">
        <div class="reader-sheet-bar">
          <div class="reader-sheet-teaser">
            <span class="reader-sheet-label">Tap any word</span>
          </div>
        </div>
        <div class="dict-iframe-container">
          <iframe id="dict-frame" src="/v2/dicts?embedded=1"></iframe>
        </div>
      </aside>
      <morcus-reader-settings>
        <dialog id="reader-settings-dialog">
          ${
            hasMacra
              ? '<input type="checkbox" id="toggle-macra" checked />'
              : ""
          }
          <button id="dict-size-dec">-</button>
          <span id="dict-size-label">100%</span>
          <button id="dict-size-inc">+</button>
        </dialog>
      </morcus-reader-settings>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

describe("MorcusReaderView client tokenization & macra handling", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("tokenizes Aeneid text with decomposed NFD macra without splitting words", () => {
    // Aeneid 1.8 with combining macrons (\u0304): Mūsa, mihī causās memorā, quō nūmine laesō
    const passageHtml = `
      <div class="reader-section" id="sec-1.8">
        <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304, quo\u0304 nu\u0304mine laeso\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
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
    const line = el.querySelector(".reader-line")!;
    expect(line.textContent).toBe(
      "Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304, quo\u0304 nu\u0304mine laeso\u0304."
    );
  });

  test("tokenizes precomposed NFC macra without splitting", () => {
    // Composed: Mūsa, causās
    const passageHtml = `
      <div class="reader-section" id="sec-1.8">
        <span class="reader-line">M\u016Bsa, mihi caus\u0101s memor\u0101.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    expect(wordTexts).toEqual(["Mūsa", "mihi", "causās", "memorā"]);
  });

  test("decouples tokenization from CSS selectors via data-tokenize-target attribute", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <div class="reader-passage" data-tokenize-target="true">
          <blockquote>Gallia est omnis divisa.</blockquote>
        </div>
        <div class="english-translation">
          <span>All Gaul is divided.</span>
        </div>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const latinWords = Array.from(
      el.querySelectorAll<HTMLElement>(
        '[data-tokenize-target="true"] .lat-word'
      )
    ).map((w) => w.textContent);
    expect(latinWords).toEqual(["Gallia", "est", "omnis", "divisa"]);

    // Untargeted translation section has 0 .lat-word spans
    const englishWords = el.querySelectorAll<HTMLElement>(
      ".english-translation .lat-word"
    );
    expect(englishWords).toHaveLength(0);
  });

  test("clicking a word with macra opens dictionary with query and activates word", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.8">
        <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const musaWord = el.querySelector<HTMLElement>(".lat-word")!;
    expect(musaWord.textContent).toBe("Mu\u0304sa");

    musaWord.click();

    // Word receives active highlight class
    expect(musaWord.classList.contains("word-active")).toBe(true);

    // Dictionary iframe source is updated with Latin filter and forced inflections (o=1)
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    expect(iframe.src).toContain(
      "/v2/dicts?q=Mu%CC%84sa&lang=La&o=1&embedded=1"
    );

    // Sheet label updated
    const sheetLabel = el.querySelector<HTMLElement>(".reader-sheet-label")!;
    expect(sheetLabel.innerHTML).toContain("Mu\u0304sa");
  });

  test("clicking a word reflects customized dictScale in iframe query param", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({ dictScale: 120 })
    );
    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <span class="reader-line">arma virumque cano</span>
      </div>
    `;
    const el = createReaderView(passageHtml);
    const armaWord = el.querySelector<HTMLElement>(".lat-word")!;
    armaWord.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    expect(iframe.src).toContain(
      "/v2/dicts?q=arma&lang=La&o=1&embedded=1&scale=120"
    );
    localStorage.removeItem(READER_SETTINGS_KEY);
  });

  test("findWordElement highlights word matching unaccented, NFC, or NFD queries", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.8">
        <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const musaWord = el.querySelector<HTMLElement>(".lat-word")!;

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
      <div class="reader-section" id="sec-1.8">
        <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    expect(words[0].textContent).toBe("Mu\u0304sa");
    expect(words[2].textContent).toBe("causa\u0304s");

    const toggleMacra = el.querySelector<HTMLInputElement>("#toggle-macra")!;
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

  test("initializes with work-scoped macra preference from localStorage on connect", () => {
    localStorage.setItem("macronButton-phi0690", "false");

    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const el = createReaderView(passageHtml, {
      workId: "phi0690",
    });
    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    // Macra stripped on connect because macronButton-phi0690 is false
    expect(words[0].textContent).toBe("Musa");
    expect(words[2].textContent).toBe("causas");
  });

  test("skips macra preference hydration and text mutation when hasMacra is false", () => {
    localStorage.setItem("macronButton-caesar_dbg", "false");

    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <span class="reader-line">Gallia est omnis divisa in partes tres.</span>
      </div>
    `;

    const el = createReaderView(passageHtml, {
      workId: "caesar_dbg",
      hasMacra: false,
    });

    expect(el.querySelector("#toggle-macra")).toBeNull();
    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    // Words are tokenized cleanly but no data-original-text overhead is added
    expect(words[0].textContent).toBe("Gallia");
    expect(words[0].hasAttribute("data-original-text")).toBe(false);
  });

  test("synchronizes reader data-theme to dictionary iframe on connect and on iframe load", () => {
    document.documentElement.setAttribute("data-theme", "dark");

    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <span class="reader-line">Arma virumque cano.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;

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

  test("syncs --dict-scale to iframe on stepper change and iframe reload", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <span class="reader-line">Arma virumque cano.</span>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;

    // Populate iframe contentDocument with a basic HTML document
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    const incBtn = el.querySelector<HTMLButtonElement>("#dict-size-inc")!;
    incBtn.click();

    expect(
      iframe.contentDocument!.documentElement.style.getPropertyValue(
        "--dict-scale"
      )
    ).toBe("1.10");

    // Re-trigger iframe load event to simulate navigation/reload
    iframe.dispatchEvent(new Event("load"));

    expect(
      iframe.contentDocument!.documentElement.style.getPropertyValue(
        "--dict-scale"
      )
    ).toBe("1.10");

    const decBtn = el.querySelector<HTMLButtonElement>("#dict-size-dec")!;
    decBtn.click();
    expect(
      iframe.contentDocument!.documentElement.style.getPropertyValue(
        "--dict-scale"
      )
    ).toBe("1.00");
  });

  describe("sheet label rendering", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <span class="reader-line">Arma virumque cano.</span>
      </div>
    `;

    function sheetLabelOf(el: MorcusReaderView): HTMLElement {
      return el.querySelector<HTMLElement>(".reader-sheet-label")!;
    }

    test("renders the query inside a <strong> that CSS targets", () => {
      const el = createReaderView(passageHtml);
      el.querySelector<HTMLElement>(".lat-word")!.click();

      const label = sheetLabelOf(el);
      // `.reader-sheet-label strong` in core/drawer.css styles this element,
      // so the wrapper must remain a real <strong>, not plain text.
      const strong = label.querySelector("strong");
      expect(strong).not.toBeNull();
      expect(strong!.textContent).toBe("Arma");
      expect(label.textContent).toBe("Definitions for Arma");
    });

    test("appends the 'tap to expand' hint only when minimized", () => {
      const el = createReaderView(passageHtml);
      el.querySelector<HTMLElement>(".lat-word")!.click();

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

    test("restoreDrawer clamps target dvh within [DRAWER_FLOOR_DVH, DRAWER_EXPANDED_DVH] and falls back to DRAWER_DEFAULT_DVH", () => {
      const el = createReaderView(passageHtml);
      const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
      const sheetBar = el.querySelector<HTMLElement>(".reader-sheet-bar")!;

      // Default restore (omitted targetDvh) sets DRAWER_DEFAULT_DVH
      el.restoreDrawer();
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe(
        `${DRAWER_DEFAULT_DVH}dvh`
      );
      expect(sheetBar.getAttribute("aria-valuenow")).toBe(
        String(DRAWER_DEFAULT_DVH)
      );

      // Clamps below floor threshold to DRAWER_FLOOR_DVH
      el.restoreDrawer(DRAWER_FLOOR_DVH - 10);
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe(
        `${DRAWER_FLOOR_DVH}dvh`
      );
      expect(sheetBar.getAttribute("aria-valuenow")).toBe(
        String(DRAWER_FLOOR_DVH)
      );

      // Clamps above expanded threshold to DRAWER_EXPANDED_DVH
      el.restoreDrawer(DRAWER_EXPANDED_DVH + 10);
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe(
        `${DRAWER_EXPANDED_DVH}dvh`
      );
      expect(sheetBar.getAttribute("aria-valuenow")).toBe(
        String(DRAWER_EXPANDED_DVH)
      );
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
      <div class="reader-section" id="sec-1.8">
        <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
      </div>
    `;

    const textPanelWords = (el: MorcusReaderView) =>
      Array.from(
        el.querySelectorAll<HTMLElement>(".reader-text-panel .lat-word")
      );

    test("moves the highlight so exactly one word is ever active", () => {
      const el = createReaderView(PASSAGE);
      const words = textPanelWords(el);

      words[0].click();
      expect(el.querySelectorAll(".word-active")).toHaveLength(1);
      expect(words[0].classList.contains("word-active")).toBe(true);

      words[2].click();
      expect(el.querySelectorAll(".word-active")).toHaveLength(1);
      expect(words[2].classList.contains("word-active")).toBe(true);
      expect(words[0].classList.contains("word-active")).toBe(false);
    });

    test("dismissing the dictionary clears the highlight", () => {
      const el = createReaderView(PASSAGE);
      const word = textPanelWords(el)[0];

      word.click();
      expect(word.classList.contains("word-active")).toBe(true);

      // @ts-expect-error accessing private method for test verification
      el.dismissDictionary(false);

      expect(el.querySelectorAll(".word-active")).toHaveLength(0);
    });

    /**
     * `linkifyText` also emits `word-active`, on dictionary entry markup. Clearing
     * the passage highlight must not reach into the dictionary panel, which is why the
     * query stays scoped to `.reader-text-panel`.
     */
    test("leaves an active word outside the text panel alone", () => {
      const el = createReaderView(PASSAGE);
      const entryWord = document.createElement("a");
      entryWord.className = "lat-word word-active";
      el.querySelector(".reader-dict-panel")!.appendChild(entryWord);

      textPanelWords(el)[0].click();
      expect(entryWord.classList.contains("word-active")).toBe(true);

      // @ts-expect-error accessing private method for test verification
      el.dismissDictionary(false);
      expect(entryWord.classList.contains("word-active")).toBe(true);
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
        .filter((selector) => selector.includes("lat-word"));
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
      showGutter: false,
      fontFamily: "sans",
      lineHeight: "compact",
    };
    expect(parseReaderPreferences(JSON.stringify(valid))).toEqual({
      ...valid,
      showMacra: DEFAULT_READER_PREFS.showMacra,
    });
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
      <div class="reader-split-layout">
        <section class="reader-text-panel">
          <article class="reader-passage"></article>
        </section>
        <morcus-reader-settings>
          <dialog id="reader-settings-dialog">
            <button id="reader-settings-btn"></button>
            <span id="reader-size-label"></span>
            <span id="dict-size-label"></span>
            <select id="font-select">
              <option value="serif">Serif</option>
              <option value="sans">Sans</option>
            </select>
            <select id="line-height-select">
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed</option>
            </select>
            <input type="checkbox" id="toggle-macra" />
            <input type="checkbox" id="toggle-gutter" />
          </dialog>
        </morcus-reader-settings>
      </div>
    `;
    document.body.appendChild(el);

    const fontSelect = el.querySelector<HTMLSelectElement>("#font-select")!;
    const lineSelect = el.querySelector<HTMLSelectElement>(
      "#line-height-select"
    )!;
    const readerLabel = el.querySelector<HTMLElement>("#reader-size-label")!;
    const dictLabel = el.querySelector<HTMLElement>("#dict-size-label")!;

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
      <div class="reader-split-layout">
        <section class="reader-text-panel">
          <div class="reader-text-card">
            <article class="reader-passage" id="reader-passage">
              <span class="reader-line">arma virumque cano</span>
            </article>
          </div>
        </section>
        <div class="reader-splitter" role="separator" aria-valuenow="420"></div>
        <aside class="reader-dict-panel">
          <div class="reader-sheet-bar">
            <span class="reader-sheet-label">Tap any word</span>
          </div>
          <iframe id="dict-frame" src="/v2/dicts?embedded=1"></iframe>
        </aside>
      </div>
    `;
    document.body.appendChild(el);
    return {
      el,
      splitLayout: el.querySelector<HTMLElement>(".reader-split-layout")!,
      splitter: el.querySelector<HTMLElement>(".reader-splitter")!,
      dictPanel: el.querySelector<HTMLElement>(".reader-dict-panel")!,
    };
  }

  test("updates --dict-width and aria-valuenow without layout reads during pointermove", () => {
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
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("470px");
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
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("444px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("444");

    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    // 444 - 24 = 420
    expect(splitLayout.style.getPropertyValue("--dict-width")).toBe("420px");
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
      <div class="sticky-expanded-row">
        <button type="button" id="reader-toc-btn" aria-expanded="false">Contents</button>
      </div>
      <div id="reader-toc-drawer" class="reader-toc-drawer" hidden>
        <button type="button" id="reader-toc-close-btn">&times;</button>
        <div id="reader-toc-list">
          <a class="reader-toc-item" href="#">Item 1</a>
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

  test("saves current page spot to savedSpotsStore on connect", () => {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.dataset.work = "phi0448.phi001.perseus-lat2";
    el.dataset.page = "1.2";
    document.body.appendChild(el);

    expect(savedSpotsStore.get("phi0448.phi001.perseus-lat2")).toBe("1.2");
  });

  test("saves hash section spot to savedSpotsStore on connect when hash present", () => {
    window.location.hash = "#sec-1.2.3";
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.dataset.work = "phi0448.phi001.perseus-lat2";
    el.dataset.page = "1.2";
    document.body.appendChild(el);

    expect(savedSpotsStore.get("phi0448.phi001.perseus-lat2")).toBe("1.2.3");
    window.location.hash = "";
  });

  test("updates saved spot when section anchor is clicked", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.5">
        <a href="#sec-1.5" class="section-anchor">§ 1.5</a>
        <p class="reader-paragraph">Some text</p>
      </div>
    `;
    const el = createReaderView(passageHtml);
    el.dataset.work = "phi0448.phi001.perseus-lat2";
    el.dataset.page = "1.1";

    const anchor = el.querySelector<HTMLAnchorElement>("a.section-anchor")!;
    anchor.click();

    expect(savedSpotsStore.get("phi0448.phi001.perseus-lat2")).toBe("1.5");
  });
});

describe("MorcusReaderView companion panel & notes integration", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
    document.body.innerHTML = "";
  });

  const samplePassageWithNotes = `
    <div class="reader-section" id="sec-1.1">
      <span class="reader-line">Gallia <span class="lat-word" data-word="divisa">divisa</span> in partes tres.
        <a class="reader-note-ref" id="noteref-n1" href="#note-n1" role="doc-noteref" aria-label="Note 1"><sup>[1]</sup></a>
      </span>
      <span class="reader-line">Aliam incolunt Belgae.
        <a class="reader-note-ref" id="noteref-n2" href="#note-n2" role="doc-noteref" aria-label="Note 2"><sup>[2]</sup></a>
      </span>
    </div>
  `;

  const sampleNotesHtml = `
    <aside class="reader-notes" role="doc-endnotes" aria-labelledby="reader-notes-heading">
      <h2 class="reader-notes-heading" id="reader-notes-heading">Notes</h2>
      <ol class="reader-notes-list">
        <li class="reader-note" id="note-n1">
          <a class="reader-note-backref" href="#noteref-n1" role="doc-backlink" aria-label="Back to note 1 in the text">[1]</a>
          <div class="reader-note-body">First apparatus critical note on divisa.</div>
        </li>
        <li class="reader-note" id="note-n2">
          <a class="reader-note-backref" href="#noteref-n2" role="doc-backlink" aria-label="Back to note 2 in the text">[2]</a>
          <div class="reader-note-body">Second apparatus critical note on Belgae.</div>
        </li>
      </ol>
    </aside>
  `;

  test("clicking note marker opens notes panel, highlights note, activates layout, and leaves reader scroll position intact", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const panelController = el.getPanelController();
    expect(panelController?.hasNotes).toBe(true);
    expect(panelController?.activeTab).toBe("dict");

    const splitLayout = el.querySelector<HTMLElement>(".reader-split-layout");
    expect(splitLayout?.classList.contains("reader-layout-empty")).toBe(true);

    const note1 = el.querySelector<HTMLElement>("#note-n1")!;
    const scrollMock = jest.fn();
    note1.scrollIntoView = scrollMock;

    const marker1 = el.querySelector<HTMLAnchorElement>("#noteref-n1")!;
    marker1.click();

    expect(splitLayout?.classList.contains("reader-layout-active")).toBe(true);
    expect(panelController?.activeTab).toBe("notes");
    expect(marker1.classList.contains("marker-active")).toBe(true);
    expect(note1.classList.contains("note-active")).toBe(true);
    expect(el.getActiveNoteId()).toBe("note-n1");
    expect(el.getActiveNoteLabel()).toBe("1");
    expect(scrollMock).toHaveBeenCalled();
    expect(window.location.hash).toBe("");

    const sheetLabel = el.querySelector<HTMLElement>(".reader-sheet-label");
    expect(sheetLabel?.textContent).toBe("Note 1");
  });

  test("clicking Latin word while in notes tab force-switches panel back to dictionary (Arbitration Rule A1)", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const panelController = el.getPanelController();
    const marker1 = el.querySelector<HTMLAnchorElement>("#noteref-n1")!;
    marker1.click();
    expect(panelController?.activeTab).toBe("notes");
    expect(marker1.classList.contains("marker-active")).toBe(true);

    const latWord = el.querySelector<HTMLElement>(
      '.lat-word[data-word="divisa"]'
    )!;
    latWord.click();

    // Switched back to dictionary
    expect(panelController?.activeTab).toBe("dict");
    expect(latWord.classList.contains("word-active")).toBe(true);
    expect(marker1.classList.contains("marker-active")).toBe(false);

    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame");
    expect(iframe?.src).toContain("q=divisa");

    const sheetLabel = el.querySelector<HTMLElement>(".reader-sheet-label");
    expect(sheetLabel?.textContent).toContain("divisa");
  });

  test("clicking in-flow notes stub link opens notes tab", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const panelController = el.getPanelController();
    const stubLink = el.querySelector<HTMLAnchorElement>(
      ".reader-notes-stub a"
    );
    expect(stubLink).not.toBeNull();

    stubLink?.click();

    expect(panelController?.activeTab).toBe("notes");
    const splitLayout = el.querySelector<HTMLElement>(".reader-split-layout");
    expect(splitLayout?.classList.contains("reader-layout-active")).toBe(true);

    const sheetLabel = el.querySelector<HTMLElement>(".reader-sheet-label");
    expect(sheetLabel?.textContent).toContain("Notes (2)");
  });

  test("clicking note backlink marks the corresponding marker in the passage", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const backlink = el.querySelector<HTMLAnchorElement>(
      'a.reader-note-backref[href="#noteref-n1"]'
    )!;
    expect(backlink).not.toBeNull();

    backlink.click();

    const marker = el.querySelector<HTMLElement>("#noteref-n1");
    expect(marker?.classList.contains("marker-active")).toBe(true);
  });

  test("dismissing dictionary resets companion panel to dictionary tab (Arbitration Rule A4) and clears active highlights", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const marker = el.querySelector<HTMLAnchorElement>("#noteref-n1")!;
    marker.click();

    const panelController = el.getPanelController();
    expect(panelController?.activeTab).toBe("notes");
    expect(marker.classList.contains("marker-active")).toBe(true);

    // @ts-expect-error accessing private method for test verification
    el.dismissDictionary(false);

    expect(panelController?.activeTab).toBe("dict");
    expect(marker.classList.contains("marker-active")).toBe(false);
    expect(el.getActiveNoteId()).toBe("");
  });

  test("pressing 'n' or 'N' toggles between dictionary and notes tabs when notes are present", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const panelController = el.getPanelController();
    expect(panelController?.activeTab).toBe("dict");

    // Press 'n'
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    expect(panelController?.activeTab).toBe("notes");

    // Press 'n' again to toggle back
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    expect(panelController?.activeTab).toBe("dict");

    // Press 'N'
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "N" }));
    expect(panelController?.activeTab).toBe("notes");
  });

  test("pressing 'n' does nothing when page has no notes", () => {
    const el = createReaderView("<p>No notes here</p>");
    const panelController = el.getPanelController();
    expect(panelController?.hasNotes).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
    expect(panelController?.activeTab).toBe("dict");
  });

  test("resetDictScroll resets scroll position on dict panel and notes view", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });
    const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
    const notesView = el.querySelector<HTMLElement>(".reader-panel-notes")!;

    dictPanel.scrollTop = 50;
    notesView.scrollTop = 120;

    // @ts-expect-error accessing private method for test verification
    el.resetDictScroll();

    expect(dictPanel.scrollTop).toBe(0);
    expect(notesView.scrollTop).toBe(0);
  });
});
