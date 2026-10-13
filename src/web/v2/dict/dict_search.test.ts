/**
 * @jest-environment jsdom
 */
// Suggestions register first, as in `dict_entry.client.ts`.
import "@/web/v2/dict/dict_suggestions.client";
import "@/web/v2/dict/dict_search.client";
import { MorcusDictSearch } from "@/web/v2/dict/dict_search.client";
import {
  DEFAULT_DICT_KEYS,
  encodeDictBitmask,
} from "@/web/v2/dict/dict_bitmask.common";
import type { DictSettingsCommit } from "@/web/v2/dict/dict_settings.client";

/** What `<morcus-dict-settings>` emits when its dialog closes with changes. */
function commitSettings(
  el: HTMLElement,
  dictKeys: readonly string[],
  isInflected: boolean
) {
  const detail: DictSettingsCommit = {
    dictKeys: [...dictKeys],
    bitmask: encodeDictBitmask(dictKeys),
    isInflected,
  };
  el.dispatchEvent(
    new CustomEvent("dict-settings-commit", { bubbles: true, detail })
  );
}

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

  /** `formAttrs`: the resolved state the server renders onto the form (`data-d`, `data-o`). */
  function createDictSearch(
    resultsHtml: string = "",
    formAttrs: string = "",
    { flushWords = true }: { flushWords?: boolean } = {}
  ): MorcusDictSearch {
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="search-form" action="/v2/dicts" method="GET" ${formAttrs}>
        <div class="input-wrapper">
          <input type="text" name="q" id="dict-q" class="input" value="habeo" />
          <morcus-dict-suggestions data-js-only data-input="dict-q">
            <ul id="dict-suggestions-list" class="suggestions" role="listbox" hidden></ul>
          </morcus-dict-suggestions>
        </div>
      </form>
      <output id="dict-results" class="results">
        ${resultsHtml}
      </output>
    `;
    document.body.appendChild(el);
    // Tokenizing is deferred until after the first paint (tested separately
    // below); run it now so these tests see the enhanced words. It is
    // idempotent, so the deferred run later finds nothing left to do.
    if (flushWords) {
      el.enhanceWords(el.querySelector<HTMLElement>("#dict-results"));
    }
    return el;
  }

  test("progressively enhances Latin words in entry content while respecting denylist", () => {
    const resultsHtml = `
      <article class="entry">
        <div class="entry-content">
          <p>
            <b class="lsOrth">habeo</b>,
            <span class="lsHover" title="verb">v.</span>,
            <span class="lsQuote">Gallia est omnis</span>,
            <b class="lsEmph">important note</b>,
            <span lang="el">&#x1F35;&#x3C0;&#x3C0;&#x3BF;&#x3C2;</span>,
            <span class="dLink" to="facio">facio</span>,
            <a href="#sense-1" class="section-anchor">1</a>
          </p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);

    // Enhanced words inside .lsQuote are wrapped in .lat-word
    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));
    const wordTexts = words.map((w) => w.textContent);

    expect(wordTexts).toContain("Gallia");
    expect(wordTexts).toContain("est");
    expect(wordTexts).toContain("omnis");

    // Denylist check: lsOrth (headwords) is NOT wrapped
    const orthEl = el.querySelector(".lsOrth")!;
    expect(orthEl.querySelector(".lat-word")).toBeNull();
    expect(orthEl.textContent).toBe("habeo");

    // Denylist check: lsHover (abbreviations with popovers) is NOT wrapped
    const hoverEl = el.querySelector(".lsHover")!;
    expect(hoverEl.querySelector(".lat-word")).toBeNull();

    // Denylist check: lsEmph (emphasized bold) is NOT wrapped
    const emphEl = el.querySelector(".lsEmph")!;
    expect(emphEl.querySelector(".lat-word")).toBeNull();

    // Denylist check: Greek text is NOT wrapped
    const greekEl = el.querySelector('[lang="el"]')!;
    expect(greekEl.querySelector(".lat-word")).toBeNull();

    // Denylist check: existing anchors are NOT wrapped
    const anchorEl = el.querySelector(".section-anchor")!;
    expect(anchorEl.querySelector(".lat-word")).toBeNull();

    // Denylist check: dLink is preserved
    const dLinkEl = el.querySelector(".dLink")!;
    expect(dLinkEl.querySelector(".lat-word")).toBeNull();
  });

  test("handles words with macra and cleans data-word attribute", () => {
    const resultsHtml = `
      <article class="entry">
        <div class="entry-content">
          <p>causa\u0304s me\u0304mora\u0304</p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);
    const words = Array.from(el.querySelectorAll<HTMLElement>(".lat-word"));

    expect(words.length).toBe(2);
    // Display text preserves macra
    expect(words[0].textContent).toBe("causa\u0304s");
    expect(words[1].textContent).toBe("me\u0304mora\u0304");

    // data-word has diacritics stripped for lookup
    expect(words[0].dataset.word).toBe("causas");
    expect(words[1].dataset.word).toBe("memora");
  });

  describe("deferred tokenization", () => {
    const RESULTS = `
      <article class="entry">
        <div class="entry-content"><p><span class="lsQuote">Gallia est</span></p></div>
      </article>
    `;

    let frames: FrameRequestCallback[] = [];
    function runFrame() {
      const callbacks = frames;
      frames = [];
      callbacks.forEach((cb) => cb(performance.now()));
    }

    beforeEach(() => {
      frames = [];
      jest.useFakeTimers({
        doNotFake: ["requestAnimationFrame", "cancelAnimationFrame"],
      });
      jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        frames.push(cb);
        return frames.length;
      });
    });
    afterEach(() => jest.useRealTimers());

    test("tokenizes after the first paint, not during connect", () => {
      const el = createDictSearch(RESULTS, "", { flushWords: false });
      // The load task leaves the results as plain text...
      expect(el.querySelectorAll(".lat-word")).toHaveLength(0);
      // ...and so does the frame that paints them (and scrolls to them).
      runFrame();
      expect(el.querySelectorAll(".lat-word")).toHaveLength(0);
      // The task after that paint tokenizes.
      jest.runOnlyPendingTimers();
      expect(
        Array.from(el.querySelectorAll(".lat-word"), (w) => w.textContent)
      ).toEqual(["Gallia", "est"]);
    });

    test("does nothing if disconnected before it runs", () => {
      const el = createDictSearch(RESULTS, "", { flushWords: false });
      runFrame();
      el.remove();
      jest.runOnlyPendingTimers();
      expect(el.querySelectorAll(".lat-word")).toHaveLength(0);
    });
  });

  test("clicking an enhanced word triggers search for that word", () => {
    const resultsHtml = `
      <article class="entry">
        <div class="entry-content">
          <p><span class="lsQuote">Gallia est</span></p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);

    const galliaSpan = el.querySelector<HTMLElement>(
      '.lat-word[data-word="Gallia"]'
    )!;
    expect(galliaSpan).not.toBeNull();

    galliaSpan.click();

    const input = el.querySelector<HTMLInputElement>("input.input")!;
    expect(input.value).toBe("Gallia");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=Gallia"),
      expect.anything()
    );
  });

  test("clicking a dLink triggers search for the target word", () => {
    const resultsHtml = `
      <article class="entry">
        <div class="entry-content">
          <p><span class="dLink" to="facio">facio</span></p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);

    const dLink = el.querySelector<HTMLElement>(".dLink")!;
    dLink.click();

    const input = el.querySelector<HTMLInputElement>("input.input")!;
    expect(input.value).toBe("facio");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=facio"),
      expect.anything()
    );
  });

  test("generates anchor element with href preserving query params for middle-click / open in new tab", () => {
    // `embedded` still comes from the page URL; dictionaries come from the rendered form state.
    window.history.replaceState(
      {},
      "",
      "/v2/dicts?q=habeo&dict=L%26S&embedded=1"
    );

    const resultsHtml = `
      <article class="entry">
        <div class="entry-content">
          <p><span class="lsQuote">Gallia est</span></p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml, 'data-d="1" data-o="1"');
    const galliaLink = el.querySelector<HTMLAnchorElement>(
      '.lat-word[data-word="Gallia"]'
    )!;

    expect(galliaLink).not.toBeNull();
    expect(galliaLink.tagName.toLowerCase()).toBe("a");
    // L&S bit is 1
    expect(galliaLink.getAttribute("href")).toBe(
      "/v2/dicts?q=Gallia&d=1&o=1&embedded=1"
    );

    // Clean up history state
    window.history.replaceState({}, "", "/v2/dicts");
  });

  test("adopts the server-rendered state over a disagreeing URL and localStorage", () => {
    // Regression (F1–F4): the client used to re-resolve URL → localStorage → default, so it could
    // query different dictionaries from the ones the server rendered results for.
    window.history.replaceState({}, "", "/v2/dicts?q=habeo&d=an&o=1");
    localStorage.setItem("SEARCH_SETTINGS_KEY", "L&S;GAF;GRG");
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({ inflectedSearch: true })
    );

    const resultsHtml = `
      <article class="entry">
        <div class="entry-content"><p><span class="lsQuote">Gallia</span></p></div>
      </article>
    `;
    // GAF only (bit 1 → 2), exact headwords.
    const el = createDictSearch(resultsHtml, 'data-d="2" data-o="0"');
    const link = el.querySelector<HTMLAnchorElement>(".lat-word")!;
    expect(link.getAttribute("href")).toBe("/v2/dicts?q=Gallia&d=2&o=0");

    window.history.replaceState({}, "", "/v2/dicts");
  });

  test("allows native new-tab opening on middle click or modifier clicks (Ctrl, Cmd, Shift, Alt)", () => {
    const resultsHtml = `
      <article class="entry">
        <div class="entry-content">
          <p>
            <span class="lsQuote">Gallia est</span>
            <a class="dLink" to="facio" href="/v2/dicts?q=facio">facio</a>
          </p>
        </div>
      </article>
    `;

    const el = createDictSearch(resultsHtml);
    const galliaLink = el.querySelector<HTMLAnchorElement>(
      '.lat-word[data-word="Gallia"]'
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

    let unpreventedClicks = 0;
    const onWindowClick = (e: MouseEvent) => {
      if (!e.defaultPrevented) {
        unpreventedClicks++;
      }
      // Prevent jsdom's async navigation timer
      e.preventDefault();
    };
    window.addEventListener("click", onWindowClick);

    try {
      // Middle click (button 1) should NOT be prevented by component
      const middleClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 1,
      });
      galliaLink.dispatchEvent(middleClick);
      expect(unpreventedClicks).toBe(1);

      // Ctrl+click should NOT be prevented by component
      const ctrlClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: true,
      });
      galliaLink.dispatchEvent(ctrlClick);
      expect(unpreventedClicks).toBe(2);

      // Cmd/Meta+click should NOT be prevented by component
      const metaClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        metaKey: true,
      });
      galliaLink.dispatchEvent(metaClick);
      expect(unpreventedClicks).toBe(3);

      // Modifier click on dLink should also NOT be prevented by component
      const dLinkCtrlClick = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: true,
      });
      dLink.dispatchEvent(dLinkCtrlClick);
      expect(unpreventedClicks).toBe(4);
    } finally {
      window.removeEventListener("click", onWindowClick);
    }
  });

  test("sanitizes query by trimming quotes, punctuation, and whitespace on form submission", () => {
    const el = createDictSearch();
    const form = el.querySelector<HTMLFormElement>("form.search-form")!;
    const input = el.querySelector<HTMLInputElement>("input.input")!;

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
    const input = el.querySelector<HTMLInputElement>("input.input")!;

    input.value = "amo";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    jest.advanceTimersByTime(200);

    // Queries 2-letter prefix "am"
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/api/completions?prefix=am")
    );
    jest.useRealTimers();
  });

  test("a failed chunk fetch clears the previous prefix's suggestions", async () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts");
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.useFakeTimers();
    try {
      const el = createDictSearch();
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      const suggestions = el.querySelector("morcus-dict-suggestions") as any;
      input.focus();
      el.chunkCache.set("am", { "L&S": ["amo"], GAF: ["ămō"] });

      input.value = "amo";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(suggestions.items).not.toHaveLength(0);

      // "be" isn't cached and its fetch fails (e.g. offline).
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));
      input.value = "bello";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/v2/api/completions?prefix=be")
      );
      jest.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(suggestions.items).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      errorSpy.mockRestore();
    }
  });

  test("forwards the active dicts for suffix queries", () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts");

    jest.useFakeTimers();
    // L&S + GAF = 3, as the server would render it.
    const el = createDictSearch("", 'data-d="3" data-o="1"');
    const input = el.querySelector<HTMLInputElement>("input.input")!;

    input.value = "-arum";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    jest.advanceTimersByTime(200);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/api/completions?q=-arum&d=3"),
      expect.anything()
    );
    jest.useRealTimers();
  });

  describe("autocomplete in a lang= view suggests what a typed search will query", () => {
    // A typed search there leaves the scope, so it uses the saved selection, not the narrowed one.
    const SAVED = ["L&S", "S&H", "GRG"];

    beforeEach(() => {
      delete (window as any).location;
      (window as any).location = new URL(
        "http://localhost/v2/dicts?q=arma&lang=La&o=1&embedded=1"
      );
      document.cookie = `morcus_d=${encodeDictBitmask(SAVED)}; Path=/`;
    });

    afterEach(() => {
      document.cookie = "morcus_d=; Max-Age=0; Path=/";
      delete (window as any).location;
      (window as any).location = new URL("http://localhost/v2/dicts");
    });

    test("prefix suggestions come from the saved dictionaries, in every language", () => {
      // The server narrowed the view to L&S + GAF.
      const el = createDictSearch("", 'data-d="3" data-o="1"');
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      el.chunkCache.set("am", {
        "L&S": ["amabilis"],
        GAF: ["ămīcĭtĭa"],
        "S&H": ["amber"],
        GRG: ["Ameise"],
      });

      input.value = "am";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      const suggestionsEl = el.querySelector("morcus-dict-suggestions") as any;
      expect(
        suggestionsEl.items.map((i: any) => `${i.lang}:${i.word}`).sort()
      ).toEqual(["De:Ameise", "En:amber", "La:amabilis"]);
    });

    test("suffix suggestions query the saved dictionaries without lang", () => {
      jest.useFakeTimers();
      const el = createDictSearch("", 'data-d="3" data-o="1"');
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      input.value = "-arum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(200);

      expect(global.fetch).toHaveBeenCalledWith(
        `/v2/api/completions?q=-arum&d=${encodeDictBitmask(SAVED)}`,
        expect.anything()
      );
      jest.useRealTimers();
    });

    test("with nothing saved, suggestions use the defaults", () => {
      document.cookie = "morcus_d=; Max-Age=0; Path=/";
      jest.useFakeTimers();
      const el = createDictSearch("", 'data-d="3" data-o="1"');
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      input.value = "-arum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      jest.advanceTimersByTime(200);

      expect(global.fetch).toHaveBeenCalledWith(
        `/v2/api/completions?q=-arum&d=${encodeDictBitmask(DEFAULT_DICT_KEYS)}`,
        expect.anything()
      );
      jest.useRealTimers();
    });
  });

  test("renders suggestions instantly from chunkCache without network fetch when cached", () => {
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.input")!;

    // Pre-populate chunk cache for "am"
    el.chunkCache.set("am", {
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

  test("re-clusters suggestions on dict-settings-commit from cache with 0 network calls", () => {
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.input")!;

    // Pre-populate chunk cache with items from both default active dicts (L&S and GAF)
    el.chunkCache.set("am", {
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

    // Fire dict-settings-commit to only include GAF
    commitSettings(el, ["GAF"], true);

    // Suggestions immediately update with only GAF words
    expect(suggestionsEl.items.map((i: any) => i.word)).toEqual(["ămīcĭtĭa"]);
    // Zero completion network calls made for suggestions
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/v2/api/completions")
    );
  });

  test("dict-settings-commit does not reopen suggestions closed by blur", () => {
    const el = createDictSearch();
    const input = el.querySelector<HTMLInputElement>("input.input")!;
    el.chunkCache.set("am", {
      "L&S": ["amabilis"],
      GAF: ["ămīcĭtĭa"],
    });
    input.value = "am";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const suggestionsEl = el.querySelector("morcus-dict-suggestions") as any;
    const listbox = suggestionsEl.querySelector("ul") as HTMLUListElement;
    expect(listbox.hidden).toBe(false);

    // e.g. focus moves to the settings popover.
    input.dispatchEvent(new Event("blur"));
    expect(listbox.hidden).toBe(true);

    commitSettings(el, ["GAF"], true);

    expect(suggestionsEl.items).toEqual([]);
    expect(listbox.hidden).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  test("updates landing welcome message and badges on dict-settings-commit when query is empty", () => {
    const landingHtml = `
      <div id="landing-welcome">Initial Welcome</div>
      <div class="dict-list-item dict-enabled" data-dict-key="GRG">
        <span class="lexicon-badge dict-enabled">GRG</span>
      </div>
      <div class="dict-list-item dict-disabled" data-dict-key="EGL">
        <span class="lexicon-badge dict-disabled">EGL</span>
      </div>
    `;

    const el = createDictSearch(landingHtml);
    const input = el.querySelector<HTMLInputElement>("input.input")!;
    input.value = ""; // Empty search query (landing state)

    // Fire dict-settings-commit with only L&S and S&H (disabling Georges)
    commitSettings(el, ["L&S", "S&H"], true);

    const welcomeEl = el.querySelector<HTMLElement>("#landing-welcome")!;
    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English."
    );

    const grgItem = el.querySelector<HTMLElement>(
      '.dict-list-item[data-dict-key="GRG"]'
    )!;
    expect(grgItem.classList.contains("dict-disabled")).toBe(true);
    expect(grgItem.classList.contains("dict-enabled")).toBe(false);

    // Re-enable Georges
    commitSettings(el, ["L&S", "S&H", "GRG"], true);
    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
    );
    expect(grgItem.classList.contains("dict-enabled")).toBe(true);
  });

  test("synchronizes d and o query parameters on dict-settings-commit", () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts?q=habeo");
    const replaceStateSpy = jest.spyOn(window.history, "replaceState");

    const el = createDictSearch();

    // Toggle dict selection
    commitSettings(el, ["L&S", "GAF"], true);

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("d=3")
    );

    // Toggle inflection
    commitSettings(el, ["L&S", "GAF"], false);

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      expect.stringContaining("o=0")
    );

    replaceStateSpy.mockRestore();
  });

  test("on an entry page, a settings commit keeps the server's ID title", () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts/id/n20077");
    document.title = "ID n20077 - Morcus Dictionary";

    const el = createDictSearch();
    commitSettings(el, ["L&S", "GAF"], false);

    expect(document.title).toBe("ID n20077 - Morcus Dictionary");
  });

  test("Back to an entry page restores its ID title", () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts?q=amo");
    createDictSearch();

    (window as any).location = new URL("http://localhost/v2/dicts/id/n20077");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(document.title).toBe("ID n20077 - Morcus Dictionary");
  });

  test("dict-settings-commit updates the search form's hidden d/o and dataset, and keeps lang in the URL", () => {
    delete (window as any).location;
    (window as any).location = new URL(
      "http://localhost/v2/dicts?q=habeo&lang=La"
    );
    const replaceStateSpy = jest.spyOn(window.history, "replaceState");

    const el = createDictSearch("", 'data-d="an" data-o="1"');
    const form = el.querySelector<HTMLFormElement>("form.search-form")!;
    form.insertAdjacentHTML(
      "afterbegin",
      '<input type="hidden" name="d" value="an" /><input type="hidden" name="o" value="1" />'
    );

    commitSettings(el, ["GRG"], false);

    const fields = new FormData(form);
    expect(fields.get("d")).toBe(encodeDictBitmask(["GRG"]));
    expect(fields.get("o")).toBe("0");
    expect(form.dataset.d).toBe(encodeDictBitmask(["GRG"]));
    expect(form.dataset.o).toBe("0");
    // The new `d=` is narrowed to `lang`, so the two must stay together.
    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      `/v2/dicts?q=habeo&lang=La&d=${encodeDictBitmask(["GRG"])}&o=0`
    );

    replaceStateSpy.mockRestore();
  });

  test("popstate navigation re-syncs current active d and o into the restored history entry", () => {
    delete (window as any).location;
    (window as any).location = new URL(
      "http://localhost/v2/dicts?q=amo&d=an&o=1"
    );
    const replaceStateSpy = jest.spyOn(window.history, "replaceState");

    const el = createDictSearch("", 'data-d="an" data-o="1"');
    commitSettings(el, ["GAF"], false);
    replaceStateSpy.mockClear();

    // Simulate browser Back restoring an older URL with stale d=an&o=1
    (window as any).location = new URL(
      "http://localhost/v2/dicts?q=bellum&d=an&o=1"
    );
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(replaceStateSpy).toHaveBeenCalledWith(
      null,
      "",
      "/v2/dicts?q=bellum&d=2&o=0"
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/dicts?q=bellum&format=partial&d=2&o=0"),
      expect.anything()
    );

    replaceStateSpy.mockRestore();
  });

  test("popstate back to the initial URL after a search re-fetches the initial query", () => {
    delete (window as any).location;
    (window as any).location = new URL(
      "http://localhost/v2/dicts?q=amo&d=an&o=1"
    );

    const el = createDictSearch("", 'data-d="an" data-o="1"');
    const form = el.querySelector<HTMLFormElement>("form.search-form")!;
    const input = el.querySelector<HTMLInputElement>("input.input")!;

    // Submit a new search (pushes ?q=bellum&d=an&o=1)
    input.value = "bellum";
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    (global.fetch as jest.Mock).mockClear();

    // Press Back to the exact connect-time URL
    (window as any).location = new URL(
      "http://localhost/v2/dicts?q=amo&d=an&o=1"
    );
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(input.value).toBe("amo");
    expect(document.title).toBe("amo - Morcus Dictionary");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v2/dicts?q=amo&format=partial&d=an&o=1"),
      expect.anything()
    );
  });

  describe("in a lang= view (the reader's dictionary)", () => {
    const READER_URL =
      "http://localhost/v2/dicts?q=arma&lang=La&o=1&embedded=1&scale=120";
    let assign: jest.Mock;

    beforeEach(() => {
      delete (window as any).location;
      assign = jest.fn();
      (window as any).location = Object.assign(new URL(READER_URL), {
        assign,
      });
    });

    test("a typed search leaves the scope with a full load, dropping lang and d", () => {
      const pushStateSpy = jest.spyOn(window.history, "pushState");
      // The narrowed selection the server rendered for `lang=La`.
      const el = createDictSearch("", 'data-d="3" data-o="1"');
      const form = el.querySelector<HTMLFormElement>("form.search-form")!;
      el.querySelector<HTMLInputElement>("input.input")!.value = "love";
      (global.fetch as jest.Mock).mockClear();

      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );

      expect(assign).toHaveBeenCalledWith(
        "/v2/dicts?q=love&o=1&embedded=1&scale=120"
      );
      expect(pushStateSpy).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/v2/dicts?"),
        expect.anything()
      );
    });

    test("an autocomplete pick also leaves the scope", () => {
      const el = createDictSearch("", 'data-d="3" data-o="1"');
      el.querySelector("morcus-dict-suggestions")!.dispatchEvent(
        new CustomEvent("suggestion-select", {
          bubbles: true,
          detail: { word: "love" },
        })
      );
      expect(assign).toHaveBeenCalledWith(
        "/v2/dicts?q=love&o=1&embedded=1&scale=120"
      );
    });

    test("following a word in the results stays in scope", () => {
      const pushStateSpy = jest.spyOn(window.history, "pushState");
      const el = createDictSearch(
        '<div class="entry-content"><span class="lsQuote">Gallia</span></div>',
        'data-d="3" data-o="1"'
      );
      el.querySelector<HTMLElement>(".lat-word")!.click();

      expect(assign).not.toHaveBeenCalled();
      expect(pushStateSpy).toHaveBeenCalledWith(
        { q: "Gallia" },
        "",
        "/v2/dicts?q=Gallia&lang=La&o=1&embedded=1&scale=120&d=3"
      );
    });
  });

  test("search execution explicitly syncs q, d, and o parameters in history and document title", async () => {
    delete (window as any).location;
    (window as any).location = new URL("http://localhost/v2/dicts");
    const pushStateSpy = jest.spyOn(window.history, "pushState");

    const el = createDictSearch();
    const form = el.querySelector<HTMLFormElement>("form.search-form")!;
    const input = el.querySelector<HTMLInputElement>("input.input")!;

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

  test("landing welcome message reacts live to dict-settings-commit", () => {
    const landingHtml = `
      <div id="landing-welcome">Initial Welcome</div>
    `;

    const el = createDictSearch(landingHtml);
    const welcomeEl = el.querySelector<HTMLElement>("#landing-welcome")!;

    // Initial state with default dicts: Latin headwords and inflected forms
    commitSettings(el, DEFAULT_DICT_KEYS, false);

    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords, and words in English and German."
    );
    expect(welcomeEl.textContent).not.toContain("inflected forms");

    // Toggle back to inflected on
    commitSettings(el, DEFAULT_DICT_KEYS, true);

    expect(welcomeEl.textContent).toBe(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
    );
  });

  test("status tray updates language chips and inflection badge on settings change events", () => {
    const searchBarHtml = `
      <div class="search-tray">
        <div class="lang-chips">
          <span class="lang-chip lang-chip-la">La</span>
        </div>
        <span class="inflect-chip is-on">On</span>
      </div>
    `;

    const el = createDictSearch(searchBarHtml);
    const chipsContainer = el.querySelector<HTMLElement>(".lang-chips")!;
    const inflectChip = el.querySelector<HTMLElement>(".inflect-chip")!;
    expect(inflectChip.classList.contains("is-on")).toBe(true);

    // 1. Dispatch dict-settings-commit with only German (GRG)
    commitSettings(el, ["GRG"], true);

    expect(chipsContainer.innerHTML).toContain(
      'class="lang-chip lang-chip-de"'
    );
    expect(chipsContainer.innerHTML).not.toContain(
      'class="lang-chip lang-chip-la"'
    );
    expect(chipsContainer.textContent).toContain("De");

    // 2. Dispatch dict-settings-commit to false
    commitSettings(el, ["GRG"], false);

    const updatedInflectChip = el.querySelector<HTMLElement>(".inflect-chip")!;
    expect(updatedInflectChip.classList.contains("is-off")).toBe(true);
    expect(updatedInflectChip.classList.contains("is-on")).toBe(false);
    expect(updatedInflectChip.textContent).toContain("Off");
  });

  test("scrolls past search bar to results when loading with a search query and no hash", (done) => {
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="search-form" action="/v2/dicts" method="GET">
        <div class="input-wrapper">
          <input type="text" name="q" id="dict-q" class="input" value="habeo" />
          <morcus-dict-suggestions data-js-only data-input="dict-q">
            <ul id="dict-suggestions-list" class="suggestions" role="listbox" hidden></ul>
          </morcus-dict-suggestions>
        </div>
      </form>
      <output id="dict-results" class="results">
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

  test("does not yank scroll position on hydration if user has already scrolled (window.scrollY > 0)", (done) => {
    Object.defineProperty(window, "scrollY", {
      value: 420,
      writable: true,
      configurable: true,
    });

    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="search-form" action="/v2/dicts" method="GET">
        <div class="input-wrapper">
          <input type="text" name="q" id="dict-q" class="input" value="habeo" />
          <morcus-dict-suggestions data-js-only data-input="dict-q">
            <ul id="dict-suggestions-list" class="suggestions" role="listbox" hidden></ul>
          </morcus-dict-suggestions>
        </div>
      </form>
      <output id="dict-results" class="results">
        <div>Results for habeo</div>
      </output>
    `;
    const resultsEl = el.querySelector<HTMLElement>("#dict-results")!;
    const scrollMock = jest.fn();
    resultsEl.scrollIntoView = scrollMock;

    document.body.appendChild(el);

    requestAnimationFrame(() => {
      expect(scrollMock).not.toHaveBeenCalled();
      Object.defineProperty(window, "scrollY", {
        value: 0,
        writable: true,
        configurable: true,
      });
      done();
    });
  });

  test("does not yank scroll position if user scrolls between connect and rAF", (done) => {
    Object.defineProperty(window, "scrollY", {
      value: 0,
      writable: true,
      configurable: true,
    });

    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="search-form" action="/v2/dicts" method="GET">
        <div class="input-wrapper">
          <input type="text" name="q" id="dict-q" class="input" value="habeo" />
          <morcus-dict-suggestions data-js-only data-input="dict-q">
            <ul id="dict-suggestions-list" class="suggestions" role="listbox" hidden></ul>
          </morcus-dict-suggestions>
        </div>
      </form>
      <output id="dict-results" class="results">
        <div>Results for habeo</div>
      </output>
    `;
    const resultsEl = el.querySelector<HTMLElement>("#dict-results")!;
    const scrollMock = jest.fn();
    resultsEl.scrollIntoView = scrollMock;

    document.body.appendChild(el);

    // User scrolls before the scheduled rAF fires
    Object.defineProperty(window, "scrollY", {
      value: 280,
      writable: true,
      configurable: true,
    });

    requestAnimationFrame(() => {
      expect(scrollMock).not.toHaveBeenCalled();
      Object.defineProperty(window, "scrollY", {
        value: 0,
        writable: true,
        configurable: true,
      });
      done();
    });
  });

  test("focuses search input and does not auto-scroll on empty query landing page", (done) => {
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="search-form" action="/v2/dicts" method="GET">
        <div class="input-wrapper">
          <input type="text" name="q" class="input" value="" />
        </div>
      </form>
      <output id="dict-results" class="results"></output>
    `;
    const resultsEl = el.querySelector<HTMLElement>("#dict-results")!;
    const scrollMock = jest.fn();
    resultsEl.scrollIntoView = scrollMock;

    document.body.appendChild(el);

    requestAnimationFrame(() => {
      expect(scrollMock).not.toHaveBeenCalled();
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      expect(document.activeElement).toBe(input);
      done();
    });
  });

  test("does not autofocus the landing input if the user has scrolled (PH9)", () => {
    Object.defineProperty(window, "scrollY", {
      value: 350,
      writable: true,
      configurable: true,
    });
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="search-form" action="/v2/dicts" method="GET">
        <div class="input-wrapper">
          <input type="text" name="q" class="input" value="" />
        </div>
      </form>
      <output id="dict-results" class="results"></output>
    `;
    try {
      document.body.appendChild(el);
      expect(document.activeElement).not.toBe(el.querySelector("input.input"));
    } finally {
      Object.defineProperty(window, "scrollY", {
        value: 0,
        writable: true,
        configurable: true,
      });
    }
  });

  test("treats text typed before upgrade as a search in progress (PH3)", (done) => {
    const el = document.createElement("morcus-dict-search") as MorcusDictSearch;
    el.innerHTML = `
      <form class="search-form" action="/v2/dicts" method="GET">
        <div class="input-wrapper">
          <input type="text" name="q" class="input" value="" />
        </div>
      </form>
      <output id="dict-results" class="results"></output>
    `;
    const resultsEl = el.querySelector<HTMLElement>("#dict-results")!;
    const scrollMock = jest.fn();
    resultsEl.scrollIntoView = scrollMock;
    const input = el.querySelector<HTMLInputElement>("input.input")!;

    // Landing page (no ?q=); the user types before v2.js arrives.
    const container = document.createElement("div");
    container.appendChild(el);
    input.value = "hab";

    document.body.appendChild(container);

    requestAnimationFrame(() => {
      // Not mistaken for a server-rendered results page.
      expect(scrollMock).not.toHaveBeenCalled();
      // The typed text is kept.
      expect(input.value).toBe("hab");
      done();
    });
  });

  test("still reacts to suggestion-select after the element is re-attached", () => {
    const el = createDictSearch();
    const suggestions = el.querySelector("morcus-dict-suggestions");
    expect(suggestions).not.toBeNull();
    const input = el.querySelector<HTMLInputElement>("input.input")!;
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
      const form = el.querySelector<HTMLFormElement>("form.search-form")!;
      el.querySelector<HTMLInputElement>("input.input")!.value = query;
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
      expect(results.getAttribute("aria-busy")).toBe("true");
      pending[1].respond('<div class="results">beta results</div>');
      await flush();
      expect(results.style.opacity).toBe("");
      expect(results.hasAttribute("aria-busy")).toBe(false);
    });

    test("abandoning the query cancels the in-flight completions request", async () => {
      const pending = controllableFetch();
      jest.useFakeTimers();
      const el = createDictSearch();
      const input = el.querySelector<HTMLInputElement>("input.input")!;

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

    test("does not autofocus search input when embedded in an iframe (embedded=1)", () => {
      delete (window as any).location;
      (window as any).location = new URL(
        "http://localhost/v2/dicts?embedded=1"
      );
      const el = document.createElement(
        "morcus-dict-search"
      ) as MorcusDictSearch;
      el.innerHTML = `
        <form class="search-form" action="/v2/dicts" method="GET">
          <div class="input-wrapper">
            <input type="text" name="q" class="input" value="" />
          </div>
        </form>
        <output id="dict-results" class="results"></output>
      `;
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      const focusSpy = jest.spyOn(input, "focus");
      document.body.appendChild(el);

      expect(focusSpy).not.toHaveBeenCalled();
    });

    test("autofocuses search input on landing when not embedded and query is empty", () => {
      delete (window as any).location;
      (window as any).location = new URL("http://localhost/v2/dicts");
      const el = document.createElement(
        "morcus-dict-search"
      ) as MorcusDictSearch;
      el.innerHTML = `
        <form class="search-form" action="/v2/dicts" method="GET">
          <div class="input-wrapper">
            <input type="text" name="q" class="input" value="" />
          </div>
        </form>
        <output id="dict-results" class="results"></output>
      `;
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      const focusSpy = jest.spyOn(input, "focus");
      document.body.appendChild(el);

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe("combobox ARIA and keyboard navigation", () => {
    test("initializes combobox ARIA and controls listbox on input", () => {
      const el = createDictSearch();
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      const suggestions = el.querySelector("morcus-dict-suggestions") as any;
      const listbox = suggestions.querySelector(
        'ul[role="listbox"]'
      ) as HTMLElement;

      expect(input.getAttribute("role")).toBe("combobox");
      expect(input.getAttribute("aria-autocomplete")).toBe("list");
      expect(input.getAttribute("aria-expanded")).toBe("false");
      expect(input.getAttribute("aria-controls")).toBe(listbox.id);
      expect(listbox.hidden).toBe(true);

      el.chunkCache.set("am", {
        "L&S": ["amo", "amor"],
      });
      input.value = "amo";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(input.getAttribute("aria-expanded")).toBe("true");
      expect(listbox.hidden).toBe(false);

      const items = listbox.querySelectorAll<HTMLLIElement>(".suggestion-item");
      expect(items.length).toBe(2);
      expect(items[0].getAttribute("role")).toBe("option");
      expect(items[0].getAttribute("aria-selected")).toBe("false");
      expect(items[0].id).toBeTruthy();
    });

    test("navigates suggestions with ArrowDown / ArrowUp and selects with Enter", () => {
      const el = createDictSearch();
      const input = el.querySelector<HTMLInputElement>("input.input")!;
      const suggestions = el.querySelector("morcus-dict-suggestions") as any;
      const listbox = suggestions.querySelector(
        'ul[role="listbox"]'
      ) as HTMLElement;

      el.chunkCache.set("am", {
        "L&S": ["amo", "amor"],
      });
      input.value = "amo";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      const items = listbox.querySelectorAll<HTMLLIElement>(".suggestion-item");

      // ArrowDown selects first item
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        })
      );
      expect(input.getAttribute("aria-activedescendant")).toBe(items[0].id);
      expect(items[0].getAttribute("aria-selected")).toBe("true");
      expect(items[0].classList.contains("active")).toBe(true);

      // ArrowDown wraps to second item
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        })
      );
      expect(input.getAttribute("aria-activedescendant")).toBe(items[1].id);
      expect(items[1].getAttribute("aria-selected")).toBe("true");
      expect(items[0].getAttribute("aria-selected")).toBe("false");

      // Enter picks the second item ("amor")
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
      expect(input.value).toBe("amor");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("q=amor"),
        expect.anything()
      );
      expect(input.getAttribute("aria-expanded")).toBe("false");
    });

    test("Escape closes suggestions and resets aria-expanded", () => {
      const el = createDictSearch();
      const input = el.querySelector<HTMLInputElement>("input.input")!;

      el.chunkCache.set("am", {
        "L&S": ["amo"],
      });
      input.value = "amo";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      expect(input.getAttribute("aria-expanded")).toBe("true");

      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );

      expect(input.getAttribute("aria-expanded")).toBe("false");
    });

    test("removing dict search element tears down combobox attributes from input", () => {
      const el = createDictSearch();
      const input = el.querySelector<HTMLInputElement>("input.input")!;

      expect(input.hasAttribute("role")).toBe(true);
      expect(input.hasAttribute("aria-controls")).toBe(true);

      el.remove();

      expect(input.hasAttribute("role")).toBe(false);
      expect(input.hasAttribute("aria-controls")).toBe(false);
      expect(input.hasAttribute("aria-expanded")).toBe(false);
      expect(input.hasAttribute("aria-autocomplete")).toBe(false);
    });
  });
});
