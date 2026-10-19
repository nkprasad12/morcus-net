/**
 * @jest-environment jsdom
 */
import "@/web/v2/reader/reader_view.client";
import type { MorcusReaderView } from "@/web/v2/reader/reader_view.client";
import {
  DEFAULT_READER_PREFS,
  READER_SETTINGS_KEY,
} from "@/web/v2/reader/reader_settings.client";
import {
  DRAWER_DEFAULT_SVH,
  DRAWER_EXPANDED_SVH,
  DRAWER_FLOOR_SVH,
} from "@/web/v2/core/widgets/drawer.client";
import { savedSpotsStore } from "@/web/v2/reader/saved_spots.client";
import { WAKE_LOCK_IDLE_MS } from "@/web/v2/core/widgets/wake_lock.client";
import { revealTarget } from "@/web/v2/core/nav/reveal.client";
import { PREPAINT_KEY } from "@/web/v2/core/dom/prepaint.client";
import { currentIframeSrc } from "@/web/v2/core/dom/dom.client";

import { installPointerEventShims } from "@/web/v2/testing/pointer_events";
import {
  renderReaderDictPanelHtml,
  renderReaderNotesSlot,
} from "@/web/v2/reader/reader.server";

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

installPointerEventShims();

/** The server-rendered dictionary panel, with its companion tabs and views. */
function dictPanelHtml(
  options: {
    notesHtml?: string;
    aboutHtml?: string;
    hasTranslation?: boolean;
  } = {}
): string {
  return renderReaderDictPanelHtml({
    query: "",
    dictIframeSrc: "/dicts?embedded=1",
    closeHref: "/work",
    companion: {
      notesHtml: options.notesHtml ?? "",
      aboutHtml: options.aboutHtml ?? "",
      hasTranslation: options.hasTranslation ?? false,
    },
  });
}

/**
 * Simulates the browser restoring `url` on Back/Forward: the entry is already
 * current when `popstate` fires.
 */
