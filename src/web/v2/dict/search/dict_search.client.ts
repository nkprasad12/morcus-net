import {
  BaseElement,
  closeActiveSectionUI,
  extractSelectedWord,
  fetchAndSwapPartial,
  isShortcutBlocked,
  KeyedFetchCache,
  registerElement,
  replaceWithHtml,
  setHtml,
  type QueryParamSync,
} from "@/web/v2/core/index.client";
import { readRenderedDictState } from "@/web/v2/dict/settings/dict_preferences.client";
import { trimRawQuery } from "@/common/text_cleaning";
import type { DictChunksResponse } from "@/web/v2/dict/search/dict_completions.common";
import { DictAutocompleteController } from "@/web/v2/dict/search/dict_autocomplete.client";
import { dictPageTitleForUrl } from "@/web/v2/dict/dict_title.common";
import { buildWelcomeMessage } from "@/web/v2/dict/landing/dict_landing.common";
import {
  DEFAULT_DICT_BITMASK,
  DEFAULT_DICT_KEYS,
} from "@/web/v2/dict/settings/dict_bitmask.common";
import {
  applyDictSearch,
  applyUnscopedDictSearch,
  dictUrlBuilder,
} from "@/web/v2/dict/search/dict_params.common";
import type { DictSettingsCommit } from "@/web/v2/dict/settings/dict_settings.client";
import {
  bindEntryResultInteractions,
  enhanceEntryWords,
} from "@/web/v2/dict/entry/entry_links.client";
import {
  computeActiveLanguages,
  renderLangChipsHtml,
  renderInflectChipHtml,
} from "@/web/v2/dict/search/search_bar.common";

const SEARCH_FORM = "form.search-form";

/**
 * Progressively enhanced dictionary search component using Light DOM.
 *
 * Without JS:
 * - The browser natively renders the inner server-rendered <form> and <output id="dict-results">.
 * - Submitting the form issues a standard HTTP GET /dicts?q=... request.
 *
 * With JS:
 * - Intercepts form submit via hijackForm.
 * - Delegates live input autocomplete to `DictAutocompleteController` (which owns the
 *   independent "completions" supersession lane so typing and result fetches never cancel each other).
 * - Uses syncQueryParam for seamless browser back/forward and title sync.
 * - Performs smooth AJAX partial swaps via fetchAndSwapPartial without full page reloads.
 * - Delegates entry word tokenization, hover linkification, and result clicks to `entry_links.client.ts`.
 */
