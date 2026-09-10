/**
 * @jest-environment jsdom
 */
import "@/web/v2/dict/dict_search.client";
import { MorcusDictSearch } from "@/web/v2/dict/dict_search.client";

describe("MorcusDictSearch client progressive enhancement", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve('<div class="new-results">New Results</div>'),
        json: () => Promise.resolve([]),
      } as unknown as Response)
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  function createDictSearch(resultsHtml: string = ""): MorcusDictSearch {
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="v2-search-form" action="/v2/dicts" method="GET">
        <div class="v2-input-wrapper">
          <input type="text" name="q" class="v2-input" value="habeo" />
        </div>
      </form>
      <output id="dict-results" class="v2-results">
        ${resultsHtml}
      </output>
    `;
    document.body.appendChild(el);
    return el;
  }

  test("progressively enhances Latin words in entry content while respecting denylist", () => {
    const resultsHtml = `
      <article class="v2-entry">
        <div class="v2-entry-content">
          <p>
            <b class="lsOrth">habeo</b>,
            <span class="lsHover" title="verb">v.</span>,
            <span class="lsQuote">Gallia est omnis</span>,
            <b class="lsEmph">important note</b>,
            <span lang="el">&#x1F35;&#x3C0;&#x3C0;&#x3BF;&#x3C2;</span>,
            <span class="dLink" to="facio">facio</span>,
            <a href="#sense-1" class="v2-section-anchor">1</a>
          </p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);

    // Enhanced words inside .lsQuote are wrapped in .v2-lat-word
    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    expect(wordTexts).toContain("Gallia");
    expect(wordTexts).toContain("est");
    expect(wordTexts).toContain("omnis");

    // Denylist check: lsOrth (headwords) is NOT wrapped
    const orthEl = el.querySelector(".lsOrth")!;
    expect(orthEl.querySelector(".v2-lat-word")).toBeNull();
    expect(orthEl.textContent).toBe("habeo");

    // Denylist check: lsHover (abbreviations with popovers) is NOT wrapped
    const hoverEl = el.querySelector(".lsHover")!;
    expect(hoverEl.querySelector(".v2-lat-word")).toBeNull();

    // Denylist check: lsEmph (emphasized bold) is NOT wrapped
    const emphEl = el.querySelector(".lsEmph")!;
    expect(emphEl.querySelector(".v2-lat-word")).toBeNull();

    // Denylist check: Greek text is NOT wrapped
    const greekEl = el.querySelector('[lang="el"]')!;
    expect(greekEl.querySelector(".v2-lat-word")).toBeNull();

    // Denylist check: existing anchors are NOT wrapped
    const anchorEl = el.querySelector(".v2-section-anchor")!;
    expect(anchorEl.querySelector(".v2-lat-word")).toBeNull();

    // Denylist check: dLink is preserved
    const dLinkEl = el.querySelector(".dLink")!;
    expect(dLinkEl.querySelector(".v2-lat-word")).toBeNull();
  });

  test("handles words with macra and cleans data-word attribute", () => {
    const resultsHtml = `
      <article class="v2-entry">
        <div class="v2-entry-content">
          <p>causa\u0304s me\u0304mora\u0304</p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);
    const words = Array.from(el.querySelectorAll<HTMLElement>(".v2-lat-word"));

    expect(words.length).toBe(2);
    // Display text preserves macra
    expect(words[0].textContent).toBe("causa\u0304s");
    expect(words[1].textContent).toBe("me\u0304mora\u0304");

    // data-word has diacritics stripped for lookup
    expect(words[0].dataset.word).toBe("causas");
    expect(words[1].dataset.word).toBe("memora");
  });

  test("clicking an enhanced word triggers search for that word", () => {
    const resultsHtml = `
      <article class="v2-entry">
        <div class="v2-entry-content">
          <p><span class="lsQuote">Gallia est</span></p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);

    const galliaSpan = el.querySelector<HTMLElement>(
      '.v2-lat-word[data-word="Gallia"]'
    )!;
    expect(galliaSpan).not.toBeNull();

    galliaSpan.click();

    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;
    expect(input.value).toBe("Gallia");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=Gallia"),
      expect.anything()
    );
  });

  test("clicking a dLink triggers search for the target word", () => {
    const resultsHtml = `
      <article class="v2-entry">
        <div class="v2-entry-content">
          <p><span class="dLink" to="facio">facio</span></p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);

    const dLink = el.querySelector<HTMLElement>(".dLink")!;
    dLink.click();

    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;
    expect(input.value).toBe("facio");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=facio"),
      expect.anything()
    );
  });

  test("generates anchor element with href preserving query params for middle-click / open in new tab", () => {
    // Simulate active dict and embedded params in window.location.search
    window.history.replaceState(
      {},
      "",
      "/v2/dicts?q=habeo&dict=L%26S&embedded=1"
    );

    const resultsHtml = `
      <article class="v2-entry">
        <div class="v2-entry-content">
          <p><span class="lsQuote">Gallia est</span></p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);
    const galliaLink = el.querySelector<HTMLAnchorElement>(
      '.v2-lat-word[data-word="Gallia"]'
    )!;

    expect(galliaLink).not.toBeNull();
    expect(galliaLink.tagName.toLowerCase()).toBe("a");
    // L&S bit is 1, o default is 1
    expect(galliaLink.getAttribute("href")).toBe(
      "/v2/dicts?q=Gallia&d=1&o=1&embedded=1"
    );

    // Clean up history state
    window.history.replaceState({}, "", "/v2/dicts");
  });

  test("allows native new-tab opening on middle click or modifier clicks (Ctrl, Cmd, Shift, Alt)", () => {
    const resultsHtml = `
      <article class="v2-entry">
        <div class="v2-entry-content">
          <p>
            <span class="lsQuote">Gallia est</span>
            <a class="dLink" to="facio" href="/v2/dicts?q=facio">facio</a>
          </p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);
    const galliaLink = el.querySelector<HTMLAnchorElement>(
      '.v2-lat-word[data-word="Gallia"]'
    )!;
    const dLink = el.querySelector<HTMLAnchorElement>(".dLink")!;

    // Normal left-click should be prevented for AJAX swap
    const normalClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    galliaLink.dispatchEvent(normalClick);
    expect(normalClick.defaultPrevented).toBe(true);

    // Middle click (button 1) should NOT be prevented
    const middleClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    galliaLink.dispatchEvent(middleClick);
    expect(middleClick.defaultPrevented).toBe(false);

    // Ctrl+click should NOT be prevented
    const ctrlClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    galliaLink.dispatchEvent(ctrlClick);
    expect(ctrlClick.defaultPrevented).toBe(false);

    // Cmd/Meta+click should NOT be prevented
    const metaClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    galliaLink.dispatchEvent(metaClick);
    expect(metaClick.defaultPrevented).toBe(false);

    // Modifier click on dLink should also NOT be prevented
    const dLinkCtrlClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    dLink.dispatchEvent(dLinkCtrlClick);
    expect(dLinkCtrlClick.defaultPrevented).toBe(false);
  });

  test("sanitizes query by trimming quotes, punctuation, and whitespace on form submission", () => {
    const el = createDictSearch();
    const form = el.querySelector<HTMLFormElement>("form.v2-search-form")!;
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

    input.value = '  "habeo,"  ';
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    // Fetch should be called with sanitized query
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=habeo"),
      expect.anything()
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("q=%22habeo"),
      expect.anything()
    );
  });

  test("forwards active dict and lang parameters when fetching autocomplete suggestions", () => {
    delete (window as any).location;
    (window as any).location = new URL(
      "http://localhost/v2/dicts?dict=ls,gaffiot&lang=La"
    );

    jest.useFakeTimers();
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

    input.value = "amo";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    jest.advanceTimersByTime(200);

    // L&S (1) + GAF (2) = 3 -> d=3
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/api/completions?q=amo&d=3&lang=La"),
      expect.anything()
    );
    jest.useRealTimers();
  });

  test("updates landing welcome message and badges on dict-selection-change when query is empty", () => {
    const landingHtml = `
      <div id="v2-landing-welcome">Initial Welcome</div>
      <div class="v2-dict-list-item v2-dict-enabled" data-dict-key="GRG">
        <span class="v2-lexicon-badge v2-dict-enabled">GRG</span>
      </div>
      <div class="v2-dict-list-item v2-dict-disabled" data-dict-key="EGL">
        <span class="v2-lexicon-badge v2-dict-disabled">EGL</span>
      </div>
    `;

    const el = createDictSearch(landingHtml);
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;
    input.value = ""; // Empty search query (landing state)

    // Fire dict-selection-change with only L&S and S&H (disabling Georges)
    el.dispatchEvent(
      new CustomEvent("dict-selection-change", {
        detail: { dictKeys: ["L&S", "S&H"] },
        bubbles: true,
      })
    );

    const welcomeEl = el.querySelector<HTMLElement>("#v2-landing-welcome")!;
    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English."
    );

    const grgItem = el.querySelector<HTMLElement>(
      '.v2-dict-list-item[data-dict-key="GRG"]'
    )!;
    expect(grgItem.classList.contains("v2-dict-disabled")).toBe(true);
    expect(grgItem.classList.contains("v2-dict-enabled")).toBe(false);

    // Re-enable Georges
    el.dispatchEvent(
      new CustomEvent("dict-selection-change", {
        detail: { dictKeys: ["L&S", "S&H", "GRG"] },
        bubbles: true,
      })
    );
    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
    );
    expect(grgItem.classList.contains("v2-dict-enabled")).toBe(true);
  });

  test("synchronizes d and o query parameters on dict-selection-change and dict-inflected-change", () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts?q=habeo");
    const replaceStateSpy = jest.spyOn(window.history, "replaceState");

    const el = createDictSearch();

    // Toggle dict selection
    el.dispatchEvent(
      new CustomEvent("dict-selection-change", {
        detail: { dictKeys: ["L&S", "GAF"], bitmask: "3" },
        bubbles: true,
      })
    );

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("d=3")
    );

    // Toggle inflection
    el.dispatchEvent(
      new CustomEvent("dict-inflected-change", {
        detail: { isInflected: false },
        bubbles: true,
      })
    );

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("o=0")
    );

    replaceStateSpy.mockRestore();
  });

  test("search execution explicitly syncs q, d, and o parameters in history and document title", async () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts");
    const pushStateSpy = jest.spyOn(window.history, "pushState");

    const el = createDictSearch();
    const form = el.querySelector<HTMLFormElement>("form.v2-search-form")!;
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

    input.value = "equus";
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    expect(pushStateSpy).toHaveBeenCalledWith(
      { q: "equus" },
      "",
      expect.stringContaining("q=equus")
    );
    expect(pushStateSpy).toHaveBeenCalledWith(
      { q: "equus" },
      "",
      expect.stringContaining("d=an")
    );
    expect(pushStateSpy).toHaveBeenCalledWith(
      { q: "equus" },
      "",
      expect.stringContaining("o=1")
    );
    expect(document.title).toBe("equus - Morcus Dictionary");

    pushStateSpy.mockRestore();
  });

  test("landing welcome message reacts live to dict-inflected-change", () => {
    const landingHtml = `
      <div id="v2-landing-welcome">Initial Welcome</div>
    `;

    const el = createDictSearch(landingHtml);
    const welcomeEl = el.querySelector<HTMLElement>("#v2-landing-welcome")!;

    // Initial state with default dicts: Latin headwords and inflected forms
    el.dispatchEvent(
      new CustomEvent("dict-inflected-change", {
        detail: { isInflected: false },
        bubbles: true,
      })
    );

    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords, and words in English and German."
    );
    expect(welcomeEl.textContent).not.toContain("inflected forms");

    // Toggle back to inflected on
    el.dispatchEvent(
      new CustomEvent("dict-inflected-change", {
        detail: { isInflected: true },
        bubbles: true,
      })
    );

    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
    );
  });
});