function popStateTo(url: string): void {
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Clicks the dictionary's close link, as a reader does to dismiss it. */
function clickDictClose(el: MorcusReaderView): void {
  el.querySelector<HTMLAnchorElement>(".reader-sheet-close")!.click();
}

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
  // Production passages wrap each section's text in `.reader-section > .reader-passage`.
  const normalizedPassageHtml = innerPassageHtml.includes("reader-section")
    ? innerPassageHtml
    : `<div class="reader-section"><div class="reader-passage">${innerPassageHtml}</div></div>`;
  el.innerHTML = `
    <div class="reader-split-layout reader-layout-empty">
      <section class="reader-text-panel">
        <div class="reader-text-card">
          <header class="reader-text-card-header">
            <div class="reader-text-meta"></div>
          </header>
          <article class="reader-passage" id="reader-passage">
            ${normalizedPassageHtml}
          </article>
        </div>
      </section>
      ${dictPanelHtml(options)}
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
        <div class="reader-passage">
          <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304, quo\u0304 nu\u0304mine laeso\u0304.</span>
        </div>
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
        <div class="reader-passage">
          <span class="reader-line">M\u016Bsa, mihi caus\u0101s memor\u0101.</span>
        </div>
      </div>
    `;

    const el = createReaderView(passageHtml);

    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    expect(wordTexts).toEqual(["Mūsa", "mihi", "causās", "memorā"]);
  });

  test("scopes tokenization to .reader-section > .reader-passage", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <div class="reader-passage">
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
        ".reader-section > .reader-passage .lat-word"
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
        <div class="reader-passage">
          <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
        </div>
      </div>
    `;

    window.history.replaceState(null, "", "/work/vergil/aeneid/1");
    const pushStateSpy = jest.spyOn(window.history, "pushState");
    const el = createReaderView(passageHtml);
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    const replaceSpy = jest.spyOn(iframe.contentWindow!.location, "replace");
    const musaWord = el.querySelector<HTMLElement>(".lat-word")!;
    expect(musaWord.textContent).toBe("Mu\u0304sa");

    musaWord.click();

    // Word receives active highlight class
    expect(musaWord.classList.contains("word-active")).toBe(true);

    // Dictionary iframe is navigated via location.replace without pushing ?q= to parent URL
    expect(replaceSpy).toHaveBeenCalledWith(
      "/dicts?q=Mu%CC%84sa&lang=La&o=1&embedded=1&scale=100"
    );
    expect(currentIframeSrc(iframe)).toContain(
      "/dicts?q=Mu%CC%84sa&lang=La&o=1&embedded=1"
    );
    expect(pushStateSpy).not.toHaveBeenCalled();
    pushStateSpy.mockRestore();
    expect(window.location.search).toBe("");

    // If the user navigates inside the iframe (e.g. a typed English search that leaves lang=La),
    // clicking the same passage word again reloads the word's lookup into the iframe.
    const innerReplaceSpy = jest.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: {
        location: {
          pathname: "/dicts",
          search: "?q=love&o=1&embedded=1&scale=100",
          replace: innerReplaceSpy,
        },
      },
    });
    el.minimizeDrawer();
    musaWord.click();
    expect(innerReplaceSpy).toHaveBeenCalledWith(
      "/dicts?q=Mu%CC%84sa&lang=La&o=1&embedded=1&scale=100"
    );
  });

  test("clicking a word reflects customized dictScale in iframe query param", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({ dictScale: 120 })
    );
    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <div class="reader-passage">
          <span class="reader-line">arma virumque cano</span>
        </div>
      </div>
    `;
    const el = createReaderView(passageHtml);
    const armaWord = el.querySelector<HTMLElement>(".lat-word")!;
    armaWord.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    expect(currentIframeSrc(iframe)).toContain(
      "/dicts?q=arma&lang=La&o=1&embedded=1&scale=120"
    );
    localStorage.removeItem(READER_SETTINGS_KEY);
  });

  test("a query restored from the URL highlights the word whether unaccented, NFC, or NFD", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.8">
        <div class="reader-passage">
          <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
        </div>
      </div>
    `;

    window.history.replaceState(null, "", "/");
    const el = createReaderView(passageHtml);
    const musaWord = el.querySelector<HTMLElement>(".lat-word")!;
    const isOnlyActiveWord = () =>
      musaWord.classList.contains("word-active") &&
      el.querySelectorAll(".word-active").length === 1;

    for (const q of [
      "musa", // Unaccented
      "M\u016Bsa", // NFC precomposed
      "Mu\u0304sa", // Exact NFD
    ]) {
      popStateTo(`/?${new URLSearchParams({ q }).toString()}`);
      expect(isOnlyActiveWord()).toBe(true);
      // Back to no query clears it, so each case is matched afresh.
      popStateTo("/");
      expect(el.querySelectorAll(".word-active")).toHaveLength(0);
    }
  });

  test("toggling Show Macra in settings strips and restores vowel markings", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.8">
        <div class="reader-passage">
          <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
        </div>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    expect(words[0].textContent).toBe("Mu\u0304sa");
    expect(words[2].textContent).toBe("causa\u0304s");
    // Unstripped words on connect do not allocate data-original-text
    expect(words[0].hasAttribute("data-original-text")).toBe(false);

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
        <div class="reader-passage">
          <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
        </div>
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
        <div class="reader-passage">
          <span class="reader-line">Gallia est omnis divisa in partes tres.</span>
        </div>
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
        <div class="reader-passage">
          <span class="reader-line">Arma virumque cano.</span>
        </div>
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
        <div class="reader-passage">
          <span class="reader-line">Arma virumque cano.</span>
        </div>
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

  describe("drawer behavior", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.1">
        <div class="reader-passage">
          <span class="reader-line">Arma virumque cano.</span>
        </div>
      </div>
    `;

    test("revealing #reader-dict (pre-upgrade :target, later hashes) restores the drawer once", () => {
      const el = createReaderView(passageHtml);
      el.minimizeDrawer();
      const restore = jest.spyOn(el, "restoreDrawer");
      const dictPanel = el.querySelector<HTMLElement>("#reader-dict")!;

      revealTarget(dictPanel);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);

      // Already open: revealing again is a no-op rather than re-running restoreDrawer.
      revealTarget(dictPanel);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);
    });

    test("restoreDrawer clamps target svh within [DRAWER_FLOOR_SVH, DRAWER_EXPANDED_SVH] and falls back to DRAWER_DEFAULT_SVH", () => {
      const el = createReaderView(passageHtml);
      const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
      const sheetBar = el.querySelector<HTMLElement>(".reader-sheet-bar")!;

      // Default restore (omitted targetSvh) sets DRAWER_DEFAULT_SVH
      el.restoreDrawer();
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe(
        `${DRAWER_DEFAULT_SVH}svh`
      );
      expect(sheetBar.getAttribute("aria-valuenow")).toBe(
        String(DRAWER_DEFAULT_SVH)
      );

      // Clamps below floor threshold to DRAWER_FLOOR_SVH
      el.restoreDrawer(DRAWER_FLOOR_SVH - 10);
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe(
        `${DRAWER_FLOOR_SVH}svh`
      );
      expect(sheetBar.getAttribute("aria-valuenow")).toBe(
        String(DRAWER_FLOOR_SVH)
      );

      // Clamps above expanded threshold to DRAWER_EXPANDED_SVH
      el.restoreDrawer(DRAWER_EXPANDED_SVH + 10);
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe(
        `${DRAWER_EXPANDED_SVH}svh`
      );
      expect(sheetBar.getAttribute("aria-valuenow")).toBe(
        String(DRAWER_EXPANDED_SVH)
      );
    });

    test("scrollTargetAboveDrawer computes drawerTop deterministically from preferredDrawerSvh without reading dictPanel geometry", () => {
      const origInnerWidth = Object.getOwnPropertyDescriptor(
        window,
        "innerWidth"
      );
      const origInnerHeight = Object.getOwnPropertyDescriptor(
        window,
        "innerHeight"
      );
      const origRaf = window.requestAnimationFrame;
      const origScrollBy = window.scrollBy;

      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: 375,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 800,
      });
      const rafCallbacks: FrameRequestCallback[] = [];
      window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      }) as typeof window.requestAnimationFrame;
      const scrollByMock = jest.fn();
      window.scrollBy = scrollByMock;

      try {
        const el = createReaderView(passageHtml);
        const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
        const dictRectSpy = jest.spyOn(dictPanel, "getBoundingClientRect");

        // Set preferredDrawerSvh to 50 -> drawerTop = 800 * (1 - 0.5) = 400 (threshold = 400 - 24 = 376)
        el.restoreDrawer(50);
        dictRectSpy.mockClear();

        const word = el.querySelector<HTMLElement>(".lat-word")!;
        word.getBoundingClientRect = jest.fn(
          () => ({ bottom: 500 } as DOMRect)
        );

        word.click();
        rafCallbacks.forEach((cb) => cb(0));

        expect(dictRectSpy).not.toHaveBeenCalled();
        expect(scrollByMock).toHaveBeenCalledWith({
          top: 124, // 500 - (400 - 24)
          left: 0,
          behavior: "smooth",
        });
      } finally {
        if (origInnerWidth) {
          Object.defineProperty(window, "innerWidth", origInnerWidth);
        }
        if (origInnerHeight) {
          Object.defineProperty(window, "innerHeight", origInnerHeight);
        }
        window.requestAnimationFrame = origRaf;
        window.scrollBy = origScrollBy;
      }
    });

    test("scrolls initial ?q= word into view on connect when no hash is present, and skips when hash is present", () => {
      const origInnerHeight = Object.getOwnPropertyDescriptor(
        window,
        "innerHeight"
      );
      const origScrollTo = window.scrollTo;
      const origGetBCR = HTMLElement.prototype.getBoundingClientRect;

      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 800,
      });
      const scrollToSpy = jest.fn();
      window.scrollTo = scrollToSpy;
      HTMLElement.prototype.getBoundingClientRect = function (
        this: HTMLElement
      ) {
        if (this.classList.contains("lat-word")) {
          return { top: 2000, bottom: 2020 } as DOMRect;
        }
        return origGetBCR.call(this);
      };

      try {
        window.history.replaceState(null, "", "/work?q=arma");
        const el = createReaderView(passageHtml);
        expect(
          el.querySelector(".lat-word")?.classList.contains("word-active")
        ).toBe(true);
        expect(scrollToSpy).toHaveBeenCalledWith(
          expect.objectContaining({ behavior: "instant" })
        );

        document.body.innerHTML = "";
        scrollToSpy.mockClear();
        window.history.replaceState(null, "", "/work?q=arma#sec-1.1");
        const elWithHash = createReaderView(passageHtml);
        expect(
          elWithHash
            .querySelector(".lat-word")
            ?.classList.contains("word-active")
        ).toBe(true);
        expect(scrollToSpy).not.toHaveBeenCalled();
      } finally {
        window.history.replaceState(null, "", "/");
        if (origInnerHeight) {
          Object.defineProperty(window, "innerHeight", origInnerHeight);
        }
        window.scrollTo = origScrollTo;
        HTMLElement.prototype.getBoundingClientRect = origGetBCR;
      }
    });
  });

  describe("active word highlight", () => {
    const PASSAGE = `
      <div class="reader-section" id="sec-1.8">
        <div class="reader-passage">
          <span class="reader-line">Mu\u0304sa, mihi\u0304 causa\u0304s memora\u0304.</span>
        </div>
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
      window.history.replaceState(null, "", "/");
      const el = createReaderView(PASSAGE);
      const word = textPanelWords(el)[0];

      word.click();
      expect(word.classList.contains("word-active")).toBe(true);

      clickDictClose(el);

      expect(el.querySelectorAll(".word-active")).toHaveLength(0);
    });

    /**
     * Clearing the passage highlight must not reach into other panels (such as the
     * dictionary panel), which is why the query stays scoped to `.reader-text-panel`.
     */
    test("leaves an active word outside the text panel alone", () => {
      const el = createReaderView(PASSAGE);
      const entryWord = document.createElement("a");
      entryWord.className = "lat-word word-active";
      el.querySelector(".reader-dict-panel")!.appendChild(entryWord);

      textPanelWords(el)[0].click();
      expect(entryWord.classList.contains("word-active")).toBe(true);

      clickDictClose(el);
      expect(textPanelWords(el)[0].classList.contains("word-active")).toBe(
        false
      );
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

  describe("words split across inline markup", () => {
    // Cicero phi0474.phi043 1.1: `<hi>im</hi>petu`, with a macron in the
    // styled part to exercise `applyMacra` per part.
    const PASSAGE = `
      <div class="reader-section" id="sec-1.1">
        <div class="reader-passage">
          <p class="reader-paragraph"><span class="italic">i\u0304m</span>petu liberavissent.</p>
        </div>
      </div>
    `;

    const wordsOf = (el: MorcusReaderView) =>
      Array.from(
        el.querySelectorAll<HTMLElement>(".reader-text-panel .lat-word")
      );

    afterEach(() => {
      history.replaceState(null, "", "/");
    });

    test("renders plain spans whose parts share the whole word", () => {
      const el = createReaderView(PASSAGE);
      const [first, second, next] = wordsOf(el);

      expect([first.textContent, second.textContent]).toEqual([
        "i\u0304m",
        "petu",
      ]);
      expect(first.dataset.word).toBe("i\u0304mpetu");
      expect(second.dataset.word).toBe("i\u0304mpetu");
      expect(first.dataset.wordGroup).toBeDefined();
      expect(second.dataset.wordGroup).toBe(first.dataset.wordGroup);
      // Words are prose, not controls: nothing is focusable, and no part
      // carries ARIA, so assistive tech reads the text once as written.
      for (const part of [first, second, next]) {
        expect(part.localName).toBe("span");
        expect(part.hasAttribute("role")).toBe(false);
        expect(part.hasAttribute("tabindex")).toBe(false);
        expect(part.hasAttribute("aria-label")).toBe(false);
        expect(part.hasAttribute("aria-hidden")).toBe(false);
      }
      // A whole word is unchanged.
      expect(next.textContent).toBe("liberavissent");
      expect(next.dataset.wordGroup).toBeUndefined();
    });

    test("clicking any part looks up the whole word and highlights every part", () => {
      const el = createReaderView(PASSAGE);
      const [first, second, next] = wordsOf(el);

      second.click();

      const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
      expect(currentIframeSrc(iframe)).toContain(
        `/dicts?q=${encodeURIComponent("i\u0304mpetu")}&`
      );
      expect(first.classList.contains("word-active")).toBe(true);
      expect(second.classList.contains("word-active")).toBe(true);

      next.click();
      expect(first.classList.contains("word-active")).toBe(false);
      expect(second.classList.contains("word-active")).toBe(false);
      expect(next.classList.contains("word-active")).toBe(true);
    });

    test("restores the highlight on every part from ?q=", () => {
      history.replaceState(null, "", "/work?q=impetu");
      const el = createReaderView(PASSAGE);
      const [first, second] = wordsOf(el);

      expect(first.classList.contains("word-active")).toBe(true);
      expect(second.classList.contains("word-active")).toBe(true);
    });

    test("hovering one part hovers the whole word", () => {
      const el = createReaderView(PASSAGE);
      const [first, second, next] = wordsOf(el);

      second.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      expect(first.classList.contains("word-hover")).toBe(true);
      expect(second.classList.contains("word-hover")).toBe(true);

      second.dispatchEvent(
        new MouseEvent("pointerout", { bubbles: true, relatedTarget: next })
      );
      expect(first.classList.contains("word-hover")).toBe(false);
      expect(second.classList.contains("word-hover")).toBe(false);
    });

    test("marks every part of a matchText word", () => {
      // Words [0, 1): `impetu` only.
      history.replaceState(null, "", "/work?matchText=1.1~0~1");
      const el = createReaderView(PASSAGE);
      const [first, second, next] = wordsOf(el);

      expect(first.classList.contains("reader-match")).toBe(true);
      expect(second.classList.contains("reader-match")).toBe(true);
      expect(next.classList.contains("reader-match")).toBe(false);
    });

    test("strips and restores macra in each part", () => {
      const el = createReaderView(PASSAGE);
      const [first, second] = wordsOf(el);
      const toggleMacra = el.querySelector<HTMLInputElement>("#toggle-macra")!;

      toggleMacra.checked = false;
      toggleMacra.dispatchEvent(new Event("change"));
      expect([first.textContent, second.textContent]).toEqual(["im", "petu"]);
      expect(first.parentElement!.classList.contains("italic")).toBe(true);

      toggleMacra.checked = true;
      toggleMacra.dispatchEvent(new Event("change"));
      expect(first.textContent).toBe("i\u0304m");
    });
  });
});

describe("Reader preferences validation & hydration", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-reader-hide-gutter");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-reader-hide-gutter");
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
    expect(
      document.documentElement.style.getPropertyValue("--reader-line-height")
    ).toBe("1.45");
  });

  it("records reader typography and the gutter on <html> for pre-paint, removing defaults", () => {
    const root = document.documentElement;
    const lineHeight = () =>
      root.style.getPropertyValue("--reader-line-height");
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({
        lineHeight: "compact",
        readerScale: 125,
        fontFamily: "sans",
        showGutter: false,
      })
    );
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    document.body.appendChild(el);
    expect(lineHeight()).toBe("1.45");
    expect(root.style.getPropertyValue("--reader-scale")).toBe("1.25");
    expect(root.style.getPropertyValue("--reader-font")).toBe(
      "var(--font-sans)"
    );
    expect(root.hasAttribute("data-reader-hide-gutter")).toBe(true);
    // One source: nothing is copied onto the element itself.
    expect(el.style.getPropertyValue("--reader-line-height")).toBe("");
    expect(JSON.parse(localStorage.getItem(PREPAINT_KEY) ?? "{}")).toEqual(
      expect.objectContaining({
        "--reader-line-height": "1.45",
        "--reader-scale": "1.25",
        "--reader-font": "var(--font-sans)",
        "data-reader-hide-gutter": "",
      })
    );

    el.dispatchEvent(
      new CustomEvent("reader-settings-change", {
        detail: { prefs: { ...DEFAULT_READER_PREFS, lineHeight: "relaxed" } },
        bubbles: true,
      })
    );
    expect(lineHeight()).toBe("1.85");

    el.dispatchEvent(
      new CustomEvent("reader-settings-change", {
        detail: { prefs: { ...DEFAULT_READER_PREFS, lineHeight: "normal" } },
        bubbles: true,
      })
    );
    // Defaults fall back to the `var(--reader-*, default)` CSS fallbacks.
    expect(lineHeight()).toBe("");
    expect(root.style.getPropertyValue("--reader-scale")).toBe("");
    expect(root.style.getPropertyValue("--reader-font")).toBe("");
    expect(root.hasAttribute("data-reader-hide-gutter")).toBe(false);
    expect(localStorage.getItem(PREPAINT_KEY)).not.toContain(
      "--reader-line-height"
    );
    expect(localStorage.getItem(PREPAINT_KEY)).not.toContain("--reader-scale");
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
          <iframe id="dict-frame" src="/dicts?embedded=1"></iframe>
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
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("470px");
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
    const { splitLayout, splitter, dictPanel } = createSplitterReaderView();
    const splitSpy = jest
      .spyOn(splitLayout, "getBoundingClientRect")
      .mockReturnValue({ width: 1200 } as DOMRect);

    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    // default 420 + 24 = 444
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("444px");
    expect(splitter.getAttribute("aria-valuenow")).toBe("444");

    splitter.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    // 444 - 24 = 420
    expect(dictPanel.style.getPropertyValue("--dict-width")).toBe("420px");
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

    const drawer = el.querySelector<HTMLElement>("#reader-toc-drawer")!;
    const button = el.querySelector<HTMLElement>("#reader-toc-btn")!;
    const tocOpen = () =>
      !drawer.hidden && button.getAttribute("aria-expanded") === "true";
    const press = (key: string) =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    expect(tocOpen()).toBe(false);

    press("t");
    expect(tocOpen()).toBe(true);

    press("T");
    expect(tocOpen()).toBe(false);

    // Disconnecting tears the shortcut down.
    el.remove();
    press("t");
    expect(tocOpen()).toBe(false);

    // Reconnecting attaches it exactly once: a duplicate listener would toggle
    // twice and leave the drawer closed.
    document.body.appendChild(el);
    press("t");
    expect(tocOpen()).toBe(true);
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
    const tocBtn = el.querySelector<HTMLButtonElement>("#reader-toc-btn")!;
    const tocDrawer = el.querySelector<HTMLElement>("#reader-toc-drawer")!;
    expect(settings).not.toBeNull();

    // Open settings popover
    settings?.open();
    expect(settings?.isOpen()).toBe(true);

    // Opening TOC closes settings
    tocBtn.click();
    expect(tocDrawer.hasAttribute("hidden")).toBe(false);
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

    // Pressing 'a' focuses #reader-settings-close-btn inside role="dialog";
    // dispatching 'a' from document.activeElement still closes the popover.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(settings?.isOpen()).toBe(true);
    expect(document.activeElement?.id).toBe("reader-settings-close-btn");
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(settings?.isOpen()).toBe(false);

    el.remove();
  });

  test("does not call preventDefault on KeyT when TOC drawer is absent or on KeyA when settings element is absent", () => {
    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.innerHTML = `
      <div class="sticky-primary-row">
        <button type="button" id="reader-settings-btn" aria-expanded="false">Aa</button>
      </div>
    `;
    document.body.appendChild(el);

    const settingsBtn = el.querySelector<HTMLButtonElement>(
      "#reader-settings-btn"
    )!;
    const clickSpy = jest.fn();
    settingsBtn.addEventListener("click", clickSpy);

    const tEvent = new KeyboardEvent("keydown", {
      key: "t",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(tEvent);
    expect(tEvent.defaultPrevented).toBe(false);

    const aEvent = new KeyboardEvent("keydown", {
      key: "a",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(aEvent);
    expect(aEvent.defaultPrevented).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();

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

  test("opens section action menu when section anchor is clicked and updates saved spot on Copy permalink", () => {
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

    const copyBtn = document.querySelector<HTMLButtonElement>(
      '.section-action-menu [data-action="copy"]'
    )!;
    expect(copyBtn).not.toBeNull();
    copyBtn.click();

    expect(savedSpotsStore.get("phi0448.phi001.perseus-lat2")).toBe("1.5");
  });

  test("copies permalink directly without opening menu on External Reader (when data-work is absent)", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1">
        <a href="#sec-1" class="section-anchor">1</a>
        <div class="reader-passage">Private pasted text</div>
      </div>
    `;
    const el = createReaderView(passageHtml);
    delete el.dataset.work;

    const anchor = el.querySelector<HTMLAnchorElement>("a.section-anchor")!;
    anchor.click();

    expect(document.querySelector(".section-action-menu")).toBeNull();
    const toast = document.getElementById("toast")!;
    expect(toast.textContent).toBe("Copied permalink: § 1");
  });

  test.each([{ ctrlKey: true }, { metaKey: true }])(
    "leaves a modified click (%o) on section anchors and note refs to the browser",
    (init) => {
      const passageHtml = `
        <div class="reader-section" id="sec-1.5">
          <a href="#sec-1.5" class="section-anchor">§ 1.5</a>
          <p class="reader-paragraph">Text<a href="#note-n1" class="reader-note-ref" id="noteref-n1">[1]</a></p>
        </div>
      `;
      const el = createReaderView(passageHtml);
      el.dataset.work = "phi0448.phi001.perseus-lat2";
      for (const sel of ["a.section-anchor", "a.reader-note-ref"]) {
        const click = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ...init,
        });
        el.querySelector(sel)!.dispatchEvent(click);
        expect(click.defaultPrevented).toBe(false);
      }
      expect(document.querySelector(".section-action-menu")).toBeNull();
    }
  );

  test("handles rapid consecutive section anchor copy actions without premature toast dismissal", () => {
    jest.useFakeTimers();
    try {
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
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="copy"]'
        )!
        .click();
      const toast = document.getElementById("toast")!;
      expect(toast).not.toBeNull();
      expect(toast.classList.contains("visible")).toBe(true);

      // Advance 1500ms (less than 2200ms timeout), then copy again
      jest.advanceTimersByTime(1500);
      anchor.click();
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="copy"]'
        )!
        .click();
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

  test("supports in-flow section editing, strips apparatus note refs, preserves verse newlines, and submits editedText", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    const origFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const passageHtml = `
        <div class="reader-section section-verse" id="sec-1.1">
          <div class="reader-gutter">
            <a href="#sec-1.1" class="section-anchor">1.1</a>
          </div>
          <div class="reader-passage">
            <span class="reader-line">Arma virumque cano<a href="#note-1" class="reader-note-ref"><sup>[1]</sup></a>,</span>
            <span class="reader-line">Troiae qui primus ab oris</span>
          </div>
        </div>
      `;
      const el = createReaderView(passageHtml);
      el.dataset.work = "hypotactic_Aeneid_Vergil";
      el.dataset.page = "1";

      const anchor = el.querySelector<HTMLAnchorElement>("a.section-anchor")!;
      anchor.click();

      const editBtn = document.querySelector<HTMLButtonElement>(
        '.section-action-menu [data-action="edit"]'
      )!;
      expect(editBtn).not.toBeNull();
      editBtn.click();

      const secEl = document.getElementById("sec-1.1")!;
      const editBox = secEl.querySelector<HTMLElement>(".section-edit-box")!;
      expect(editBox).not.toBeNull();

      const textarea = editBox.querySelector<HTMLTextAreaElement>(
        ".section-edit-input"
      )!;
      // Strips [1] note ref and joins .reader-line with newline
      expect(textarea.value).toBe(
        "Arma virumque cano,\nTroiae qui primus ab oris"
      );

      textarea.value = "Arma virumque cano,\nTroiae qui primus ab ora";
      editBox.querySelector<HTMLButtonElement>(".section-edit-submit")!.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/report",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"sectionId":"1.1"'),
        })
      );
      expect(secEl.querySelector(".section-edit-box")).toBeNull();
      expect(
        secEl.querySelectorAll(".reader-passage .lat-word").length
      ).toBeGreaterThan(0);
    } finally {
      global.fetch = origFetch;
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
      <div class="reader-passage">
        <span class="reader-line">Gallia <span class="lat-word" data-word="divisa">divisa</span> in partes tres.
          <a class="reader-note-ref" id="noteref-n1" href="#note-n1" role="doc-noteref" aria-label="Note 1"><sup>[1]</sup></a>
        </span>
        <span class="reader-line">Aliam incolunt Belgae.
          <a class="reader-note-ref" id="noteref-n2" href="#note-n2" role="doc-noteref" aria-label="Note 2"><sup>[2]</sup></a>
        </span>
      </div>
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
    expect(scrollMock).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  test("clicking Latin word while in notes tab force-switches panel back to dictionary", () => {
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

    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    expect(currentIframeSrc(iframe)).toContain("q=divisa");
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

    // Minimizing the sheet and clicking the already-active tab pill expands it again.
    const dictPanel = el.querySelector<HTMLElement>("#reader-dict")!;
    el.minimizeDrawer();
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(true);
    notesTab?.click();
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);
  });

  test("revealing a note and openNote restore the drawer at most once and never reset scroll after scrolling to the note", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });
    const restore = jest.spyOn(el, "restoreDrawer");
    const notesView = el.querySelector<HTMLElement>("#panel-view-notes")!;
    const note = el.querySelector<HTMLElement>("#note-n1")!;
    const events: string[] = [];
    notesView.scrollTo = jest.fn(() => {
      events.push("resetScroll");
    });
    note.scrollIntoView = jest.fn(() => {
      events.push("scrollIntoView");
    });

    revealTarget(note);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["scrollIntoView"]);

    // Second reveal of the same note re-highlights without re-restoring or resetting scroll.
    events.length = 0;
    revealTarget(note);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["scrollIntoView"]);

    // Clicking a note marker while the panel is already open does not reset scroll after scrollIntoView.
    events.length = 0;
    const marker = el.querySelector<HTMLAnchorElement>("#noteref-n1")!;
    marker.click();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["scrollIntoView"]);
  });

  test("clicking note backlink marks the corresponding marker in the passage and scrolls it above the drawer", () => {
    const origInnerWidth = Object.getOwnPropertyDescriptor(
      window,
      "innerWidth"
    );
    const origInnerHeight = Object.getOwnPropertyDescriptor(
      window,
      "innerHeight"
    );
    const origRaf = window.requestAnimationFrame;
    const origScrollTo = window.scrollTo;
    const origScrollBy = window.scrollBy;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 375,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    const scrollToSpy = jest.fn();
    const scrollBySpy = jest.fn();
    window.scrollTo = scrollToSpy;
    window.scrollBy = scrollBySpy;

    try {
      const el = createReaderView(samplePassageWithNotes, {
        notesHtml: sampleNotesHtml,
      });
      el.restoreDrawer(50);

      const marker = el.querySelector<HTMLElement>("#noteref-n1")!;
      // First off-screen (top: -120 < stickyBottom 0), then after scrollTo it sits at bottom: 500 (> drawerTop - 24 = 376)
      let calls = 0;
      marker.getBoundingClientRect = jest.fn(() => {
        calls += 1;
        return calls === 1
          ? ({ top: -120, bottom: -100 } as DOMRect)
          : ({ top: 480, bottom: 500 } as DOMRect);
      });

      const backlink = el.querySelector<HTMLAnchorElement>(
        'a.reader-note-backref[href="#noteref-n1"]'
      )!;
      expect(backlink).not.toBeNull();

      backlink.click();
      rafCallbacks.forEach((cb) => cb(0));

      expect(marker.classList.contains("marker-active")).toBe(true);
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: "instant" })
      );
      expect(scrollBySpy).toHaveBeenCalledWith({
        top: 124,
        left: 0,
        behavior: "smooth",
      });
    } finally {
      if (origInnerWidth) {
        Object.defineProperty(window, "innerWidth", origInnerWidth);
      }
      if (origInnerHeight) {
        Object.defineProperty(window, "innerHeight", origInnerHeight);
      }
      window.requestAnimationFrame = origRaf;
      window.scrollTo = origScrollTo;
      window.scrollBy = origScrollBy;
    }
  });

  test("dismissing dictionary resets companion panel to dictionary tab and clears active highlights", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });

    const marker = el.querySelector<HTMLAnchorElement>("#noteref-n1")!;
    marker.click();

    const panelController = el.getPanelController();
    expect(panelController?.activeTab).toBe("notes");
    expect(marker.classList.contains("marker-active")).toBe(true);

    clickDictClose(el);

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

  test("clicking About tab switches companion panel to about", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });

    const panelController = el.getPanelController();
    expect(panelController?.hasAbout).toBe(true);
    expect(panelController?.activeTab).toBe("dict");
    const aboutTab = el.querySelector<HTMLButtonElement>("#panel-tab-about");
    expect(aboutTab).not.toBeNull();

    aboutTab?.click();

    expect(panelController?.activeTab).toBe("about");
    const splitLayout = el.querySelector<HTMLElement>(".reader-split-layout");
    expect(splitLayout?.classList.contains("reader-layout-active")).toBe(true);
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

  test("resizing/restoring open drawer does not reset Notes or About scrollTop (RDR-10)", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
      aboutHtml: sampleAboutHtml,
    });
    const notesView = el.querySelector<HTMLElement>("#panel-view-notes")!;
    const aboutView = el.querySelector<HTMLElement>("#panel-view-about")!;
    const notesScrollSpy = jest.fn();
    const aboutScrollSpy = jest.fn();
    notesView.scrollTo = notesScrollSpy;
    aboutView.scrollTo = aboutScrollSpy;

    notesView.scrollTop = 180;
    aboutView.scrollTop = 95;

    // Resizing / restoring the drawer should preserve scroll positions
    el.restoreDrawer(68);
    expect(notesScrollSpy).not.toHaveBeenCalled();
    expect(aboutScrollSpy).not.toHaveBeenCalled();
    expect(notesView.scrollTop).toBe(180);
    expect(aboutView.scrollTop).toBe(95);

    // Minimizing the drawer still resets scroll positions
    el.minimizeDrawer();
    expect(notesScrollSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: "instant",
    });
    expect(aboutScrollSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: "instant",
    });
  });

  test("switching companion tabs clears .marker-active away from Notes and restores .word-active on Dictionary tab (RDR-11)", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
      aboutHtml: sampleAboutHtml,
    });
    const firstWord = el.querySelector<HTMLElement>(".lat-word")!;
    const marker = el.querySelector<HTMLAnchorElement>("#noteref-n1")!;
    const notesTab = el.querySelector<HTMLElement>("#panel-tab-notes")!;
    const aboutTab = el.querySelector<HTMLElement>("#panel-tab-about")!;
    const dictTab = el.querySelector<HTMLElement>("#panel-tab-dict")!;

    // 1. Click a word to look it up
    firstWord.click();
    expect(firstWord.classList.contains("word-active")).toBe(true);

    // 2. Click a note marker: switches to Notes tab, highlights marker, clears word highlight
    marker.click();
    expect(el.getPanelController()?.activeTab).toBe("notes");
    expect(marker.classList.contains("marker-active")).toBe(true);
    expect(firstWord.classList.contains("word-active")).toBe(false);

    // 3. Switch to About tab: clears .marker-active
    aboutTab.click();
    expect(el.getPanelController()?.activeTab).toBe("about");
    expect(marker.classList.contains("marker-active")).toBe(false);
    expect(firstWord.classList.contains("word-active")).toBe(false);

    // 4. Switch back to Notes via marker, then switch to Dictionary tab: clears .marker-active and restores .word-active
    marker.click();
    expect(marker.classList.contains("marker-active")).toBe(true);
    dictTab.click();
    expect(el.getPanelController()?.activeTab).toBe("dict");
    expect(marker.classList.contains("marker-active")).toBe(false);
    expect(firstWord.classList.contains("word-active")).toBe(true);

    // Verify switching back to Notes via tab click does not keep marker-active if not opened via marker
    notesTab.click();
    expect(marker.classList.contains("marker-active")).toBe(false);
  });

  test("pressing '/' on desktop before any word click activates split layout and loads /dicts?embedded=1 when iframe is about:blank (RDR-12)", () => {
    const el = createReaderView("<p>Gallia est omnis divisa.</p>");
    const split = el.querySelector<HTMLElement>(".reader-split-layout")!;
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;

    // Simulate initial desktop state before any word click with about:blank src
    split.classList.remove("reader-layout-active");
    split.classList.add("reader-layout-empty");
    iframe.setAttribute("src", "about:blank");
    iframe.setAttribute("data-dict-unarmed", "");

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true })
    );

    expect(split.classList.contains("reader-layout-active")).toBe(true);
    expect(iframe.hasAttribute("data-dict-unarmed")).toBe(false);
    expect(iframe.getAttribute("src")).toBe("/dicts?embedded=1");
  });

  test("ignores window shortcuts when defaultPrevented or isComposing is true", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });
    const panelController = el.getPanelController();
    expect(panelController?.activeTab).toBe("dict");

    // Pre-cancelled event (defaultPrevented)
    const preCancelled = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
    });
    preCancelled.preventDefault();
    window.dispatchEvent(preCancelled);
    expect(panelController?.activeTab).toBe("dict");

    // IME composition event (isComposing)
    const composing = new KeyboardEvent("keydown", {
      key: "i",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(composing);
    expect(composing.defaultPrevented).toBe(false);
    expect(panelController?.activeTab).toBe("dict");
  });

  test("ignores window shortcuts when target is inside contenteditable or ARIA text/selection widgets", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });
    const panelController = el.getPanelController();

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const editableChild = document.createElement("span");
    editable.appendChild(editableChild);
    document.body.appendChild(editable);

    const editableEvent = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
    });
    editableChild.dispatchEvent(editableEvent);
    expect(editableEvent.defaultPrevented).toBe(false);
    expect(panelController?.activeTab).toBe("dict");
    editable.remove();

    for (const role of ["textbox", "searchbox", "combobox", "listbox"]) {
      const widget = document.createElement("div");
      widget.setAttribute("role", role);
      const child = document.createElement("span");
      widget.appendChild(child);
      document.body.appendChild(widget);

      const ev = new KeyboardEvent("keydown", {
        key: "i",
        bubbles: true,
        cancelable: true,
      });
      child.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(panelController?.activeTab).toBe("dict");
      widget.remove();
    }
  });

  test("ignores window shortcuts when an external dialog, section menu, popover, or mobile menu is open or focused", () => {
    const el = createReaderView("<p>Gallia est omnis divisa</p>", {
      aboutHtml: sampleAboutHtml,
    });
    const panelController = el.getPanelController();

    // 1. Open <dialog open> (e.g. Report Issue modal) blocks even when event target is window
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.appendChild(dialog);
    const dialogEv = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(dialogEv);
    expect(dialogEv.defaultPrevented).toBe(false);
    expect(panelController?.activeTab).toBe("dict");
    dialog.remove();

    // 2. Open .section-action-menu blocks shortcuts
    const menu = document.createElement("div");
    menu.className = "section-action-menu";
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    const menuEv = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(menuEv);
    expect(menuEv.defaultPrevented).toBe(false);
    expect(panelController?.activeTab).toBe("dict");
    menu.remove();

    // 3. Open .mobile-menu[open] blocks shortcuts
    const mobileMenu = document.createElement("details");
    mobileMenu.className = "mobile-menu";
    mobileMenu.setAttribute("open", "");
    document.body.appendChild(mobileMenu);
    const mobileEv = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(mobileEv);
    expect(mobileEv.defaultPrevented).toBe(false);
    expect(panelController?.activeTab).toBe("dict");
    mobileMenu.remove();

    // 4. Closed #abbr-popover[popover] in DOM does NOT block shortcuts unless event target is inside it
    const popover = document.createElement("div");
    popover.setAttribute("popover", "manual");
    const popoverBtn = document.createElement("button");
    popover.appendChild(popoverBtn);
    document.body.appendChild(popover);

    const insidePopoverEv = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
    });
    popoverBtn.dispatchEvent(insidePopoverEv);
    expect(insidePopoverEv.defaultPrevented).toBe(false);
    expect(panelController?.activeTab).toBe("dict");

    const outsidePopoverEv = new KeyboardEvent("keydown", {
      key: "i",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(outsidePopoverEv);
    expect(outsidePopoverEv.defaultPrevented).toBe(true);
    expect(panelController?.activeTab).toBe("about");
    popover.remove();
  });

  test("minimizing the drawer resets scroll position on dict panel, notes view, and about view", () => {
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

    el.minimizeDrawer();

    expect(dictPanel.scrollTop).toBe(0);
    expect(notesView.scrollTop).toBe(0);
    expect(aboutView.scrollTop).toBe(0);
  });

  test("pressing '/' switches to dictionary tab, restores drawer, and focuses #dict-q inside #dict-frame", () => {
    const el = createReaderView(samplePassageWithNotes, {
      notesHtml: sampleNotesHtml,
    });
    const panelController = el.getPanelController()!;
    const splitLayout = el.querySelector<HTMLElement>(".reader-split-layout")!;
    const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;

    const frameDoc = document.implementation.createHTMLDocument("");
    frameDoc.body.innerHTML =
      '<input type="text" id="dict-q" value="existing" />';
    Object.defineProperty(iframe, "contentDocument", {
      value: frameDoc,
      configurable: true,
    });
    const dictInput = frameDoc.querySelector<HTMLInputElement>("#dict-q")!;
    const focusSpy = jest.spyOn(dictInput, "focus");
    const selectSpy = jest.spyOn(dictInput, "select");

    // Start on notes tab with minimized drawer
    panelController.setTab("notes");
    el.minimizeDrawer();
    expect(panelController.activeTab).toBe("notes");
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(true);

    const ev = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(panelController.activeTab).toBe("dict");
    expect(splitLayout.classList.contains("reader-layout-active")).toBe(true);
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);
    expect(dictInput.value).toBe("existing");
    expect(focusSpy).toHaveBeenCalled();
    expect(selectSpy).toHaveBeenCalled();
  });

  test("pressing '/' pre-fills #dict-q from a non-collapsed passage selection and ignores a collapsed caret", () => {
    const el = createReaderView('<p id="p1">«Gallia,» est omnis</p>');
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    const frameDoc = document.implementation.createHTMLDocument("");
    frameDoc.body.innerHTML =
      '<input type="text" id="dict-q" value="initial" />';
    Object.defineProperty(iframe, "contentDocument", {
      value: frameDoc,
      configurable: true,
    });
    const dictInput = frameDoc.querySelector<HTMLInputElement>("#dict-q")!;

    const p1 = el.querySelector<HTMLElement>("#p1")!;

    // 1. Collapsed caret selection does not overwrite #dict-q
    const collapsedRange = document.createRange();
    collapsedRange.setStart(p1.firstChild!, 1);
    collapsedRange.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(collapsedRange);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(dictInput.value).toBe("initial");

    // 2. Non-collapsed selection extracts first word ("Gallia")
    const wordRange = document.createRange();
    wordRange.selectNodeContents(p1);
    sel.removeAllRanges();
    sel.addRange(wordRange);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(dictInput.value).toBe("Gallia");
    sel.removeAllRanges();
  });

  test("pressing '/' before #dict-frame loads waits for load to pre-fill and focus #dict-q", () => {
    const el = createReaderView('<p id="p1">Belgae incolunt</p>');
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    const frameDoc = document.implementation.createHTMLDocument("");
    Object.defineProperty(iframe, "contentDocument", {
      value: frameDoc,
      configurable: true,
    });

    const p1 = el.querySelector<HTMLElement>("#p1")!;
    const range = document.createRange();
    range.selectNodeContents(p1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      })
    );
    sel.removeAllRanges();

    // Populate #dict-q and dispatch load on the iframe
    frameDoc.body.innerHTML = '<input type="text" id="dict-q" value="" />';
    const dictInput = frameDoc.querySelector<HTMLInputElement>("#dict-q")!;
    const focusSpy = jest.spyOn(dictInput, "focus");
    const selectSpy = jest.spyOn(dictInput, "select");

    iframe.dispatchEvent(new Event("load"));

    expect(dictInput.value).toBe("Belgae");
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  test("clicking a word before #dict-frame loads cancels any pending '/' focus", () => {
    const el = createReaderView('<p id="p1">Belgae incolunt</p>');
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    const frameDoc = document.implementation.createHTMLDocument("");
    Object.defineProperty(iframe, "contentDocument", {
      value: frameDoc,
      configurable: true,
    });

    const p1 = el.querySelector<HTMLElement>("#p1")!;
    const range = document.createRange();
    range.selectNodeContents(p1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      })
    );
    sel.removeAllRanges();

    // User clicks the second word ("incolunt") before the iframe finishes loading
    const words = el.querySelectorAll<HTMLElement>(".lat-word");
    words[1].click();

    frameDoc.body.innerHTML =
      '<input type="text" id="dict-q" value="incolunt" />';
    const dictInput = frameDoc.querySelector<HTMLInputElement>("#dict-q")!;
    const focusSpy = jest.spyOn(dictInput, "focus");

    iframe.dispatchEvent(new Event("load"));

    expect(dictInput.value).toBe("incolunt");
    expect(focusSpy).not.toHaveBeenCalled();
  });

  test("pressing '/' does not preventDefault when #dict-frame is absent", () => {
    const el = createReaderView('<p id="p1">Belgae incolunt</p>');
    el.querySelector<HTMLIFrameElement>("#dict-frame")!.remove();

    const ev = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  test("pressing '/' on an unarmed #dict-frame removes data-dict-unarmed, applies dictScale, and focuses #dict-q on load", () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({ dictScale: 120 })
    );
    const el = createReaderView('<p id="p1">Belgae incolunt</p>');
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    expect(iframe.hasAttribute("data-dict-unarmed")).toBe(true);
    expect(iframe.getAttribute("src")).toBe("/dicts?embedded=1");

    const frameDoc = document.implementation.createHTMLDocument("");
    Object.defineProperty(iframe, "contentDocument", {
      value: frameDoc,
      configurable: true,
    });

    const keyEv = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(keyEv);

    expect(keyEv.defaultPrevented).toBe(true);
    expect(iframe.hasAttribute("data-dict-unarmed")).toBe(false);
    expect(iframe.getAttribute("src")).toBe("/dicts?embedded=1&scale=120");

    frameDoc.body.innerHTML = '<input type="text" id="dict-q" value="" />';
    const dictInput = frameDoc.querySelector<HTMLInputElement>("#dict-q")!;
    const focusSpy = jest.spyOn(dictInput, "focus");
    iframe.dispatchEvent(new Event("load"));
    expect(focusSpy).toHaveBeenCalledTimes(1);
    localStorage.removeItem(READER_SETTINGS_KEY);
  });

  test("dismissing dictionary or turning pages without a query leaves #dict-frame armed and src intact", async () => {
    const el = createReaderView('<p id="p1">Belgae incolunt</p>');
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    const word = el.querySelector<HTMLElement>(".lat-word")!;
    word.click();
    expect(iframe.hasAttribute("data-dict-unarmed")).toBe(false);
    expect(currentIframeSrc(iframe)).toContain("q=Belgae");

    // Dismissing does not navigate the iframe back to /dicts?embedded=1
    clickDictClose(el);
    expect(iframe.hasAttribute("data-dict-unarmed")).toBe(false);
    expect(currentIframeSrc(iframe)).toContain("q=Belgae");

    // Looking up the same word again after dismiss still works
    word.click();
    expect(word.classList.contains("word-active")).toBe(true);
  });

  test("data-js-failed excludes unarmed #dict-frame from the JS-mode hide selector", () => {
    const el = createReaderView('<p id="p1">Belgae incolunt</p>');
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    const hideSelector =
      ".dict-iframe[data-dict-unarmed]:not([data-js-failed] *)";

    expect(iframe.matches(hideSelector)).toBe(true);

    el.setAttribute("data-js-failed", "");
    expect(iframe.matches(hideSelector)).toBe(false);
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

  /** Mirrors `renderReaderPagerLink`: the sticky bar's pager slot. */
  function pagerLinkHtml(dir: "prev" | "next", url: string | undefined) {
    return `<a href="${url ?? "#"}"
               class="reader-btn reader-nav-arrow ${!url ? "disabled" : ""}"
               id="pager-${dir}"
               data-slot="pager-${dir}"
               ${!url ? 'aria-disabled="true" tabindex="-1"' : ""}>${
      dir === "prev" ? "&larr;" : "&rarr;"
    }</a>`;
  }

  /** Mirrors `renderReaderPageLabel`. */
  function pageLabelHtml(pageId: string) {
    return `<span class="jump-val" data-slot="page-label">${pageId}</span>`;
  }

  /** A page-turn partial response, as `renderReaderPartialHtml` builds it. */
  function pageResponse(
    cardHtml: string,
    options: {
      pageId: string;
      prevUrl?: string;
      nextUrl?: string;
      notesHtml?: string;
    }
  ): string {
    return [
      `<template data-slot="text">${cardHtml.trim()}</template>`,
      `<template data-slot="pager-prev">${pagerLinkHtml(
        "prev",
        options.prevUrl
      )}</template>`,
      `<template data-slot="pager-next">${pagerLinkHtml(
        "next",
        options.nextUrl
      )}</template>`,
      `<template data-slot="page-label">${pageLabelHtml(
        options.pageId
      )}</template>`,
      `<template data-slot="notes">${renderReaderNotesSlot(
        options.notesHtml ?? ""
      )}</template>`,
    ].join("\n");
  }

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

    window.history.replaceState({}, "", `/work/${author}/${name}/${pageId}`);

    const el = document.createElement("morcus-reader-view") as MorcusReaderView;
    el.dataset.work = workId;
    el.dataset.author = author;
    el.dataset.name = name;
    el.dataset.page = pageId;
    el.dataset.hasTranslation = String(hasTranslation);
    el.dataset.hasMacra = "true";

    const prevUrl = options.prevPageUrl;
    const nextUrl = options.nextPageUrl ?? `/work/${author}/${name}/2`;

    el.innerHTML = `
      <div class="reader-sticky-bar" id="reader-sticky-bar">
        <div class="sticky-primary-row">
          <div class="sticky-primary-left">
            ${pagerLinkHtml("prev", prevUrl)}
          </div>
          <div class="sticky-jump-box">
            <a href="#reader-toc-drawer" class="reader-btn" id="reader-toc-btn" role="button" aria-expanded="false">
              ${pageLabelHtml(pageId)}
            </a>
          </div>
          <div class="sticky-primary-right">
            ${pagerLinkHtml("next", nextUrl)}
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
              <li><a href="/work/${author}/${name}/1" class="reader-toc-item ${
      pageId === "1" ? "active" : ""
    }" data-page-id="1">Caput 1</a></li>
              <li><a href="/work/${author}/${name}/2" class="reader-toc-item ${
      pageId === "2" ? "active" : ""
    }" data-page-id="2">Caput 2</a></li>
            </ul>
          </details>
        </div>
      </aside>

      <div class="reader-split-layout reader-layout-empty">
        <section class="reader-text-panel">
          <div class="reader-text-card" data-slot="text">
            <header class="reader-text-card-header">
              <span class="reader-work-tag">De Bello Gallico</span>
              <h1 class="reader-passage-heading">Liber I: Caput ${pageId}</h1>
            </header>
            <article class="reader-passage" id="reader-passage">
              ${
                options.passageHtml ??
                `<div class="reader-section" id="sec-1.1"><div class="reader-passage"><p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p></div></div>`
              }
            </article>
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
                <a href="/library" class="reader-library-link">Return to Library Catalog</a>
              </div>
            </footer>
          </div>
        </section>
        ${dictPanelHtml({ notesHtml: options.notesHtml, hasTranslation })}
      </div>
    `;

    document.body.appendChild(el);
    return el;
  }

  const page2CardHtml = `
    <div class="reader-text-card" data-slot="text">
      <header class="reader-text-card-header">
        <span class="reader-work-tag">De Bello Gallico</span>
        <h1 class="reader-passage-heading">Liber I: Caput 2</h1>
      </header>
      <article class="reader-passage" id="reader-passage">
        <div class="reader-section" id="sec-1.2">
          <div class="reader-passage"><p class="reader-paragraph">Apud Helvetios longe nobilissimus fuit Orgetorix.</p></div>
        </div>
      </article>
      <footer class="reader-passage-footer">
        <nav class="reader-continuation-actions">
          <a href="/work/caesar/de-bello-gallico/1" class="reader-continuation-card prev-card">Previous</a>
          <a href="/work/caesar/de-bello-gallico/3" class="reader-continuation-card next-card">Next</a>
        </nav>
      </footer>
    </div>
  `;

  const page2Response = pageResponse(page2CardHtml, {
    pageId: "2",
    prevUrl: "/work/caesar/de-bello-gallico/1",
    nextUrl: "/work/caesar/de-bello-gallico/3",
  });

  test("swapPage replaces the page slots in one request without touching dictionary iframe", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const iframeBefore = el.querySelector<HTMLIFrameElement>("#dict-frame")!;

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2Response,
    });

    const success = await el.swapPage("/work/caesar/de-bello-gallico/2");
    expect(success).toBe(true);

    expect(window.fetch).toHaveBeenCalledWith(
      "http://localhost/work/caesar/de-bello-gallico/2",
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
      "/work/caesar/de-bello-gallico/1"
    );
    expect(pagerPrev.classList.contains("disabled")).toBe(false);
    expect(pagerNext.getAttribute("href")).toBe(
      "/work/caesar/de-bello-gallico/3"
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
      text: async () => page2Response,
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
      text: async () => page2Response,
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
    const tocBtn = el.querySelector<HTMLButtonElement>("#reader-toc-btn")!;
    const tocDrawer = el.querySelector<HTMLElement>("#reader-toc-drawer")!;

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2Response,
    });

    tocBtn.click();
    expect(tocDrawer.hasAttribute("hidden")).toBe(false);

    const tocItem2 = el.querySelector<HTMLAnchorElement>(
      '.reader-toc-item[data-page-id="2"]'
    )!;
    tocItem2.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(tocDrawer.hasAttribute("hidden")).toBe(true);
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
      text: async () => page2Response,
    });

    await el.swapPage("/work/caesar/de-bello-gallico/2");
    // Drawer should be minimized on page turn
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(true);
  });

  describe("swipe and keyboard page turns", () => {
    // Gesture policy itself is covered in reader_page_nav.test.ts; these check
    // the view's wiring: the controller is registered, `canTurn` reads the
    // pager links, and turns share `turnPage` with the keyboard shortcuts.
    function touch(el: Element, type: string, x?: number) {
      const e = new Event(type, { bubbles: true });
      Object.defineProperty(e, "touches", {
        value: x === undefined ? [] : [{ clientX: x, clientY: 300 }],
      });
      el.dispatchEvent(e);
    }

    /** A committed swipe on the passage (jsdom commits past 153.6px). */
    function swipe(el: MorcusReaderView, dx: number) {
      const panel = el.querySelector(".reader-text-panel")!;
      touch(panel, "touchstart", 600);
      touch(panel, "touchmove", 600 + dx / 2);
      touch(panel, "touchmove", 600 + dx);
      touch(panel, "touchend");
    }

    function mockPage2Fetch() {
      window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => page2Response,
      });
    }

    const flush = () => new Promise((r) => setTimeout(r, 20));

    test("swiping left turns to the next page in place", async () => {
      const el = createNavigableReaderView({ pageId: "1" });
      mockPage2Fetch();

      swipe(el, -200);
      await flush();

      expect(window.fetch).toHaveBeenCalledWith(
        "http://localhost/work/caesar/de-bello-gallico/2",
        expect.anything()
      );
      expect(el.dataset.page).toBe("2");
      expect(window.location.pathname).toBe("/work/caesar/de-bello-gallico/2");
    });

    test("swiping toward a missing page does not fetch", async () => {
      const el = createNavigableReaderView({ pageId: "1" });
      mockPage2Fetch();

      swipe(el, 200);
      await flush();

      expect(window.fetch).not.toHaveBeenCalled();
      expect(el.dataset.page).toBe("1");
    });

    test("a swipe closes the TOC, clears the active word, and does not carry ?q= across page turns", async () => {
      const el = createNavigableReaderView({ pageId: "1" });
      mockPage2Fetch();
      el.querySelector<HTMLElement>(".lat-word")!.click();
      expect(el.querySelectorAll(".word-active")).toHaveLength(1);
      el.querySelector<HTMLElement>("#reader-toc-btn")!.click();
      const tocDrawer = el.querySelector<HTMLElement>("#reader-toc-drawer")!;
      expect(tocDrawer.hasAttribute("hidden")).toBe(false);

      swipe(el, -200);
      await flush();

      expect(tocDrawer.hasAttribute("hidden")).toBe(true);
      expect(window.fetch).toHaveBeenCalledWith(
        "http://localhost/work/caesar/de-bello-gallico/2",
        expect.anything()
      );
      expect(window.location.search).toBe("");
      expect(el.querySelectorAll(".word-active")).toHaveLength(0);
    });

    test("] and [ turn pages through the same path, only where a page exists", async () => {
      const el = createNavigableReaderView({ pageId: "1" });
      mockPage2Fetch();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "[" }));
      await flush();
      expect(window.fetch).not.toHaveBeenCalled();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "]" }));
      await flush();
      expect(window.fetch).toHaveBeenCalledTimes(1);
      expect(el.dataset.page).toBe("2");
    });
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
        text: async () => page2Response,
      });
    });
    window.fetch = fetchMock;

    // 1. When Translation tab is active, page swap fetches translation in parallel
    panelController?.setTab("translation");
    expect(panelController?.activeTab).toBe("translation");

    await el.swapPage("/work/sallust/catalina1/2");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/work/sallust/catalina1/2"),
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/work/sallust/catalina1/2/translation",
      expect.anything()
    );

    const transView = el.querySelector("#panel-view-translation");
    expect(transView?.textContent).toContain("Trans Page 2");

    // 2. When switching away from Translation tab, swapPage resets translation state
    panelController?.setTab("dict");
    expect(panelController?.activeTab).toBe("dict");

    fetchMock.mockClear();
    await el.swapPage("/work/sallust/catalina1/1");

    // Only page partial is fetched, not translation
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/work/sallust/catalina1/1"),
      expect.anything()
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/work/sallust/catalina1/1/translation",
      expect.anything()
    );
  });

  test("page turn keeps drawer open on Translation tab and minimizes it on Dictionary tab", async () => {
    const el = createNavigableReaderView({
      pageId: "1",
      author: "sallust",
      name: "catalina1",
      hasTranslation: true,
    });
    const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
    window.fetch = jest.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/translation")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            '<div class="reader-translation-content">Trans Page</div>',
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => page2Response,
      });
    });

    // 1. On Translation tab: drawer stays open across page turn
    el.activatePanelTab("translation");
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);

    await el.swapPage("/work/sallust/catalina1/2");
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);

    // 2. On Dictionary tab: drawer minimizes and active word clears on page turn
    el.querySelector<HTMLElement>(".lat-word")!.click();
    expect(el.getPanelController()?.activeTab).toBe("dict");
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(false);
    expect(el.querySelectorAll(".word-active")).toHaveLength(1);

    await el.swapPage("/work/sallust/catalina1/1");
    expect(dictPanel.classList.contains("drawer-minimized")).toBe(true);
    expect(el.querySelectorAll(".word-active")).toHaveLength(0);
  });

  test("swapPage fetches the page and translation build-versioned, but keeps the address bar clean", async () => {
    document.documentElement.dataset.version = "v1";
    try {
      const el = createNavigableReaderView({
        pageId: "1",
        author: "sallust",
        name: "catalina1",
        hasTranslation: true,
      });
      const fetchMock = jest.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          text: async () =>
            url.includes("/translation")
              ? '<div class="reader-translation-content">Trans Page 2</div>'
              : page2Response,
        })
      );
      window.fetch = fetchMock;
      el.getPanelController()?.setTab("translation");

      await el.swapPage("/work/sallust/catalina1/2");

      expect(fetchMock).toHaveBeenCalledWith(
        "/work/sallust/catalina1/2?v=v1",
        expect.anything()
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/work/sallust/catalina1/2/translation?v=v1",
        expect.anything()
      );
      expect(window.location.pathname).toBe("/work/sallust/catalina1/2");
      expect(window.location.search).not.toContain("v=");
    } finally {
      delete document.documentElement.dataset.version;
    }
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
    let unprevented = false;
    const onWindowClick = (e: MouseEvent) => {
      unprevented = !e.defaultPrevented;
      e.preventDefault();
    };
    window.addEventListener("click", onWindowClick, { once: true });
    libraryLink.dispatchEvent(evt);

    expect(unprevented).toBe(true);
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
    let unprevented = false;
    const onWindowClick = (e: MouseEvent) => {
      unprevented = !e.defaultPrevented;
      e.preventDefault();
    };
    window.addEventListener("click", onWindowClick, { once: true });
    pagerNext.dispatchEvent(evt);

    expect(unprevented).toBe(true);
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test("swapping to page with notes adopts notes dynamically and updates companion tabs", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const panelController = el.getPanelController()!;
    expect(panelController.hasNotes).toBe(false);

    const pageWithNotesHtml = `
      <div class="reader-text-card" data-slot="text">
        <header class="reader-text-card-header">
          <h1 class="reader-passage-heading">Liber I: Caput 2</h1>
        </header>
        <article class="reader-passage" id="reader-passage">
          <p>Text with note <a href="#note-n1" class="reader-note-ref" id="noteref-n1">[1]</a></p>
        </article>
        <footer class="reader-passage-footer">
          <nav class="reader-continuation-actions">
            <a href="/work/caesar/de-bello-gallico/1" class="reader-continuation-card prev-card">Previous</a>
          </nav>
        </footer>
      </div>
    `;
    const notesHtml = `
      <aside class="reader-notes">
        <ol class="reader-notes-list">
          <li class="reader-note" id="note-n1">Critical note content</li>
        </ol>
      </aside>`;

    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        pageResponse(pageWithNotesHtml, {
          pageId: "2",
          prevUrl: "/work/caesar/de-bello-gallico/1",
          notesHtml,
        }),
    });
    const notesView = el.querySelector("#panel-view-notes");

    await el.swapPage("/work/caesar/de-bello-gallico/2");

    expect(panelController.hasNotes).toBe(true);
    expect(panelController.noteCount).toBe(1);
    expect(panelController.notesTab?.hidden).toBe(false);
    // The notes land in the persistent view, not the text card.
    expect(el.querySelector("#note-n1")?.closest("#panel-view-notes")).toBe(
      notesView
    );
  });

  test("popstate navigation triggers page swap without pushing history and restores scroll position", async () => {
    const el = createNavigableReaderView({ pageId: "1" });

    // Swap to page 2
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2Response,
    });
    await el.swapPage("/work/caesar/de-bello-gallico/2");
    expect(el.dataset.page).toBe("2");

    // Mock page 1 HTML for popstate return
    const page1CardHtml = `
      <div class="reader-text-card" data-slot="text">
        <header class="reader-text-card-header">
          <h1 class="reader-passage-heading">Liber I: Caput 1</h1>
        </header>
        <article class="reader-passage" id="reader-passage">
          <div class="reader-section" id="sec-1.1"><div class="reader-passage"><p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p></div></div>
        </article>
      </div>
    `;
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        pageResponse(page1CardHtml, {
          pageId: "1",
          nextUrl: "/work/caesar/de-bello-gallico/2",
        }),
    });

    // Simulate browser back button to page 1 with saved scrollY: 180
    window.history.replaceState(
      { scrollY: 180 },
      "",
      "/work/caesar/de-bello-gallico/1"
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { scrollY: 180 } })
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(window.fetch).toHaveBeenCalledWith(
      "http://localhost/work/caesar/de-bello-gallico/1",
      expect.any(Object)
    );
    expect(el.dataset.page).toBe("1");
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 180,
      left: 0,
      behavior: "instant",
    });
  });

  test("swapPage to bare work URL (/work/:author/:work) resolves newPageId from first TOC item and updates dataset.page, TOC active state, and Translation tab", async () => {
    const el = createNavigableReaderView({
      pageId: "1.1",
      author: "ovid",
      name: "amores",
      hasTranslation: true,
    });

    // Replace TOC content with epigram + multi-book groups to test RDR-03 and RDR-04 together
    const tocDrawer = el.querySelector<HTMLElement>("#reader-toc-drawer")!;
    tocDrawer.innerHTML = `
      <form class="reader-toc-search-form" action="/work/ovid/amores/1.1" method="GET"></form>
      <button id="reader-toc-close-btn">&times;</button>
      <div class="reader-toc-list" id="reader-toc-list">
        <a href="/work/ovid/amores/ep" class="reader-toc-item" data-page-id="ep">Epigram</a>
        <details class="reader-toc-group" data-group-id="1" open>
          <summary><span class="reader-toc-group-label">Book 1</span></summary>
          <a href="/work/ovid/amores/1.1" class="reader-toc-item active" data-page-id="1.1" aria-current="page">Elegy 1</a>
        </details>
        <details class="reader-toc-group" data-group-id="2">
          <summary><span class="reader-toc-group-label">Book 2</span></summary>
          <a href="/work/ovid/amores/2.1" class="reader-toc-item" data-page-id="2.1">Elegy 1</a>
        </details>
      </div>
    `;

    const epCardHtml = `
      <div class="reader-text-card" data-slot="text">
        <header class="reader-text-card-header">
          <span class="reader-work-tag">Amores</span>
          <h1 class="reader-passage-heading">Epigram</h1>
        </header>
        <article class="reader-passage" id="reader-passage">
          <div class="reader-section" id="sec-ep.1"><div class="reader-passage"><p class="reader-paragraph">Qui modo Nasonis fueramus quinque libelli.</p></div></div>
        </article>
      </div>
    `;
    const epPartial = pageResponse(epCardHtml, {
      pageId: "ep",
      nextUrl: "/work/ovid/amores/1.1",
    });

    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/translation")) {
        return Promise.resolve({
          ok: true,
          text: async () =>
            '<div class="reader-translation-content">We who just now were five little books of Naso</div>',
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => epPartial,
      });
    });
    window.fetch = fetchMock;

    const panelController = el.getPanelController()!;
    panelController.setTab("translation");

    // 1. Cross-book turn from 1.1 to 2.1 closes Book 1 group and opens Book 2 group (RDR-04)
    const book2Partial = pageResponse(epCardHtml, {
      pageId: "2.1",
      prevUrl: "/work/ovid/amores/1.1",
    });
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, text: async () => book2Partial })
    );
    await el.swapPage("/work/ovid/amores/2.1");

    const group1 = tocDrawer.querySelector<HTMLDetailsElement>(
      'details.reader-toc-group[data-group-id="1"]'
    )!;
    const group2 = tocDrawer.querySelector<HTMLDetailsElement>(
      'details.reader-toc-group[data-group-id="2"]'
    )!;
    expect(group1.open).toBe(false);
    expect(group2.open).toBe(true);
    expect(
      tocDrawer.querySelector(".reader-toc-search-form")?.getAttribute("action")
    ).toBe("/work/ovid/amores/2.1");

    // 2. Popstate back to bare work URL /work/ovid/amores resolves newPageId = "ep" (RDR-03)
    fetchMock.mockClear();
    window.history.replaceState({}, "", "/work/ovid/amores");
    await el.swapPage("/work/ovid/amores", {
      push: false,
      isPopState: true,
    });

    expect(el.dataset.page).toBe("ep");
    expect(fetchMock).toHaveBeenCalledWith(
      "/work/ovid/amores/ep/translation",
      expect.anything()
    );
    expect(el.querySelector("#panel-view-translation")?.textContent).toContain(
      "We who just now were five little books of Naso"
    );

    const epItem = tocDrawer.querySelector<HTMLElement>(
      '.reader-toc-item[data-page-id="ep"]'
    )!;
    const item21 = tocDrawer.querySelector<HTMLElement>(
      '.reader-toc-item[data-page-id="2.1"]'
    )!;
    expect(epItem.classList.contains("active")).toBe(true);
    expect(epItem.getAttribute("aria-current")).toBe("page");
    expect(item21.classList.contains("active")).toBe(false);
    expect(group1.open).toBe(false);
    expect(group2.open).toBe(false);
  });

  test("a failed page turn falls back to a full navigation without pushing history", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const navigate = jest.fn();
    el.navigate = navigate;
    const pushStateSpy = jest.spyOn(window.history, "pushState");
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    window.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const success = await el.swapPage("/work/caesar/de-bello-gallico/2");
    expect(success).toBe(false);

    expect(navigate).toHaveBeenCalledWith(
      "http://localhost/work/caesar/de-bello-gallico/2",
      { replace: false }
    );
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(el.dataset.page).toBe("1");
    expect(el.querySelector(".reader-passage-heading")?.textContent).toBe(
      "Liber I: Caput 1"
    );
    expect(el.querySelector("[aria-busy]")).toBeNull();

    pushStateSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  test("a failed popstate turn replaces the history entry instead of adding one", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    const navigate = jest.fn();
    el.navigate = navigate;
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    window.fetch = jest.fn().mockRejectedValue(new TypeError("offline"));

    await el.swapPage("/work/caesar/de-bello-gallico/2", {
      push: false,
      isPopState: true,
    });

    expect(navigate).toHaveBeenCalledWith(
      "http://localhost/work/caesar/de-bello-gallico/2",
      { replace: true }
    );
    consoleSpy.mockRestore();
  });

  test("marks the page slots busy while the next page loads", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    let respond: (value: unknown) => void = () => {};
    window.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      })
    );

    const turn = el.swapPage("/work/caesar/de-bello-gallico/2");
    const busy = Array.from(el.querySelectorAll("[aria-busy='true']")).map(
      (e) => e.getAttribute("data-slot")
    );
    expect(busy.sort()).toEqual(
      ["notes", "page-label", "pager-next", "pager-prev", "text"].sort()
    );

    respond({ ok: true, text: async () => page2Response });
    await turn;
    expect(el.querySelector("[aria-busy]")).toBeNull();
  });

  test("keeps keyboard focus on the pager link across a page turn", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2Response,
    });
    const oldNext = el.querySelector<HTMLAnchorElement>("#pager-next")!;
    oldNext.focus();

    await el.swapPage("/work/caesar/de-bello-gallico/2");

    const newNext = el.querySelector<HTMLAnchorElement>("#pager-next")!;
    expect(newNext).not.toBe(oldNext);
    expect(document.activeElement).toBe(newNext);
  });

  test("moves focus from the old passage to the new text card, not <body>", async () => {
    const el = createNavigableReaderView({ pageId: "1" });
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => page2Response,
    });
    el.querySelector<HTMLAnchorElement>(".next-card")!.focus();

    await el.swapPage("/work/caesar/de-bello-gallico/2");

    const card = el.querySelector<HTMLElement>(".reader-text-card")!;
    expect(card.querySelector(".reader-passage-heading")?.textContent).toBe(
      "Liber I: Caput 2"
    );
    expect(document.activeElement).toBe(card);
  });

  describe("fetchTranslation abort signal and cache behavior", () => {
    it("returns cached translation on cache hit when signal is not aborted", async () => {
      const el = createNavigableReaderView({ pageId: "1" });
      const controller = new AbortController();

      window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => "<p>Cached Translation</p>",
      });

      const res1 = await el.fetchTranslation(
        "/work/caesar/de-bello-gallico/1",
        controller.signal
      );
      expect(res1).toBe("<p>Cached Translation</p>");
      expect(window.fetch).toHaveBeenCalledTimes(1);

      // Second call hits cache without calling fetch
      const res2 = await el.fetchTranslation(
        "/work/caesar/de-bello-gallico/1",
        controller.signal
      );
      expect(res2).toBe("<p>Cached Translation</p>");
      expect(window.fetch).toHaveBeenCalledTimes(1);
    });

    it("returns null on cache hit if signal is already aborted or aborted before microtask resolves", async () => {
      const el = createNavigableReaderView({ pageId: "1" });
      const liveCtrl = new AbortController();

      window.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: async () => "<p>Cached Translation</p>",
      });

      await el.fetchTranslation(
        "/work/caesar/de-bello-gallico/1",
        liveCtrl.signal
      );

      // 1. Pre-aborted signal
      const abortedCtrl = new AbortController();
      abortedCtrl.abort();

      const res1 = await el.fetchTranslation(
        "/work/caesar/de-bello-gallico/1",
        abortedCtrl.signal
      );
      expect(res1).toBeNull();

      // 2. Signal aborted synchronously after fetchTranslation is called (mid-microtask)
      const midCtrl = new AbortController();
      const pending = el.fetchTranslation(
        "/work/caesar/de-bello-gallico/1",
        midCtrl.signal
      );
      midCtrl.abort();

      const res2 = await pending;
      expect(res2).toBeNull();
    });

    it("returns null before network fetch if signal is already aborted", async () => {
      const el = createNavigableReaderView({ pageId: "1" });
      const fetchSpy = jest.fn();
      window.fetch = fetchSpy;

      const abortedCtrl = new AbortController();
      abortedCtrl.abort();

      const res = await el.fetchTranslation(
        "/work/caesar/de-bello-gallico/99",
        abortedCtrl.signal
      );
      expect(res).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("MorcusReaderView dictionary back-to-top button", () => {
    let rafCallbacks: FrameRequestCallback[] = [];

    beforeEach(() => {
      rafCallbacks = [];
      jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function flushRaf() {
      const callbacks = [...rafCallbacks];
      rafCallbacks = [];
      callbacks.forEach((cb) => cb(performance.now()));
    }

    test("adopts SSR-rendered back-to-top button and re-binds across disconnect/reconnect", () => {
      const el = createReaderView("<p>Text</p>");
      const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
      expect(dictPanel).not.toBeNull();

      const btn = dictPanel.querySelector<HTMLButtonElement>(
        ".reader-dict-back-to-top"
      );
      expect(btn).not.toBeNull();
      expect(btn?.hasAttribute("data-js-only")).toBe(true);
      expect(btn?.getAttribute("aria-label")).toBe("Scroll dictionary to top");
      expect(btn?.title).toBe("Jump to top");

      // Disconnect: SSR button remains in DOM, listeners are torn down
      el.remove();
      expect(dictPanel.querySelector(".reader-dict-back-to-top")).toBe(btn);
      Object.defineProperty(dictPanel, "scrollTop", {
        value: 400,
        configurable: true,
        writable: true,
      });
      dictPanel.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(btn?.classList.contains("visible")).toBe(false);

      // Reconnect: same SSR button is re-bound cleanly without duplicates
      document.body.appendChild(el);
      const reconnectedBtns = dictPanel.querySelectorAll(
        ".reader-dict-back-to-top"
      );
      expect(reconnectedBtns.length).toBe(1);
      // Reconnecting resets the panel's scroll, so the button starts hidden.
      flushRaf();
      expect(btn?.classList.contains("visible")).toBe(false);
      // The re-bound listener reacts to scrolling again.
      dictPanel.scrollTop = 400;
      dictPanel.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(btn?.classList.contains("visible")).toBe(true);
    });

    test("toggles visibility on scroll past 300px threshold via managed rAF", () => {
      const el = createReaderView("<p>Text</p>");
      const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
      const btn = dictPanel.querySelector<HTMLButtonElement>(
        ".reader-dict-back-to-top"
      )!;

      expect(btn.classList.contains("visible")).toBe(false);

      // Scroll below 300px
      Object.defineProperty(dictPanel, "scrollTop", {
        value: 150,
        configurable: true,
        writable: true,
      });
      dictPanel.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(btn.classList.contains("visible")).toBe(false);

      // Scroll past 300px
      Object.defineProperty(dictPanel, "scrollTop", {
        value: 350,
        configurable: true,
        writable: true,
      });
      dictPanel.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(btn.classList.contains("visible")).toBe(true);

      // Scroll back up
      Object.defineProperty(dictPanel, "scrollTop", {
        value: 50,
        configurable: true,
        writable: true,
      });
      dictPanel.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(btn.classList.contains("visible")).toBe(false);
    });

    test("scrolls to top instantly on click and hides button", () => {
      const el = createReaderView("<p>Text</p>");
      const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
      const btn = dictPanel.querySelector<HTMLButtonElement>(
        ".reader-dict-back-to-top"
      )!;

      const scrollToMock = jest.fn();
      dictPanel.scrollTo = scrollToMock;

      // Make visible first
      Object.defineProperty(dictPanel, "scrollTop", {
        value: 500,
        configurable: true,
        writable: true,
      });
      dictPanel.dispatchEvent(new Event("scroll"));
      flushRaf();
      expect(btn.classList.contains("visible")).toBe(true);

      btn.click();
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 0,
        behavior: "instant",
      });
      expect(btn.classList.contains("visible")).toBe(false);
    });
  });

  describe("Mobile drawer dismissal, FAB restoration, and drag recovery", () => {
    test("clicking .reader-sheet-close dismisses drawer and clicking .reader-drawer-fab restores it", () => {
      const el = createReaderView(`<p>Omnis</p>`);
      const splitLayout = el.querySelector<HTMLElement>(
        ".reader-split-layout"
      )!;
      const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
      const closeBtn = el.querySelector<HTMLAnchorElement>(
        ".reader-sheet-close"
      )!;
      const fab = el.querySelector<HTMLAnchorElement>(".reader-drawer-fab")!;
      const word = el.querySelector<HTMLElement>(".lat-word")!;

      // 1. Open drawer via word lookup
      word.click();
      expect(splitLayout.classList.contains("reader-layout-active")).toBe(true);
      expect(splitLayout.classList.contains("drawer-dismissed")).toBe(false);
      expect(word.classList.contains("word-active")).toBe(true);

      // 2. Click '✕' close button -> dismisses drawer & clears word
      closeBtn.click();
      expect(splitLayout.classList.contains("drawer-dismissed")).toBe(true);
      expect(splitLayout.classList.contains("reader-layout-empty")).toBe(true);
      expect(word.classList.contains("word-active")).toBe(false);

      // 3. Click floating restore FAB -> undismisses and restores drawer
      fab.click();
      expect(splitLayout.classList.contains("drawer-dismissed")).toBe(false);
      expect(splitLayout.classList.contains("reader-layout-active")).toBe(true);
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe(
        `${DRAWER_DEFAULT_SVH}svh`
      );
    });

    test("tapping a word in the passage while drawer is dismissed automatically undismisses and opens it", () => {
      const el = createReaderView(`<p>Omnis</p>`);
      const splitLayout = el.querySelector<HTMLElement>(
        ".reader-split-layout"
      )!;
      const closeBtn = el.querySelector<HTMLAnchorElement>(
        ".reader-sheet-close"
      )!;
      const word = el.querySelector<HTMLElement>(".lat-word")!;

      closeBtn.click();
      expect(splitLayout.classList.contains("drawer-dismissed")).toBe(true);

      word.click();
      expect(splitLayout.classList.contains("drawer-dismissed")).toBe(false);
      expect(splitLayout.classList.contains("reader-layout-active")).toBe(true);
    });

    test("dragging .reader-sheet-bar after closing reactivates .reader-layout-active and resizes drawer", () => {
      const el = createReaderView(`<p>Omnis</p>`);
      const splitLayout = el.querySelector<HTMLElement>(
        ".reader-split-layout"
      )!;
      const dictPanel = el.querySelector<HTMLElement>(".reader-dict-panel")!;
      const sheetBar = el.querySelector<HTMLElement>(".reader-sheet-bar")!;
      const closeBtn = el.querySelector<HTMLAnchorElement>(
        ".reader-sheet-close"
      )!;

      closeBtn.click();
      expect(splitLayout.classList.contains("reader-layout-empty")).toBe(true);
      expect(splitLayout.classList.contains("drawer-dismissed")).toBe(true);

      sheetBar.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          bubbles: true,
          clientX: 100,
          clientY: 400,
          pointerId: 1,
        })
      );

      expect(splitLayout.classList.contains("drawer-dismissed")).toBe(false);
      expect(splitLayout.classList.contains("reader-layout-active")).toBe(true);

      sheetBar.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 150,
          pointerId: 1,
        })
      );
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe("290px");

      sheetBar.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          clientY: 150,
          pointerId: 1,
        })
      );
      expect(dictPanel.style.getPropertyValue("--drawer-height")).toBe("38svh");
    });
  });
});