export class MorcusDictSearch extends BaseElement<"results" | "words"> {
  readonly #autocomplete = this.addController(
    new DictAutocompleteController(this, {
      getActiveDictKeys: () => this.#activeDictKeys,
      onSelectSuggestion: (word) => this.#chooseSuggestion(word, true),
    })
  );

  #inputElement: HTMLInputElement | null = null;
  #resultsElement: HTMLElement | null = null;
  #router: QueryParamSync | null = null;

  #activeDictBitmask: string = DEFAULT_DICT_BITMASK;
  #activeDictKeys: string[] = [...DEFAULT_DICT_KEYS];
  #isInflected: boolean = true;

  public get chunkCache(): KeyedFetchCache<DictChunksResponse> {
    return this.#autocomplete.chunkCache;
  }

  // Read in more than one place; a getter re-queries rather than caches.
  get #searchForm() {
    return this.scope.$<HTMLFormElement>(SEARCH_FORM);
  }

  protected override onConnect() {
    this.#initActiveSettings();

    this.#router = this.syncQueryParam("q", {
      onChange: (q) => {
        if (this.#inputElement) {
          this.#inputElement.value = q;
        }
        this.#syncUrlParams({
          d: this.#activeDictBitmask,
          o: this.#isInflected ? "1" : "0",
        });
        void this.#fetchResults(q);
      },
      title: (_q, url) => dictPageTitleForUrl(url),
    });

    this.#enhanceExistingMarkup();
    this.scope.use(closeActiveSectionUI);
  }

  /**
   * Adopts the dictionary state the server resolved and rendered onto the form. The client never
   * re-resolves it: the server has already read every durable store (see `docs/PREFERENCES.md`).
   */
  #initActiveSettings() {
    const state = readRenderedDictState(this.#searchForm);
    this.#isInflected = state.isInflected;
    this.#activeDictKeys = state.dictKeys;
    // The bitmask is what we send to the server and write back to the URL, so it must never drift
    // from activeDictKeys.
    this.#activeDictBitmask = state.bitmask;
  }

  #enhanceExistingMarkup() {
    this.#inputElement = this.scope.$<HTMLInputElement>("input.input");
    this.#resultsElement = this.scope.$<HTMLElement>("#dict-results");

    this.hijackForm(SEARCH_FORM, ({ q }) => {
      this.#autocomplete.clear();
      const cleaned = trimRawQuery(q || "");
      if (cleaned) {
        void this.#searchQuery(cleaned, true);
      }
    });

    if (this.#inputElement) {
      this.scope.listen(window, "keydown", this.#handleWindowKeydown);
    }

    if (this.#resultsElement) {
      bindEntryResultInteractions(this.scope, this.#resultsElement, {
        getWordHref: (word) => this.#wordHref(word),
        onSelectWord: (word) => this.#chooseSuggestion(word),
      });
    }

    // The settings dialog commits once, when it closes, and only if something changed.
    this.scope.listen<DictSettingsCommit>(this, "dict-settings-commit", (e) => {
      if (e.detail) {
        this.#applySettingsCommit(e.detail);
      }
    });

    // The input is usable before upgrade, so its live value may be text the
    // user typed rather than the query the server rendered results for. The
    // server's value is `defaultValue` (the `value` attribute). When the user
    // has already typed, `DictAutocompleteController` starts autocomplete and
    // we skip initial scroll/autofocus here.
    const renderedQuery = this.#inputElement?.defaultValue.trim() ?? "";
    const typedBeforeUpgrade =
      this.#inputElement !== null &&
      this.#inputElement.value.trim() !== renderedQuery;
    const hasHash = Boolean(window.location.hash);
    const navEntry = performance.getEntriesByType?.("navigation")?.[0];
    const isBackForward =
      typeof PerformanceNavigationTiming !== "undefined" &&
      navEntry instanceof PerformanceNavigationTiming &&
      navEntry.type === "back_forward";

    const currentParams = new URLSearchParams(window.location.search);
    const isEmbedded = currentParams.get("embedded") === "1";

    if (
      !typedBeforeUpgrade &&
      renderedQuery &&
      !hasHash &&
      !isBackForward &&
      window.scrollY === 0 &&
      this.#resultsElement
    ) {
      this.scope.rAF(() => {
        if (window.scrollY === 0) {
          this.#scrollToResults("instant");
        }
      });
    } else if (
      !typedBeforeUpgrade &&
      !isEmbedded &&
      !renderedQuery &&
      this.#inputElement &&
      document.activeElement === document.body &&
      // A reader who has scrolled down the landing page shouldn't be
      // yanked back up (or get a keyboard popped up on mobile).
      window.scrollY === 0
    ) {
      this.#inputElement.focus({ preventScroll: true });
    }

    this.#enhanceWordsAfterPaint();
  }

  /**
   * Tokenizes the results into word spans in a task of its own, after the
   * next paint, so the results (and the scroll to them) appear first. On a
   * long entry tokenizing takes 100+ ms on desktop and most of a second on a
   * phone. Until it runs the words are plain text, exactly as before the
   * component upgraded. A newer call supersedes a pending one.
   *
   * Keep the task to tokenizing alone: a layout read after it (a `scrollY`,
   * a `getBoundingClientRect`) would force the style and layout of every new
   * span synchronously, instead of leaving it to the next frame.
   */
  #enhanceWordsAfterPaint() {
    const signal = this.scope.latest("words");
    this.scope.rAF(() => {
      this.scope.timeout(() => {
        if (!signal.aborted) enhanceEntryWords(this.#resultsElement);
      }, 0);
    });
  }

  /** Adopts committed dictionary settings: form, URL, tray, landing page, then one fetch. */
  #applySettingsCommit(commit: DictSettingsCommit) {
    this.#activeDictKeys = commit.dictKeys;
    this.#activeDictBitmask = commit.bitmask;
    this.#isInflected = commit.isInflected;
    const o = commit.isInflected ? "1" : "0";

    // Searches keep what's on screen, so the search form carries the new state.
    const form = this.#searchForm;
    if (form) {
      form.dataset.d = commit.bitmask;
      form.dataset.o = o;
    }
    const hiddenD = form?.querySelector<HTMLInputElement>('input[name="d"]');
    const hiddenO = form?.querySelector<HTMLInputElement>('input[name="o"]');
    if (hiddenD) hiddenD.value = commit.bitmask;
    if (hiddenO) hiddenO.value = o;
    // Keeps `lang`: the new `d=` is still narrowed to it (the dialog showed only its dictionaries).
    this.#syncUrlParams({ d: commit.bitmask, o });

    const langChipsContainer = this.scope.$<HTMLElement>(".lang-chips");
    if (langChipsContainer) {
      const activeLangs = computeActiveLanguages(commit.dictKeys);
      setHtml(langChipsContainer, renderLangChipsHtml(activeLangs));
    }
    const inflectChip = this.scope.$<HTMLElement>(".inflect-chip");
    if (inflectChip) {
      replaceWithHtml(inflectChip, renderInflectChipHtml(commit.isInflected));
    }

    const welcomeEl = this.scope.$<HTMLElement>("#landing-welcome");
    if (welcomeEl) {
      welcomeEl.textContent = buildWelcomeMessage(
        commit.dictKeys,
        commit.isInflected
      );
    }

    // Dictionary list badges on the landing page.
    const activeSet = new Set(commit.dictKeys.map((k) => k.toUpperCase()));
    for (const item of this.scope.$$<HTMLElement>(".dict-list-item")) {
      const key = item.dataset.dictKey?.toUpperCase();
      if (!key) continue;
      const isEnabled = activeSet.has(key);
      item.classList.toggle("dict-enabled", isEnabled);
      item.classList.toggle("dict-disabled", !isEnabled);
      const badge = item.querySelector(".lexicon-badge");
      if (badge) {
        badge.classList.toggle("dict-enabled", isEnabled);
        badge.classList.toggle("dict-disabled", !isEnabled);
      }
    }

    const currentQuery = this.#inputElement?.value.trim() ?? "";
    if (!currentQuery) return;
    void this.#fetchResults(currentQuery);
    this.#autocomplete.refreshForDictChange(currentQuery);
  }

  #scrollToResults(behavior: ScrollBehavior = "instant") {
    if (!this.#resultsElement) return;
    if (typeof this.#resultsElement.scrollIntoView === "function") {
      this.#resultsElement.scrollIntoView({ behavior, block: "start" });
    }
  }

  #syncUrlParams(updates: { d?: string; o?: string }) {
    const url = new URL(window.location.href);
    if (updates.d !== undefined) {
      if (updates.d) {
        url.searchParams.set("d", updates.d);
        url.searchParams.delete("dict");
        url.searchParams.delete("in");
      } else {
        url.searchParams.delete("d");
      }
    }
    if (updates.o !== undefined) {
      url.searchParams.set("o", updates.o);
    }
    url.hash = "";
    this.#router?.replaceUrl(url);
  }

  readonly #handleWindowKeydown = (e: KeyboardEvent) => {
    if (e.key !== "/" || isShortcutBlocked(e) || !this.#inputElement) return;
    // Global `/` shortcut focuses the dictionary search box and pre-fills from selection
    e.preventDefault();
    const selectedWord = extractSelectedWord();
    if (selectedWord) {
      this.#inputElement.value = selectedWord;
    }
    this.#autocomplete.clear();
    this.#inputElement.focus();
    this.#inputElement.select();
  };

  /**
   * `typed`: the user typed (or picked from autocomplete) the query, rather than following a word
   * in the results. In a `lang=` view (the reader's dictionary) a typed word may be English or
   * German, so it leaves the scope; a followed word is Latin, so it stays.
   */
  #chooseSuggestion(suggestion: string, typed = false) {
    const clean = trimRawQuery(suggestion);
    if (this.#inputElement) {
      this.#inputElement.value = clean;
    }
    this.#autocomplete.clear();
    void this.#searchQuery(clean, typed);
  }

  async #searchQuery(query: string, typed = false) {
    const cleanQuery = trimRawQuery(query);
    if (!cleanQuery) return;
    if (this.#inputElement) {
      this.#inputElement.value = cleanQuery;
      this.#inputElement.blur();
    }

    const url = new URL(window.location.href);
    // A search replaces whatever was on screen, so it must not stay under
    // /dicts/id/:id. That path renders the right results now, but on reload
    // or when shared it re-runs the ID lookup and drops ?q entirely.
    if (url.pathname.startsWith("/dicts/id/")) {
      url.pathname = "/dicts";
    }

    if (typed && url.searchParams.has("lang")) {
      // Leaving the scope changes the dictionaries, so the tray, the search form's `d` and the
      // settings dialog's checkboxes all change too. A full load gets them from the server, which
      // owns that resolution, rather than re-deriving it here.
      applyUnscopedDictSearch(url.searchParams, {
        q: cleanQuery,
        inflected: this.#isInflected,
      });
      window.location.assign(url.pathname + url.search);
      return;
    }

    applyDictSearch(url.searchParams, {
      q: cleanQuery,
      d: this.#activeDictBitmask,
      inflected: this.#isInflected,
    });

    url.hash = "";
    this.#router?.pushUrl(url, { state: { q: cleanQuery } });
    await this.#fetchResults(cleanQuery);
    this.scope.rAF(() => {
      this.#scrollToResults("smooth");
    });
  }

  /**
   * Fetches and swaps in results for `query`.
   *
   * Does not reject: `fetchAndSwapPartial` reports failure by return value rather than
   * by throwing. Callers in sync event handlers can therefore `void` this safely — if
   * that ever stops being true, they need real rejection handling instead.
   */
  async #fetchResults(query: string) {
    if (!this.#resultsElement) return;
    closeActiveSectionUI();
    const currentParams = new URLSearchParams(window.location.search);
    const isEmbedded = currentParams.get("embedded") === "1";
    const langParam = currentParams.get("lang");

    const fetchParams = new URLSearchParams();
    fetchParams.set("q", query);
    fetchParams.set("format", "partial");
    if (isEmbedded) fetchParams.set("embedded", "1");
    if (langParam) fetchParams.set("lang", langParam);
    fetchParams.set("d", this.#activeDictBitmask);
    fetchParams.set("o", this.#isInflected ? "1" : "0");

    const url = `/dicts?${fetchParams.toString()}`;
    const success = await fetchAndSwapPartial(this.#resultsElement, url, {
      signal: this.scope.latest("results"),
      errorMessage: "Error loading results.",
      loadingOpacity: 0.5,
    });
    if (success) {
      this.#enhanceWordsAfterPaint();
    }
  }

  /**
   * Builds the lookup URL a word links to, for the current dictionary selection
   * and inflection setting and this page's `lang` / `embedded` scope.
   */
  #wordHref(word: string): string {
    const searchParams = new URLSearchParams(window.location.search);
    return dictUrlBuilder({
      d: this.#activeDictBitmask,
      inflected: this.#isInflected,
      lang: searchParams.get("lang"),
      embedded: searchParams.get("embedded"),
    })(word);
  }
}

registerElement("morcus-dict-search", MorcusDictSearch);

declare module "@/web/v2/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-search": MorcusDictSearch;
  }
}
