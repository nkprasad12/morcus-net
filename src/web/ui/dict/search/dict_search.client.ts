import {
  BaseElement,
  closeActiveSectionUI,
  extractSelectedWord,
  fetchAndSwapPartial,
  isPlainLeftClick,
  isShortcutBlocked,
  KeyedFetchCache,
  prefersReducedMotion,
  registerElement,
  replaceWithHtml,
  scrollToElement,
  setHtml,
  type QueryParamSync,
} from "@/web/ui/core/index.client";
import { readRenderedDictState } from "@/web/ui/dict/settings/dict_preferences.client";
import type { DictChunksResponse } from "@/web/ui/dict/search/dict_completions.common";
import { DictAutocompleteController } from "@/web/ui/dict/search/dict_autocomplete.client";
import { dictPageTitleForUrl } from "@/web/ui/dict/dict_title.common";
import { buildWelcomeMessage } from "@/web/ui/dict/landing/dict_landing.common";
import {
  DEFAULT_DICT_BITMASK,
  DEFAULT_DICT_KEYS,
} from "@/web/ui/dict/settings/dict_bitmask.common";
import { ownSettingsHref } from "@/web/ui/dict/settings/dict_settings_href.common";
import {
  applyDictSearch,
  applyUnscopedDictSearch,
  cleanDictQuery,
  dictUrlBuilder,
  FOCUS_PARAM,
  parseFocusLang,
} from "@/web/ui/dict/search/dict_params.common";
import type { DictLang } from "@/common/dictionaries/dictionaries";
import type { DictSettingsCommit } from "@/web/ui/dict/settings/dict_settings.client";
import {
  bindEntryResultInteractions,
  enhanceEntryWords,
} from "@/web/ui/dict/entry/entry_links.client";
import {
  computeActiveLanguages,
  DICT_SETTINGS_DIALOG_ID,
  renderLangChipsHtml,
  renderInflectChipHtml,
} from "@/web/ui/dict/search/search_bar.common";
import type {
  EmbeddedDictLookupRequest,
  EmbeddedDictLookupResult,
} from "@/web/ui/dict/search/dict_frame_host.client";

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
      onSelectSuggestion: (word, lang) =>
        void this.#searchQuery(word, true, lang),
    })
  );

  #inputElement: HTMLInputElement | null = null;
  #resultsElement: HTMLElement | null = null;
  #router: QueryParamSync | null = null;

  #activeDictBitmask: string = DEFAULT_DICT_BITMASK;
  #activeDictKeys: string[] = [...DEFAULT_DICT_KEYS];
  #isInflected: boolean = true;
  #shownQuery: string = "";
  #leaving: boolean = false;

  public get chunkCache(): KeyedFetchCache<DictChunksResponse> {
    return this.#autocomplete.chunkCache;
  }

  /**
   * Cross-bundle API: called by `lookupInDictFrame` (`dict_frame_host.client.ts`,
   * bundled in `common.js`) from a host page (`reader.js`, `macronizer.js`).
   *
   * Because the host page's chunk and this iframe's `dict.js` load independently
   * and can come from different builds (e.g. across a deploy), the signature and
   * return values are append-only, and arguments must be plain primitive values
   * so the call safely crosses realms.
   *
   * `"declined"` returns immediately without changing URL, DOM, or in-flight
   * state so the host can fall back to a full iframe navigation.
   */
  public lookupEmbeddedWord(
    request: EmbeddedDictLookupRequest
  ): EmbeddedDictLookupResult {
    const loc = window.location;
    const params = new URLSearchParams(loc.search);
    const clean = cleanDictQuery(request.q);
    if (
      !clean ||
      this.#leaving ||
      loc.pathname !== "/dicts" ||
      params.get("embedded") !== "1" ||
      params.get("lang") !== request.lang ||
      this.#isInflected !== request.inflected ||
      this.querySelector(`dialog#${DICT_SETTINGS_DIALOG_ID}[open]`) !== null
    ) {
      return "declined";
    }
    if (clean === this.#shownQuery) {
      return "unchanged";
    }
    void this.#searchQuery(clean);
    return "swapped";
  }

  // Read in more than one place; a getter re-queries rather than caches.
  get #searchForm() {
    return this.scope.$<HTMLFormElement>(SEARCH_FORM);
  }

  protected override onConnect() {
    this.#initActiveSettings();

    this.#router = this.syncQueryParam("q", {
      onChange: (q) => void this.#restoreFromUrl(q),
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
      void this.#searchQuery(q || "", true);
    });

    if (this.#inputElement) {
      this.scope.listen(window, "keydown", this.#handleWindowKeydown);
    }

    if (this.#resultsElement) {
      bindEntryResultInteractions(this.scope, this.#resultsElement, {
        getWordHref: (word) => this.#wordHref(word),
        onSelectWord: (word) => void this.#searchQuery(word),
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

    this.#leaving = false;
    this.#shownQuery =
      window.location.pathname === "/dicts"
        ? cleanDictQuery(currentParams.get("q") ?? "")
        : "";

    // Assumes link-intercepting click handlers live on descendant elements or
    // `document` (e.g. `entry_links.client.ts`, `anchor_scroll.client.ts`), so
    // they have already called `preventDefault()` before this `window` bubble
    // listener runs. Do not register a link-intercepting click listener on
    // `window` after `MorcusDictSearch` connects.
    this.scope.listen(window, "click", (e) => {
      if (
        e.defaultPrevented ||
        !isPlainLeftClick(e) ||
        !(e.target instanceof Element)
      ) {
        return;
      }
      const link = e.target.closest<HTMLAnchorElement>("a[href]");
      if (
        !link ||
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download") ||
        (link.protocol !== "http:" && link.protocol !== "https:")
      ) {
        return;
      }
      const rawHref = link.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;
      const loc = window.location;
      if (
        link.origin === loc.origin &&
        link.pathname === loc.pathname &&
        link.search === loc.search &&
        link.hash !== ""
      ) {
        return;
      }
      this.#leaving = true;
    });
    this.scope.listen(window, "pageshow", (e: Event) => {
      if ("persisted" in e && e.persisted) {
        this.#leaving = false;
      }
    });

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

    const currentQuery = cleanDictQuery(this.#inputElement?.value ?? "");
    const renderedQ = cleanDictQuery(
      new URLSearchParams(window.location.search).get("q") ?? ""
    );
    const queryChanged = currentQuery !== "" && currentQuery !== renderedQ;
    if (currentQuery) this.#syncSettingsQ(currentQuery);
    // Keeps `lang`: the new `d=` is still narrowed to it (the dialog showed only its dictionaries).
    this.#syncUrlParams(
      commit.bitmask,
      o,
      queryChanged ? currentQuery : undefined
    );

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
    const activeSet = new Set(commit.dictKeys);
    for (const item of this.scope.$$<HTMLElement>(".dict-list-item")) {
      const key = item.dataset.dictKey;
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

    if (!currentQuery) return;
    void this.#fetchResults(currentQuery);
    this.#autocomplete.refreshForDictChange(currentQuery);
  }

  #scrollToResults(behavior: ScrollBehavior = "instant") {
    if (!this.#resultsElement) return;
    scrollToElement(this.#resultsElement, behavior);
  }

  /** Back/Forward: show what the revisited URL names. Never writes history. */
  async #restoreFromUrl(q: string) {
    const cleanQ = cleanDictQuery(q);
    this.#autocomplete.clear();
    if (this.#inputElement) {
      this.#inputElement.value = cleanQ;
    }
    this.#syncSettingsQ(cleanQ);
    this.#syncGuestReturn();
    const ok = await this.#fetchResults(cleanQ, {
      path: window.location.pathname,
    });
    if (ok) {
      this.#scrollToHashOrResults();
    }
  }

  #scrollToHashOrResults() {
    if (!window.location.hash) return;
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // Keep raw hash slice if malformed percent-encoding.
    }
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    this.scope.rAF(() => {
      scrollToElement(target, "instant");
    });
  }

  /** Writes committed settings to the URL; a new `q` (non-empty) also gets a history entry. */
  #syncUrlParams(d: string, o: string, q?: string) {
    const url = new URL(window.location.href);
    if (q) {
      if (url.pathname.startsWith("/dicts/id/")) {
        url.pathname = "/dicts";
      }
      url.searchParams.set("q", q);
      // `focus` belongs to the suggestion pick that set the old `q`.
      url.searchParams.delete(FOCUS_PARAM);
    }
    url.searchParams.set("d", d);
    url.searchParams.delete("dict");
    url.searchParams.delete("in");
    url.searchParams.set("o", o);
    this.#commitUrl(url, q);
  }

  /**
   * Commits a search URL: with a `q`, pushes it with `{ q }` state (replaces in embedded views,
   * which must not grow the host's history); without one, replaces it with no state.
   */
  #commitUrl(url: URL, q?: string) {
    url.hash = "";
    const opts = q ? { state: { q } } : undefined;
    if (q && url.searchParams.get("embedded") !== "1") {
      this.#router?.pushUrl(url, opts);
    } else {
      this.#router?.replaceUrl(url, opts);
    }
    this.#syncGuestReturn(url);
  }

  #syncSettingsQ(q: string) {
    const settingsQ = this.scope.$<HTMLInputElement>(
      'form.dict-settings-form input[name="q"]'
    );
    if (settingsQ) settingsQ.value = q;
  }

  #syncGuestReturn(url: URL = new URL(window.location.href)) {
    const links = this.scope.$$<HTMLAnchorElement>("a.guest-return");
    if (links.length === 0) return;
    const href = ownSettingsHref(url.pathname + url.search, {
      keepInflection: url.searchParams.has("lang"),
    });
    for (const link of links) {
      link.href = href;
    }
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
   *
   * `focus`: the picked autocomplete suggestion's source language (see `FOCUS_PARAM`). Only a
   * suggestion pick passes it; every other search drops it.
   */
  async #searchQuery(query: string, typed = false, focus?: DictLang) {
    this.#autocomplete.clear();
    const cleanQuery = cleanDictQuery(query);
    if (!cleanQuery) return;
    if (this.#inputElement) {
      this.#inputElement.value = cleanQuery;
      this.#inputElement.blur();
    }
    // Blur again after the frame, so the pointer events of a picked suggestion (on mobile) can't
    // re-focus the input.
    this.scope.rAF(() => {
      this.#inputElement?.blur();
    });

    const url = new URL(window.location.href);
    const isEmbedded = url.searchParams.get("embedded") === "1";
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
        focus,
      });
      this.#leaving = true;
      if (
        isEmbedded &&
        "replace" in window.location &&
        typeof window.location.replace === "function"
      ) {
        window.location.replace(url.pathname + url.search);
      } else {
        window.location.assign(url.pathname + url.search);
      }
      return;
    }

    applyDictSearch(url.searchParams, {
      q: cleanQuery,
      d: this.#activeDictBitmask,
      inflected: this.#isInflected,
      focus,
    });

    this.#commitUrl(url, cleanQuery);
    this.#syncSettingsQ(cleanQuery);
    if (!typed) {
      this.#scrollToResults("instant");
    }
    await this.#fetchResults(cleanQuery);
    this.scope.rAF(() => {
      this.#scrollToResults(
        !typed || prefersReducedMotion() ? "instant" : "smooth"
      );
    });
  }

  /**
   * Fetches and swaps in results for `query`.
   *
   * Does not reject: `fetchAndSwapPartial` reports failure by return value rather than
   * by throwing. Callers in sync event handlers can therefore `void` this safely — if
   * that ever stops being true, they need real rejection handling instead.
   */
  async #fetchResults(
    query: string,
    opts?: { path?: string }
  ): Promise<boolean> {
    if (!this.#resultsElement) return false;
    closeActiveSectionUI();
    const currentParams = new URLSearchParams(window.location.search);
    const isEmbedded = currentParams.get("embedded") === "1";
    const langParam = currentParams.get("lang");

    const idMatch = opts?.path?.match(/^\/dicts\/id\/([^/]+)$/);
    const base = idMatch && opts?.path ? opts.path : "/dicts";

    const fetchParams = new URLSearchParams();
    if (!idMatch) {
      fetchParams.set("q", query);
    }
    fetchParams.set("format", "partial");
    if (isEmbedded) fetchParams.set("embedded", "1");
    if (langParam) fetchParams.set("lang", langParam);
    // The page URL already carries the search's `focus` (or none): the results follow it.
    const focus = parseFocusLang(currentParams.get(FOCUS_PARAM));
    if (focus && !idMatch) fetchParams.set(FOCUS_PARAM, focus);
    fetchParams.set("d", this.#activeDictBitmask);
    fetchParams.set("o", this.#isInflected ? "1" : "0");

    const url = `${base}?${fetchParams.toString()}`;
    const signal = this.scope.latest("results");
    this.#shownQuery = query;
    const success = await fetchAndSwapPartial(this.#resultsElement, url, {
      signal,
      errorMessage: "Error loading results.",
      loadingOpacity: 0.5,
      versioned: true,
    });
    if (success) {
      this.#syncInflectedHint();
      this.#enhanceWordsAfterPaint();
    } else if (!signal.aborted) {
      this.#shownQuery = "";
    }
    return success;
  }

  /**
   * Partials never read the cookie, so the server omits `save=1` from the
   * zero-results "Enable inflected search" link on every partial. Restore it
   * after the swap when the page is neither scoped nor a guest view.
   */
  #syncInflectedHint() {
    const link =
      this.#resultsElement?.querySelector<HTMLAnchorElement>(
        ".inflected-hint a"
      );
    if (!link) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("embedded") === "1" || params.has("lang")) return;
    if (this.scope.$("a.guest-return") !== null) return;
    const url = new URL(link.href, window.location.href);
    url.searchParams.set("save", "1");
    link.href = `${url.pathname}${url.search}${url.hash}`;
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

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-search": MorcusDictSearch;
  }
}