describe("MorcusReaderView screen wake lock", () => {
  let requests: Array<{ released: boolean; release: jest.Mock }>;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = "";
    requests = [];
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: jest.fn(() => {
          const sentinel = Object.assign(new EventTarget(), {
            released: false,
            type: "screen",
            release: jest.fn(() => {
              sentinel.released = true;
              sentinel.dispatchEvent(new Event("release"));
              return Promise.resolve();
            }),
          });
          requests.push(sentinel);
          return Promise.resolve(sentinel);
        }),
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete (navigator as unknown as Record<string, unknown>).wakeLock;
    jest.useRealTimers();
  });

  async function flush() {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }

  test("holds a lock while mounted and releases it when the reader is removed", async () => {
    const el = createReaderView("<p>Gallia est omnis divisa.</p>");
    await flush();
    expect(requests).toHaveLength(1);
    expect(requests[0].released).toBe(false);

    el.remove();
    expect(requests[0].released).toBe(true);
  });

  test("dictionary iframe navigation counts as activity", async () => {
    const el = createReaderView("<p>Gallia est omnis divisa.</p>");
    await flush();
    jest.advanceTimersByTime(WAKE_LOCK_IDLE_MS);
    expect(requests[0].released).toBe(true);

    el.querySelector("#dict-frame")!.dispatchEvent(new Event("load"));
    await flush();
    expect(requests).toHaveLength(2);
    expect(requests[1].released).toBe(false);
  });
});

