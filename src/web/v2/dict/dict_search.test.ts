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

  test("fetches 2-letter chunk when prefix is not cached", () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts");

    jest.useFakeTimers();
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

    input.value = "amo";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    jest.advanceTimersByTime(200);

    // Queries 2-letter prefix "am"
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/api/completions?prefix=am")
    );
    jest.useRealTimers();
  });

  test("forwards active dict and lang parameters for suffix queries", () => {
    delete (window as any).location;
    (window as any).location = new URL(
      "http://localhost/v2/dicts?dict=ls,gaffiot&lang=La"
    );

    jest.useFakeTimers();
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

    input.value = "-arum";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    jest.advanceTimersByTime(200);

    // Suffix query uses dynamic endpoint with d=3 (L&S + GAF)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/api/completions?q=-arum&d=3&lang=La"),
      expect.anything()
    );
    jest.useRealTimers();
  });

  test("renders suggestions instantly from chunkCache without network fetch when cached", () => {
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

    // Pre-populate chunk cache for "am"
    el.chunkCache.setChunks("am", {
      "L&S": ["amabilis", "amator", "amo", "amor"],
      GAF: ["ămābĭlis", "ămātŏr", "ămō", "ămŏr"],
    });

    (global.fetch as jest.Mock).mockClear();

    input.value = "amo";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // Instant synchronous hit: 0 network calls!
    expect(global.fetch).not.toHaveBeenCalled();

    const suggestionsEl = el.querySelector("morcus-dict-suggestions") as any;
    expect(suggestionsEl).not.toBeNull();
    expect(suggestionsEl.items).toEqual([
      { lang: "La", word: "ămō" },
      { lang: "La", word: "ămŏr" },
    ]);
  });

  test("re-clusters suggestions on dict-selection-change from cache with 0 network calls", () => {
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

    // Pre-populate chunk cache with items from both default active dicts (L&S and GAF)
    el.chunkCache.setChunks("am", {
      "L&S": ["amabilis"],
      GAF: ["ămīcĭtĭa"],
    });

    input.value = "am";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const suggestionsEl = el.querySelector("morcus-dict-suggestions") as any;
    expect(suggestionsEl.items.map((i: any) => i.word)).toEqual([
      "amabilis",
      "ămīcĭtĭa",
    ]);

    (global.fetch as jest.Mock).mockClear();

    // Fire dict-selection-change to only include GAF
    el.dispatchEvent(
      new CustomEvent("dict-selection-change", {
        bubbles: true,
        detail: { dictKeys: ["GAF"], bitmask: "2" },
      })
    );

    // Suggestions immediately update with only GAF words
    expect(suggestionsEl.items.map((i: any) => i.word)).toEqual(["ămīcĭtĭa"]);
    // Zero completion network calls made for suggestions
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/v2/api/completions")
    );
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

  test("status tray updates language chips and inflection badge on settings change events", () => {
    const searchBarHtml = `
      <div class="v2-search-tray">
        <div class="v2-lang-chips">
          <span class="v2-lang-chip v2-lang-chip-la">La</span>
        </div>
        <span class="v2-inflect-chip is-on">On</span>
      </div>
    `;

    const el = createDictSearch(searchBarHtml);
    const chipsContainer = el.querySelector<HTMLElement>(".v2-lang-chips")!;
    const inflectChip = el.querySelector<HTMLElement>(".v2-inflect-chip")!;
    expect(inflectChip.classList.contains("is-on")).toBe(true);

    // 1. Dispatch dict-selection-change with only German (GRG)
    el.dispatchEvent(
      new CustomEvent("dict-selection-change", {
        detail: { dictKeys: ["GRG"] },
        bubbles: true,
      })
    );

    expect(chipsContainer.innerHTML).toContain(
      'class="v2-lang-chip v2-lang-chip-de"'
    );
    expect(chipsContainer.innerHTML).not.toContain(
      'class="v2-lang-chip v2-lang-chip-la"'
    );
    expect(chipsContainer.textContent).toContain("De");

    // 2. Dispatch dict-inflected-change to false
    el.dispatchEvent(
      new CustomEvent("dict-inflected-change", {
        detail: { isInflected: false },
        bubbles: true,
      })
    );

    const updatedInflectChip =
      el.querySelector<HTMLElement>(".v2-inflect-chip")!;
    expect(updatedInflectChip.classList.contains("is-off")).toBe(true);
    expect(updatedInflectChip.classList.contains("is-on")).toBe(false);
    expect(updatedInflectChip.textContent).toContain("Off");
  });

  test("scrolls past search bar to results when loading with a search query and no hash", (done) => {
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="v2-search-form" action="/v2/dicts" method="GET">
        <div class="v2-input-wrapper">
          <input type="text" name="q" class="v2-input" value="habeo" />
        </div>
      </form>
      <output id="dict-results" class="v2-results">
        <div>Results for habeo</div>
      </output>
    `;
    const resultsEl = el.querySelector<HTMLElement>("#dict-results")!;
    const scrollMock = jest.fn();
    resultsEl.scrollIntoView = scrollMock;

    document.body.appendChild(el);

    requestAnimationFrame(() => {
      expect(scrollMock).toHaveBeenCalledWith({
        behavior: "instant",
        block: "start",
      });
      done();
    });
  });

  test("focuses search input and does not auto-scroll on empty query landing page", (done) => {
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="v2-search-form" action="/v2/dicts" method="GET">
        <div class="v2-input-wrapper">
          <input type="text" name="q" class="v2-input" value="" />
        </div>
      </form>
      <output id="dict-results" class="v2-results"></output>
    `;
    const resultsEl = el.querySelector<HTMLElement>("#dict-results")!;
    const scrollMock = jest.fn();
    resultsEl.scrollIntoView = scrollMock;

    document.body.appendChild(el);

    requestAnimationFrame(() => {
      expect(scrollMock).not.toHaveBeenCalled();
      const input = el.querySelector<HTMLInputElement>("input.v2-input")!;
      expect(document.activeElement).toBe(input);
      done();
    });
  });

  test("still reacts to suggestion-select after the element is re-attached", () => {
    const el = createDictSearch();
    const suggestions = el.querySelector("morcus-dict-suggestions");
    expect(suggestions).not.toBeNull();
    const input = el.querySelector<HTMLInputElement>("input.v2-input")!;
    const selectHabeo = () =>
      suggestions!.dispatchEvent(
        new CustomEvent("suggestion-select", {
          detail: { word: "habeo" },
          bubbles: true,
        })
      );

    // Establish that the handler runs at all on the first attach.
    input.value = "";
    selectHabeo();
    expect(input.value).toBe("habeo");

    // Moving an element in the DOM disconnects and reconnects it, which runs
    // BaseElement's dispose(). The child is created once and cached, so the
    // listener has to be re-registered outside that one-time creation.
    el.remove();
    document.body.appendChild(el);

    input.value = "";
    selectHabeo();
    expect(input.value).toBe("habeo");
  });

  describe("stale response handling", () => {
    /**
     * Replaces fetch with one that never settles on its own, so tests can
     * resolve responses in whatever order they like. Honors AbortSignal the way
     * the real fetch does, which is the whole point: without that, nothing here
     * would be testing anything.
     */
    function controllableFetch() {
      const pending: {
        url: string;
        signal?: AbortSignal;
        respond: (html: string) => void;
      }[] = [];
      global.fetch = jest
        .fn()
        .mockImplementation((url: string, init?: RequestInit) => {
          return new Promise((resolve, reject) => {
            const signal = init?.signal ?? undefined;
            signal?.addEventListener("abort", () => {
              const error = new Error("The operation was aborted.");
              error.name = "AbortError";
              reject(error);
            });
            pending.push({
              url,
              signal,
              respond: (html: string) =>
                resolve({
                  ok: true,
                  text: () => Promise.resolve(html),
                  json: () => Promise.resolve([]),
                } as unknown as Response),
            });
          });
        });
      return pending;
    }

    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    function submit(el: MorcusDictSearch, query: string) {
      const form = el.querySelector<HTMLFormElement>("form.v2-search-form")!;
      el.querySelector<HTMLInputElement>("input.v2-input")!.value = query;
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    }

    test("a superseded search does not overwrite the results of a newer one", async () => {
      const pending = controllableFetch();
      const el = createDictSearch();

      submit(el, "alpha");
      submit(el, "beta");
      await flush();

      expect(pending).toHaveLength(2);
      expect(pending[0].url).toContain("q=alpha");
      expect(pending[1].url).toContain("q=beta");
      // The first request is cancelled the moment the second one starts.
      expect(pending[0].signal?.aborted).toBe(true);
      expect(pending[1].signal?.aborted).toBe(false);

      // The newer response lands first, then the stale one arrives late. This
      // is the ordering that used to corrupt the page.
      pending[1].respond('<div class="results">beta results</div>');
      await flush();
      pending[0].respond('<div class="results">alpha results</div>');
      await flush();

      const results = el.querySelector<HTMLElement>("#dict-results")!;
      expect(results.textContent).toContain("beta results");
      expect(results.textContent).not.toContain("alpha results");
    });

    test("a superseded search leaves the loading state of the live one intact", async () => {
      const pending = controllableFetch();
      const el = createDictSearch();
      const results = el.querySelector<HTMLElement>("#dict-results")!;

      submit(el, "alpha");
      submit(el, "beta");
      await flush();

      // The cancelled request must not clear the dim that the live request set,
      // and the live request must not be left permanently dimmed afterwards.
      expect(results.style.opacity).toBe("0.5");
      pending[1].respond('<div class="results">beta results</div>');
      await flush();
      expect(results.style.opacity).toBe("");
    });

    test("abandoning the query cancels the in-flight completions request", async () => {
      const pending = controllableFetch();
      jest.useFakeTimers();
      const el = createDictSearch();
      const input = el.querySelector<HTMLInputElement>("input.v2-input")!;

      // A suffix query goes straight to /v2/api/completions. A prefix query
      // would instead hit the shared chunk cache, which is deliberately not
      // cancellable.
      input.value = "-arum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(200);
      jest.useRealTimers();

      const completions = pending.find((p) => p.url.includes("/completions"));
      expect(completions).toBeDefined();
      expect(completions!.signal?.aborted).toBe(false);

      // Deleting back below the completion threshold dismisses the dropdown,
      // so nothing is left to display the response.
      input.value = "-";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(completions!.signal?.aborted).toBe(true);
    });
  });
});
