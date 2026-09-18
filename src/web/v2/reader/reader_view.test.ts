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
  options: {
    workId?: string;
    hasMacra?: boolean;
    hasTranslation?: boolean;
    notesHtml?: string;
    aboutHtml?: string;
  } = {}
): MorcusReaderView {
  const el = document.createElement("morcus-reader-view") as MorcusReaderView;
  if (options.workId) el.dataset.work = options.workId;
  if (options.hasMacra !== undefined) {
    el.dataset.hasMacra = String(options.hasMacra);
  }
  if (options.hasTranslation !== undefined) {
    el.dataset.hasTranslation = String(options.hasTranslation);
  }
  const hasMacra = options.hasMacra ?? true;
  el.innerHTML = `
    <div class="reader-split-layout reader-layout-empty">
      <section class="reader-text-panel">
        <div class="reader-text-card">
          <header class="reader-text-card-header">
            <div class="reader-text-meta">
              <a href="#reader-work-about" class="reader-about-link">About ⓘ</a>
            </div>
          </header>
          <article class="reader-passage" id="reader-passage">
            ${innerPassageHtml}
          </article>
          ${options.notesHtml ?? ""}
          ${options.aboutHtml ?? ""}
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
        <div id="reader-settings-popover" hidden>
          ${
            hasMacra
              ? '<input type="checkbox" id="toggle-macra" checked />'
              : ""
          }
          <button id="dict-size-dec">-</button>
          <span id="dict-size-label">100%</span>
          <button id="dict-size-inc">+</button>
        </div>
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
          <div id="reader-settings-popover" hidden>
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
          </div>
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
      <div class="sticky-primary-row">
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

  test("closes settings popover when Table of Contents opens", () => {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="sticky-primary-row">
        <button type="button" id="reader-toc-btn" aria-expanded="false">Contents</button>
        <button type="button" id="reader-settings-btn" aria-expanded="false">Aa</button>
      </div>
      <div id="reader-toc-drawer" class="reader-toc-drawer" hidden>
        <button type="button" id="reader-toc-close-btn">&times;</button>
      </div>
      <div id="reader-settings-backdrop" hidden></div>
      <morcus-reader-settings>
        <div id="reader-settings-popover" class="reader-settings-popover" role="dialog" hidden>
          <button id="reader-settings-close-btn">&times;</button>
        </div>
      </morcus-reader-settings>
    `;
    document.body.appendChild(el);

    const settings = el.getSettingsElement();
    const toc = el.getTocController();
    expect(settings).not.toBeNull();
    expect(toc).not.toBeNull();

    // Open settings popover
    settings?.open();
    expect(settings?.isOpen()).toBe(true);

    // Opening TOC closes settings
    toc?.open();
    expect(toc?.isOpen()).toBe(true);
    expect(settings?.isOpen()).toBe(false);

    el.remove();
  });

  test("toggles settings popover on KeyA", () => {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="sticky-primary-row">
        <button type="button" id="reader-settings-btn" aria-expanded="false">Aa</button>
      </div>
      <div id="reader-settings-backdrop" hidden></div>
      <morcus-reader-settings>
        <div id="reader-settings-popover" class="reader-settings-popover" role="dialog" hidden>
          <button id="reader-settings-close-btn">&times;</button>
        </div>
      </morcus-reader-settings>
    `;
    document.body.appendChild(el);

    const settings = el.getSettingsElement();
    expect(settings).not.toBeNull();
    expect(settings?.isOpen()).toBe(false);

    // Press 'a'
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(settings?.isOpen()).toBe(true);

    // Press 'A'
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));
    expect(settings?.isOpen()).toBe(false);

    el.remove();
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

  test("handles rapid consecutive section anchor clicks without premature toast dismissal", () => {
    jest.useFakeTimers();
    try {
      const passageHtml = `
        <div class="reader-section" id="sec-1.5">
          <a href="#sec-1.5" class="section-anchor">§ 1.5</a>
          <p class="reader-paragraph">Some text</p>
        </div>
        <div id="reader-toast"></div>
      `;
      const el = createReaderView(passageHtml);
      el.dataset.work = "phi0448.phi001.perseus-lat2";
      el.dataset.page = "1.1";

      const anchor = el.querySelector<HTMLAnchorElement>("a.section-anchor")!;
      const toast = el.querySelector<HTMLElement>("#reader-toast")!;

      anchor.click();
      expect(toast.classList.contains("visible")).toBe(true);

      // Advance 1500ms (less than 2200ms timeout), then click again
      jest.advanceTimersByTime(1500);
      anchor.click();
      expect(toast.classList.contains("visible")).toBe(true);

      // Advance another 1000ms (total 2500ms from 1st click, 1000ms from 2nd click)
      // The toast should STILL be visible because the second click reset the timer!
      jest.advanceTimersByTime(1000);
      expect(toast.classList.contains("visible")).toBe(true);

      // Advance remaining 1300ms (2300ms from 2nd click)
      jest.advanceTimersByTime(1300);
      expect(toast.classList.contains("visible")).toBe(false);
    } finally {
      jest.useRealTimers();
    }
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

  test("clicking Notes tab switches companion panel to notes", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const panelController = el.getPanelController();
    const notesTab = el.querySelector<HTMLButtonElement>("#panel-tab-notes");
    expect(notesTab).not.toBeNull();

    notesTab?.click();

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

  const sampleAboutHtml = `
    <section class="reader-work-about" id="reader-work-about" aria-labelledby="reader-about-heading">
      <div class="reader-about-card">
        <h2 class="reader-about-title" id="reader-about-heading">About this text</h2>
        <dl class="reader-meta-list">
          <div class="meta-row"><dt>Author</dt><dd>Julius Caesar</dd></div>
        </dl>
      </div>
    </section>
  `;

  test("clicking .reader-about-link switches companion panel to about tab and opens drawer/panel", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });

    const panelController = el.getPanelController();
    expect(panelController?.hasAbout).toBe(true);
    expect(panelController?.activeTab).toBe("dict");

    const aboutLink = el.querySelector<HTMLAnchorElement>(
      "a.reader-about-link"
    );
    expect(aboutLink).not.toBeNull();

    aboutLink?.click();

    expect(panelController?.activeTab).toBe("about");
    const splitLayout = el.querySelector<HTMLElement>(".reader-split-layout");
    expect(splitLayout?.classList.contains("reader-layout-active")).toBe(true);

    const sheetLabel = el.querySelector<HTMLElement>(".reader-sheet-label");
    expect(sheetLabel?.textContent).toContain("About this text");
  });

  test("clicking About tab switches companion panel to about", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });

    const panelController = el.getPanelController();
    const aboutTab = el.querySelector<HTMLButtonElement>("#panel-tab-about");
    expect(aboutTab).not.toBeNull();

    aboutTab?.click();

    expect(panelController?.activeTab).toBe("about");
    const sheetLabel = el.querySelector<HTMLElement>(".reader-sheet-label");
    expect(sheetLabel?.textContent).toContain("About this text");
  });

  test("pressing 'i' or 'I' toggles between dictionary and about tabs when about is present", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });

    const panelController = el.getPanelController();
    expect(panelController?.activeTab).toBe("dict");

    // Press 'i'
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    expect(panelController?.activeTab).toBe("about");

    // Press 'i' again to toggle back
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    expect(panelController?.activeTab).toBe("dict");

    // Press 'I'
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "I" }));
    expect(panelController?.activeTab).toBe("about");
  });

  test("pressing 'i' does nothing when page has no about section", () => {
    const el = createReaderView("<p>No about here</p>");
    const panelController = el.getPanelController();
    expect(panelController?.hasAbout).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    expect(panelController?.activeTab).toBe("dict");
  });

  test("clicking note marker and backlink inside translation panel stays in translation tab", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
      hasTranslation: true,
    });

    const panelController = el.getPanelController()!;
    panelController.setTranslationHtml(`
      <div class="reader-translation-section">
        <p>Gaul is divided<a class="reader-note-ref" id="noteref-t1" href="#note-t1">[a]</a> into three parts.</p>
      </div>
      <aside class="reader-notes" id="reader-trans-notes">
        <ol class="reader-notes-list">
          <li class="reader-note" id="note-t1">
            <a class="reader-note-backref" href="#noteref-t1">[a]</a>
            <div class="reader-note-body">Translation note body</div>
          </li>
        </ol>
      </aside>
    `);
    panelController.setTab("translation");
    expect(panelController.activeTab).toBe("translation");

    const transMarker = el.querySelector<HTMLAnchorElement>("#noteref-t1")!;
    const transNote = el.querySelector<HTMLElement>("#note-t1")!;
    transNote.scrollIntoView = jest.fn();
    transMarker.scrollIntoView = jest.fn();

    // Clicking [a] inside translation panel should highlight #note-t1 and stay on "translation" tab
    transMarker.click();
    expect(panelController.activeTab).toBe("translation");
    expect(transMarker.classList.contains("marker-active")).toBe(true);
    expect(transNote.classList.contains("note-active")).toBe(true);
    expect(transNote.scrollIntoView).toHaveBeenCalled();

    // Clicking backlink [a] inside translation note should scroll back to transMarker and highlight it
    transMarker.classList.remove("marker-active");
    const backref = transNote.querySelector<HTMLAnchorElement>(
      "a.reader-note-backref"
    )!;
    backref.click();
    expect(transMarker.classList.contains("marker-active")).toBe(true);
    expect(transMarker.scrollIntoView).toHaveBeenCalled();
  });

  test("pressing 'i' with modifier keys (Ctrl, Meta, Alt) does not trigger tab toggle", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });
    const panelController = el.getPanelController();
    expect(panelController?.activeTab).toBe("dict");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", ctrlKey: true })
    );
    expect(panelController?.activeTab).toBe("dict");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", metaKey: true })
    );
    expect(panelController?.activeTab).toBe("dict");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", altKey: true })
    );
    expect(panelController?.activeTab).toBe("dict");
  });

  test("resetDictScroll resets scroll position on dict panel, notes view, and about view", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
      aboutHtml: sampleAboutHtml,
    });
    const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
    const notesView = el.querySelector<HTMLElement>(".reader-panel-notes")!;
    const aboutView = el.querySelector<HTMLElement>(".reader-panel-about")!;

    dictPanel.scrollTop = 50;
    notesView.scrollTop = 120;
    aboutView.scrollTop = 80;

    // @ts-expect-error accessing private method for test verification
    el.resetDictScroll();

    expect(dictPanel.scrollTop).toBe(0);
    expect(notesView.scrollTop).toBe(0);
    expect(aboutView.scrollTop).toBe(0);
  });
});

describe("MorcusReaderView client-side partial page navigation", () => {
  const originalFetch = window.fetch;
  const originalScrollTo = window.scrollTo;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    window.scrollTo = jest.fn();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.scrollTo = originalScrollTo;
    document.body.innerHTML = "";
  });

  function createNavigableReaderView(
    options: {
      pageId?: string;
      author?: string;
      name?: string;
      workId?: string;
      hasTranslation?: boolean;
      passageHtml?: string;
      prevPageUrl?: string;
      nextPageUrl?: string;
      notesHtml?: string;
    } = {}
  ): MorcusReaderView {
    const pageId = options.pageId ?? "1";
    const author = options.author ?? "caesar";
    const name = options.name ?? "de-bello-gallico";
    const workId = options.workId ?? `${author}_${name.replace(/-/g, "_")}`;
    const hasTranslation = options.hasTranslation ?? false;

    window.history.replaceState(
      {},
      "",
      `/v2/reader/${author}/${name}/${pageId}`
    );

    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.dataset.work = workId;
    el.dataset.author = author;
    el.dataset.name = name;
    el.dataset.page = pageId;
    el.dataset.hasTranslation = String(hasTranslation);
    el.dataset.hasMacra = "true";

    const prevUrl = options.prevPageUrl;
    const nextUrl = options.nextPageUrl ?? `/v2/reader/${author}/${name}/2`;

    el.innerHTML = `
      <div class="reader-sticky-bar" id="reader-sticky-bar">
        <div class="sticky-primary-row">
          <div class="sticky-primary-left">
            <a href="${prevUrl ?? "#"}"
               class="reader-btn reader-nav-arrow ${!prevUrl ? "disabled" : ""}"
               id="pager-prev"
               ${
                 !prevUrl ? 'aria-disabled="true" tabindex="-1"' : ""
               }>&larr;</a>
          </div>
          <div class="sticky-jump-box">
            <a href="#reader-toc-drawer" class="reader-btn" id="reader-toc-btn" role="button" aria-expanded="false">
              <span class="jump-val">${pageId}</span>
            </a>
          </div>
          <div class="sticky-primary-right">
            <a href="${nextUrl ?? "#"}"
               class="reader-btn reader-nav-arrow ${!nextUrl ? "disabled" : ""}"
               id="pager-next"
               ${
                 !nextUrl ? 'aria-disabled="true" tabindex="-1"' : ""
               }>&rarr;</a>
          </div>
        </div>
        </div>

      <div id="reader-toc-backdrop" class="reader-toc-backdrop" hidden></div>
      <aside id="reader-toc-drawer" class="reader-toc-drawer" hidden>
        <button id="reader-toc-close-btn">&times;</button>
        <div class="reader-toc-content">
          <details open>
            <summary>Liber I</summary>
            <ul class="reader-toc-list">
              <li><a href="/v2/reader/${author}/${name}/1" class="reader-toc-item ${
      pageId === "1" ? "active" : ""
    }" data-page-id="1">Caput 1</a></li>
              <li><a href="/v2/reader/${author}/${name}/2" class="reader-toc-item ${
      pageId === "2" ? "active" : ""
    }" data-page-id="2">Caput 2</a></li>
            </ul>
          </details>
        </div>
      </aside>

      <div class="reader-split-layout reader-layout-empty">
        <section class="reader-text-panel">
          <div class="reader-text-card">
            <header class="reader-text-card-header">
              <span class="reader-work-tag">De Bello Gallico</span>
              <h1 class="reader-passage-heading">Liber I: Caput ${pageId}</h1>
            </header>
            <article class="reader-passage" id="reader-passage">
              ${
                options.passageHtml ??
                `<div class="reader-section" id="sec-1.1"><p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p></div>`
              }
            </article>
            ${options.notesHtml ?? ""}
            <footer class="reader-passage-footer">
              <nav class="reader-continuation-actions">
                ${
                  prevUrl
                    ? `<a href="${prevUrl}" class="reader-continuation-card prev-card">Previous</a>`
                    : ""
                }
                ${
                  nextUrl
                    ? `<a href="${nextUrl}" class="reader-continuation-card next-card">Next</a>`
                    : ""
                }
              </nav>
              <div class="reader-library-nav">
                <a href="/v2/library" class="reader-library-link">Return to Library Catalog</a>
              </div>
            </footer>
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
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }

  const page2CardHtml = `
    <div class="reader-text-card">
      <header class="reader-text-card-header">
        <span class="reader-work-tag">De Bello Gallico</span>
        <h1 class="reader-passage-heading">Liber I: Caput 2</h1>
      </header>
      <article class="reader-passage" id="reader-passage">
        <div class="reader-section" id="sec-1.2">
          <p class="reader-paragraph">Apud Helvetios longe nobilissimus fuit Orgetorix.</p>
        </div>
      </article>
      <footer class="reader-passage-footer">
        <nav class="reader-continuation-actions">
          <a href="/v2/reader/caesar/de-bello-gallico/1" class="reader-continuation-card prev-card">Previous</a>
          <a href="/v2/reader/caesar/de-bello-gallico/3" class="reader-continuation-card next-card">Next</a>
        </nav>
      </footer>
    </div>
  `;

  test("swapPage fetches partial HTML and swaps .reader-text-panel children without touching dictionary iframe", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const iframeBefore = el.querySelector<HTMLIFrameElement>("#dict-frame")!;

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2CardHtml,
    });

    const success = await el.swapPage("/v2/reader/caesar/de-bello-gallico/2");
    expect(success).toBe(true);

    expect(window.fetch).toHaveBeenCalledWith(
      "http://localhost/v2/reader/caesar/de-bello-gallico/2",
      expect.objectContaining({
        headers: { "X-Requested-With": "fetch" },
        signal: expect.any(AbortSignal),
      })
    );

    // Dataset and sticky bar updated
    expect(el.dataset.page).toBe("2");
    expect(el.querySelector("#reader-toc-btn .jump-val")?.textContent).toBe(
      "2"
    );

    // Iframe preserved (same instance in DOM)
    const iframeAfter = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    expect(iframeAfter).toBe(iframeBefore);

    // Sticky navigation arrows updated
    const pagerPrev = el.querySelector<HTMLAnchorElement>("#pager-prev")!;
    const pagerNext = el.querySelector<HTMLAnchorElement>("#pager-next")!;
    expect(pagerPrev.getAttribute("href")).toBe(
      "/v2/reader/caesar/de-bello-gallico/1"
    );
    expect(pagerPrev.classList.contains("disabled")).toBe(false);
    expect(pagerNext.getAttribute("href")).toBe(
      "/v2/reader/caesar/de-bello-gallico/3"
    );
    expect(pagerNext.classList.contains("disabled")).toBe(false);

    // Table of contents active item updated
    const tocItem1 = el.querySelector<HTMLElement>(
      '.reader-toc-item[data-page-id="1"]'
    )!;
    const tocItem2 = el.querySelector<HTMLElement>(
      '.reader-toc-item[data-page-id="2"]'
    )!;
    expect(tocItem1.classList.contains("active")).toBe(false);
    expect(tocItem2.classList.contains("active")).toBe(true);
    expect(tocItem2.getAttribute("aria-current")).toBe("page");

    // New passage is tokenized
    const words = el.querySelectorAll<HTMLElement>(".lat-word");
    expect(words.length).toBeGreaterThan(0);
    const wordTexts = Array.from(words).map((w) => w.textContent);
    expect(wordTexts).toContain("Apud");
    expect(wordTexts).toContain("Orgetorix");

    // Saved spot updated
    expect(savedSpotsStore.get("caesar_de_bello_gallico")).toBe("2");
  });

  test("clicking #pager-next intercepts click and swaps page", async () => {
    const el = createNavigableReaderView({ pageId: "1" });

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2CardHtml,
    });

    const pagerNext = el.querySelector<HTMLAnchorElement>("#pager-next")!;
    pagerNext.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(window.fetch).toHaveBeenCalled();
    expect(el.dataset.page).toBe("2");
  });

  test("clicking continuation card next-card intercepts click and swaps page", async () => {
    const el = createNavigableReaderView({ pageId: "1" });

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2CardHtml,
    });

    const nextCard = el.querySelector<HTMLAnchorElement>(
      ".reader-continuation-card.next-card"
    )!;
    nextCard.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(window.fetch).toHaveBeenCalled();
    expect(el.dataset.page).toBe("2");
  });

  test("clicking Table of Contents link closes TOC drawer and swaps page", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const tocController = el.getTocController()!;

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2CardHtml,
    });

    tocController.open();
    expect(tocController.isOpen()).toBe(true);

    const tocItem2 = el.querySelector<HTMLAnchorElement>(
      '.reader-toc-item[data-page-id="2"]'
    )!;
    tocItem2.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(tocController.isOpen()).toBe(false);
    expect(el.dataset.page).toBe("2");
  });

  test("page turn minimizes mobile drawer", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;

    // 1. Expand drawer
    el.restoreDrawer(60);
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);

    // 2. Perform page turn to page 2
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2CardHtml,
    });

    await el.swapPage("/v2/reader/caesar/de-bello-gallico/2");
    // Drawer should be minimized on page turn
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(true);
  });

  test("swapPage coordinates with translation companion tab when work has translation", async () => {
    const el = createNavigableReaderView({
      pageId: "1",
      author: "sallust",
      name: "catalina1",
      hasTranslation: true,
    });

    const panelController = el.getPanelController();
    expect(panelController).not.toBeNull();

    const translationHtml =
      '<div class="reader-translation-content">Trans Page 2</div>';

    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/translation")) {
        return Promise.resolve({
          ok: true,
          text: async () => translationHtml,
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => page2CardHtml,
      });
    });
    window.fetch = fetchMock;

    // 1. When Translation tab is active, page swap fetches translation in parallel
    panelController?.setTab("translation");
    expect(panelController?.activeTab).toBe("translation");

    await el.swapPage("/v2/reader/sallust/catalina1/2");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v2/reader/sallust/catalina1/2"),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/v2/reader/sallust/catalina1/2/translation",
      expect.anything()
    );

    const transView = el.querySelector("#panel-view-translation");
    expect(transView?.textContent).toContain("Trans Page 2");

    // 2. When switching away from Translation tab, swapPage resets translation state
    panelController?.setTab("dict");
    expect(panelController?.activeTab).toBe("dict");

    fetchMock.mockClear();
    await el.swapPage("/v2/reader/sallust/catalina1/1");

    // Only page partial is fetched, not translation
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v2/reader/sallust/catalina1/1"),
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/v2/reader/sallust/catalina1/1/translation",
      expect.anything()
    );
  });

  test("disabled pager arrow prevents navigation and does not fetch", () => {
    const el = createNavigableReaderView({
      pageId: "1",
      prevPageUrl: undefined,
    });
    window.fetch = jest.fn();

    const pagerPrev = el.querySelector<HTMLAnchorElement>("#pager-prev")!;
    expect(pagerPrev.classList.contains("disabled")).toBe(true);

    pagerPrev.click();
    expect(window.fetch).not.toHaveBeenCalled();
    expect(el.dataset.page).toBe("1");
  });

  test("external links and library catalog links are not intercepted", () => {
    const el = createNavigableReaderView({ pageId: "1" });
    window.fetch = jest.fn();

    const libraryLink = el.querySelector<HTMLAnchorElement>(
      ".reader-library-link"
    )!;
    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    libraryLink.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test("modified clicks (Ctrl/Cmd) are not intercepted", () => {
    const el = createNavigableReaderView({ pageId: "1" });
    window.fetch = jest.fn();

    const pagerNext = el.querySelector<HTMLAnchorElement>("#pager-next")!;
    const evt = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    pagerNext.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test("swapping to page with notes adopts notes dynamically and updates companion tabs", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const panelController = el.getPanelController()!;
    expect(panelController.hasNotes).toBe(false);

    const pageWithNotesHtml = `
      <div class="reader-text-card">
        <header class="reader-text-card-header">
          <h1 class="reader-passage-heading">Liber I: Caput 2</h1>
        </header>
        <article class="reader-passage" id="reader-passage">
          <p>Text with note <a href="#note-n1" class="reader-note-ref" id="noteref-n1">[1]</a></p>
        </article>
        <section class="reader-notes" id="reader-notes">
          <div class="reader-note" id="note-n1">
            <span class="reader-note-num">[1]</span>
            <span class="reader-note-text">Critical note content</span>
          </div>
        </section>
        <footer class="reader-passage-footer">
          <nav class="reader-continuation-actions">
            <a href="/v2/reader/caesar/de-bello-gallico/1" class="reader-continuation-card prev-card">Previous</a>
          </nav>
        </footer>
      </div>
    `;

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => pageWithNotesHtml,
    });

    await el.swapPage("/v2/reader/caesar/de-bello-gallico/2");

    expect(panelController.hasNotes).toBe(true);
    expect(panelController.noteCount).toBe(1);
    expect(panelController.notesTab?.hidden).toBe(false);
  });

  test("popstate navigation triggers page swap without pushing history and restores scroll position", async () => {
    const el = createNavigableReaderView({ pageId: "1" });

    // Swap to page 2
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2CardHtml,
    });
    await el.swapPage("/v2/reader/caesar/de-bello-gallico/2");
    expect(el.dataset.page).toBe("2");

    // Mock page 1 HTML for popstate return
    const page1CardHtml = `
      <div class="reader-text-card">
        <header class="reader-text-card-header">
          <h1 class="reader-passage-heading">Liber I: Caput 1</h1>
        </header>
        <article class="reader-passage" id="reader-passage">
          <div class="reader-section" id="sec-1.1"><p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p></div>
        </article>
      </div>
    `;
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page1CardHtml,
    });

    // Simulate browser back button to page 1 with saved scrollY: 180
    window.history.replaceState(
      { scrollY: 180 },
      "",
      "/v2/reader/caesar/de-bello-gallico/1"
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { scrollY: 180 } })
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(window.fetch).toHaveBeenCalledWith(
      "http://localhost/v2/reader/caesar/de-bello-gallico/1",
      expect.any(Object)
    );
    expect(el.dataset.page).toBe("1");
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 180,
      left: 0,
      behavior: "instant",
    });
  });

  test("network failure during swap renders error placeholder and does not push history", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const pushStateSpy = jest.spyOn(window.history, "pushState");
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    window.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const success = await el.swapPage("/v2/reader/caesar/de-bello-gallico/2");
    expect(success).toBe(false);

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(el.dataset.page).toBe("1");
    expect(el.querySelector(".no-results")).not.toBeNull();

    pushStateSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