describe("MorcusReaderView passage range highlighting (matchText)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/work/caesar/de_bello_gallico/1.1");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  test("applies .reader-match class to matching word index ranges across single and multiple sections", () => {
    window.history.replaceState(
      {},
      "",
      "/work/caesar/de_bello_gallico/1.1?matchText=1.1.1~1~3__1.1.1~4~5__1.1.2~0~2"
    );

    const passageHtml = `
      <div class="reader-section" id="sec-1.1.1">
        <div class="reader-passage">
          <p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p>
        </div>
      </div>
      <div class="reader-section" id="sec-1.1.2">
        <div class="reader-passage">
          <p class="reader-paragraph">Hi omnes lingua institutis legibus inter se differunt.</p>
        </div>
      </div>
    `;

    const el = createReaderView(passageHtml);
    const matched = Array.from(
      el.querySelectorAll<HTMLElement>(".lat-word.reader-match")
    ).map((w) => w.textContent);

    // 1.1.1: 0=Gallia, 1=est, 2=omnis, 3=divisa, 4=in, 5=partes, 6=tres -> [1,3) + [4,5) = est, omnis, in
    // 1.1.2: 0=Hi, 1=omnes -> [0,2) = Hi, omnes
    expect(matched).toEqual(["est", "omnis", "in", "Hi", "omnes"]);
  });

  test("marks no words when matchText is absent", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.1.1">
        <div class="reader-passage">
          <p class="reader-paragraph">Gallia est omnis divisa.</p>
        </div>
      </div>
    `;

    const el = createReaderView(passageHtml);
    expect(el.querySelectorAll(".lat-word").length).toBe(4);
    expect(el.querySelector(".reader-match")).toBeNull();
  });

  test("preserves .reader-match and matchText query param when looking up a word or toggling macra", () => {
    window.history.replaceState(
      {},
      "",
      "/work/vergil/aeneid/1?matchText=1.8~0~2"
    );

    const passageHtml = `
      <div class="reader-section" id="sec-1.8">
        <div class="reader-passage">
          <span class="reader-line">M\u016Bsa, mihi caus\u0101s memor\u0101.</span>
        </div>
      </div>
    `;

    const el = createReaderView(passageHtml, {
      workId: "vergil/aeneid",
      hasMacra: true,
    });

    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    expect(words[0].classList.contains("reader-match")).toBe(true);
    expect(words[1].classList.contains("reader-match")).toBe(true);
    expect(words[2].classList.contains("reader-match")).toBe(false);

    // Clicking a highlighted word adds .word-active and preserves .reader-match and matchText in URL without pushing ?q=
    words[0].click();
    expect(words[0].classList.contains("word-active")).toBe(true);
    expect(words[0].classList.contains("reader-match")).toBe(true);
    const params = new URLSearchParams(window.location.search);
    expect(params.get("matchText")).toBe("1.8~0~2");
    expect(params.get("q")).toBeNull();

    // Toggling macra off preserves .reader-match
    el.dispatchEvent(
      new CustomEvent("reader-settings-change", {
        detail: { prefs: { ...DEFAULT_READER_PREFS, showMacra: false } },
      })
    );
    expect(words[0].textContent).toBe("Musa");
    expect(words[0].classList.contains("reader-match")).toBe(true);
  });

  test("scrolls the first .reader-match word into view on connect when no hash is present", () => {
    window.history.replaceState(
      {},
      "",
      "/work/caesar/de_bello_gallico/1.1?matchText=1.1.1~2~4"
    );

    const scrollSpy = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollSpy;

    const passageHtml = `
      <div class="reader-section" id="sec-1.1.1">
        <div class="reader-passage">
          <p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p>
        </div>
      </div>
    `;

    createReaderView(passageHtml);
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "instant",
      block: "center",
      inline: "nearest",
    });
  });

  test("centres on the match when the hash targets the match's own section, but not for an unrelated hash", () => {
    const passageHtml = `
      <div class="reader-section" id="sec-1.1.1">
        <div class="reader-passage">
          <p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p>
        </div>
      </div>
      <div class="reader-section" id="sec-1.1.2">
        <div class="reader-passage">
          <p class="reader-paragraph">Hi omnes lingua institutis legibus.</p>
        </div>
      </div>
    `;
    const scrollSpy = jest.fn(function (this: HTMLElement) {
      return this;
    });
    HTMLElement.prototype.scrollIntoView = scrollSpy;

    window.history.replaceState(
      {},
      "",
      "/work/caesar/de_bello_gallico/1.1?matchText=1.1.2~1~2#sec-1.1.2"
    );
    createReaderView(passageHtml);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.contexts[0]).toHaveProperty("textContent", "omnes");

    document.body.innerHTML = "";
    scrollSpy.mockClear();
    window.history.replaceState(
      {},
      "",
      "/work/caesar/de_bello_gallico/1.1?matchText=1.1.2~1~2#sec-1.1.1"
    );
    createReaderView(passageHtml);
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  test("does not scroll to the match if the reader scrolled before upgrade", () => {
    window.history.replaceState(
      {},
      "",
      "/work/caesar/de_bello_gallico/1.1?matchText=1.1.1~2~4"
    );
    const scrollSpy = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollSpy;
    Object.defineProperty(window, "scrollY", {
      value: 500,
      writable: true,
      configurable: true,
    });

    try {
      createReaderView(`
        <div class="reader-section" id="sec-1.1.1">
          <div class="reader-passage">
            <p class="reader-paragraph">Gallia est omnis divisa in partes tres.</p>
          </div>
        </div>
      `);
      expect(scrollSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "scrollY", {
        value: 0,
        writable: true,
        configurable: true,
      });
    }
  });
});

describe("MorcusReaderView dictionary iframe theme synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  test("leaves iframe data-theme unset when neither parent data-theme nor saved darkMode exists", () => {
    // Even if unrelated GlobalSettings exist, darkMode is undefined
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({ highlightStrength: 50 })
    );

    const el = createReaderView("<p>Gallia est omnis divisa.</p>");
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    iframe.contentDocument!.write(
      '<html data-theme="light"><head></head><body></body></html>'
    );
    iframe.contentDocument!.close();

    iframe.dispatchEvent(new Event("load"));

    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBeNull();
  });

  test("syncs explicit saved darkMode or parent data-theme to the dictionary iframe on load", () => {
    localStorage.setItem("GlobalSettings", JSON.stringify({ darkMode: true }));

    const el = createReaderView("<p>Gallia est omnis divisa.</p>");
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    iframe.dispatchEvent(new Event("load"));
    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBe("dark");

    localStorage.setItem("GlobalSettings", JSON.stringify({ darkMode: false }));
    iframe.dispatchEvent(new Event("load"));
    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBe("light");
  });

  test("prefers settingsStore.darkMode and heals stale parent data-theme on iframe load (CORE-04)", () => {
    localStorage.setItem("GlobalSettings", JSON.stringify({ darkMode: true }));
    document.documentElement.setAttribute("data-theme", "light");

    const el = createReaderView("<p>Gallia est omnis divisa.</p>");
    const iframe = el.querySelector<HTMLIFrameElement>("#dict-frame")!;
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();

    // Simulate rapid double-toggle where settingsStore has darkMode: false
    // while documentElement temporarily had "dark", then iframe finishes loading
    localStorage.setItem("GlobalSettings", JSON.stringify({ darkMode: false }));
    document.documentElement.setAttribute("data-theme", "dark");

    iframe.dispatchEvent(new Event("load"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(
      iframe.contentDocument!.documentElement.getAttribute("data-theme")
    ).toBe("light");
  });
});
