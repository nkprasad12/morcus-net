import {
  BaseElement,
  closeActiveSectionUI,
  createWordLink,
  fetchAndSwapPartial,
  isPlainLeftClick,
  queryUpgraded,
  registerElement,
  replaceWithHtml,
  setHtml,
  tokenizeTargets,
} from "@/web/v2/core/index.client";
import { readRenderedDictState } from "@/web/v2/dict/dict_preferences.client";
import { trimRawQuery } from "@/common/text_cleaning";
import {
  cleanCompletionQuery,
  type CompletionItem,
} from "@/web/v2/dict/dict_completions.common";
import { filterAndClusterDictionaryChunks } from "@/web/v2/dict/dict_clustering.common";
import { DictChunkCache } from "@/web/v2/dict/dict_chunk_cache.client";
import { buildWelcomeMessage } from "@/web/v2/dict/dict_landing.common";
import {
  DEFAULT_DICT_BITMASK,
  DEFAULT_DICT_KEYS,
} from "@/web/v2/dict/dict_bitmask.common";
import {
  applyDictSearch,
  dictUrlBuilder,
} from "@/web/v2/dict/dict_params.common";
import type { DictSettingsCommit } from "@/web/v2/dict/dict_settings.client";
import { handleDictPermalinkClick } from "@/web/v2/dict/dict_permalink.client";
import {
  computeActiveLanguages,
  renderLangChipsHtml,
  renderInflectChipHtml,
} from "@/web/v2/dict/search_bar.common";

const SEARCH_FORM = "form.search-form";

/**
 * Classes of elements whose text is not split into lookup links: headwords,
 * emphasis, hover notes, sense bullets, anchors and links. Matched as
 * substrings of `className` (so `lsOrth` also covers `lsOrthSub` etc.).
 */
const NO_WORD_LINK_CLASSES =
  /lsOrth|lsEmph|lsHover|lsSenseBullet|section-anchor|toc|dLink/;

/**
 * Progressively enhanced dictionary search component using Light DOM.
 *
 * Without JS:
 * - The browser natively renders the inner server-rendered <form> and <output id="dict-results">.
 * - Submitting the form issues a standard HTTP GET /v2/dicts?q=... request.
 *
 * With JS:
 * - Intercepts form submit via hijackForm.
 * - Debounces input typing to fetch autocomplete suggestions from /v2/api/completions.
 * - Cancels stale requests via two independent supersession lanes: "completions"
 *   (typing) and "results" (submit). These run concurrently and must not cancel
 *   each other, which is why they are separate lanes rather than one controller.
 * - Uses syncQueryParam for seamless browser back/forward and title sync.
 * - Performs smooth AJAX partial swaps via fetchAndSwapPartial without full page reloads.
 */
export class MorcusDictSearch extends BaseElement<
  "completions" | "results" | "words"
> {
  public readonly chunkCache: DictChunkCache = new DictChunkCache();

  private inputElement: HTMLInputElement | null = null;
  private resultsElement: HTMLElement | null = null;
  /** The suggestions host, for events and dismissal (works before it upgrades). */
  private suggestionsEl: HTMLElement | null = null;

  private activeDictBitmask: string = DEFAULT_DICT_BITMASK;
  private activeDictKeys: string[] = [...DEFAULT_DICT_KEYS];
  private isInflected: boolean = true;

  private renderCachedCompletions(prefix: string, query: string) {
    const chunks = this.chunkCache.getChunks(prefix);
    if (!chunks) {
      this.clearSuggestions();
      return;
    }
    const items = filterAndClusterDictionaryChunks(
      chunks,
      this.activeDictKeys,
      query,
      25
    );
    this.showSuggestions(items);
  }

  // Deliberately takes no query: by the time the debounce fires the one the
  // caller had is up to 180ms stale, so the live input value is re-read below.
  private readonly debouncedFetchPrefixChunk = this.debounce(
    (prefix: string) => {
      const signal = this.scope.latest("completions");
      this.chunkCache
        .loadPrefix(prefix)
        .then(() => {
          if (signal.aborted) return;
          if (document.activeElement !== this.inputElement) return;
          const currentRaw = this.inputElement?.value ?? "";
          const currentClean = cleanCompletionQuery(currentRaw).query;
          if (!currentClean.toLowerCase().startsWith(prefix)) return;

          this.renderCachedCompletions(prefix, currentClean);
        })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name !== "AbortError") {
            console.error("Failed to load completions chunk", e);
          }
        });
    },
    180
  );

  private readonly debouncedFetchSuffixCompletions = this.debounce(
    (query: string) => {
      const signal = this.scope.latest("completions");
      const currentParams = new URLSearchParams(window.location.search);
      const fetchParams = new URLSearchParams();
      fetchParams.set("q", query);
      fetchParams.set("d", this.activeDictBitmask);

      const langParam = currentParams.get("lang");
      if (langParam) fetchParams.set("lang", langParam);

      fetch(`/v2/api/completions?${fetchParams.toString()}`, { signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: CompletionItem[]) => {
          if (signal.aborted) return;
          if (document.activeElement !== this.inputElement) return;
          this.showSuggestions(Array.isArray(data) ? data : []);
        })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name !== "AbortError") {
            console.error("Failed to fetch suffix suggestions", e);
          }
        });
    },
    180
  );

  // Read in more than one place; a getter re-queries rather than caches.
  private get searchForm() {
    return this.scope.$<HTMLFormElement>(SEARCH_FORM);
  }

  protected override onConnect() {
    this.initActiveSettings();

    this.syncQueryParam("q", {
      onChange: (q) => {
        if (this.inputElement) {
          this.inputElement.value = q;
        }
        this.syncUrlParams({
          d: this.activeDictBitmask,
          o: this.isInflected ? "1" : "0",
        });
        void this.fetchResults(q);
      },
      title: (q) =>
        q ? `${q} - Morcus Dictionary` : "Morcus Dictionary (UI V2)",
    });

    this.enhanceExistingMarkup();
    this.scope.use(closeActiveSectionUI);
  }

  /**
   * Adopts the dictionary state the server resolved and rendered onto the form. The client never
   * re-resolves it: the server has already read every durable store (see `docs/PREFERENCES.md`).
   */
  private initActiveSettings() {
    const state = readRenderedDictState(this.searchForm);
    this.isInflected = state.isInflected;
    this.activeDictKeys = state.dictKeys;
    // The bitmask is what we send to the server and write back to the URL, so it must never drift
    // from activeDictKeys.
    this.activeDictBitmask = state.bitmask;
  }

  private enhanceExistingMarkup() {
    this.inputElement = this.scope.$<HTMLInputElement>("input.input");
    this.resultsElement = this.scope.$<HTMLElement>("#dict-results");

    // Adopt the server-rendered suggestions host (see `renderDictSearchBar`).
    // Re-queried on every connect, so a re-attached element listens to the
    // child that is actually in its subtree.
    this.suggestionsEl = this.scope.$("morcus-dict-suggestions");
    if (this.suggestionsEl) {
      this.scope.listen(this.suggestionsEl, "suggestion-select", (e: Event) => {
        if (e instanceof CustomEvent) {
          const detail: unknown = e.detail;
          if (
            typeof detail === "object" &&
            detail !== null &&
            "word" in detail &&
            typeof detail.word === "string"
          ) {
            this.chooseSuggestion(detail.word);
          }
        }
      });
    }

    this.hijackForm(SEARCH_FORM, ({ q }) => {
      this.clearSuggestions();
      const cleaned = trimRawQuery(q || "");
      if (cleaned) {
        void this.searchQuery(cleaned);
      }
    });

    if (this.inputElement) {
      this.scope.listen(this.inputElement, "input", this.handleInput);
    }

    if (this.resultsElement) {
      this.scope.listen(this.resultsElement, "click", (e: MouseEvent) => {
        if (e.defaultPrevented || !(e.target instanceof Element)) return;

        if (!isPlainLeftClick(e)) {
          return;
        }

        if (handleDictPermalinkClick(e, e.target)) {
          return;
        }

        const wordEl = e.target.closest<HTMLElement>(".lat-word");
        if (wordEl) {
          // Word in our results; runs the lookup in place
          e.preventDefault();
          const word = wordEl.dataset.word || wordEl.textContent?.trim() || "";
          if (word) {
            this.chooseSuggestion(word);
          }
          return;
        }

        const dLinkEl = e.target.closest<HTMLElement>(".dLink");
        if (dLinkEl) {
          // Link in our results; runs the lookup in place
          e.preventDefault();
          const toWord =
            dLinkEl.getAttribute("to") ||
            dLinkEl.dataset.to ||
            (dLinkEl instanceof HTMLAnchorElement &&
              new URL(dLinkEl.href, window.location.origin).searchParams.get(
                "q"
              )) ||
            dLinkEl.textContent?.trim() ||
            "";
          if (toWord) {
            this.chooseSuggestion(toWord);
          }
        }
      });
    }

    // The settings dialog commits once, when it closes, and only if something changed.
    this.scope.listen<DictSettingsCommit>(this, "dict-settings-commit", (e) => {
      if (e.detail) {
        this.applySettingsCommit(e.detail);
      }
    });

    // The input is usable before upgrade, so its live value may be text the
    // user typed rather than the query the server rendered results for. The
    // server's value is `defaultValue` (the `value` attribute).
    const renderedQuery = this.inputElement?.defaultValue.trim() ?? "";
    const typedBeforeUpgrade =
      this.inputElement !== null &&
      this.inputElement.value.trim() !== renderedQuery;
    const hasHash = Boolean(window.location.hash);
    const navEntry = performance.getEntriesByType?.("navigation")?.[0];
    const isBackForward =
      typeof PerformanceNavigationTiming !== "undefined" &&
      navEntry instanceof PerformanceNavigationTiming &&
      navEntry.type === "back_forward";

    const currentParams = new URLSearchParams(window.location.search);
    const isEmbedded = currentParams.get("embedded") === "1";

    if (typedBeforeUpgrade) {
      // PH3: the user is mid-search; start autocomplete for what's already
      // typed (if they're still in the box), and don't scroll or refocus.
      if (document.activeElement === this.inputElement) {
        this.handleInput();
      }
    } else if (
      renderedQuery &&
      !hasHash &&
      !isBackForward &&
      window.scrollY === 0 &&
      this.resultsElement
    ) {
      this.scope.rAF(() => {
        if (window.scrollY === 0) {
          this.scrollToResults("instant");
        }
      });
    } else if (
      !isEmbedded &&
      !renderedQuery &&
      this.inputElement &&
      document.activeElement === document.body &&
      // PH9: a reader who has scrolled down the landing page shouldn't be
      // yanked back up (or get a keyboard popped up on mobile).
      window.scrollY === 0
    ) {
      this.inputElement.focus({ preventScroll: true });
    }

    this.enhanceWordsAfterPaint();
  }

  /**
   * Tokenizes the results into word links in a task of its own, after the
   * next paint, so the results (and the scroll to them) appear first. On a
   * long entry tokenizing takes 100+ ms on desktop and most of a second on a
   * phone. Until it runs the words are plain text, exactly as before the
   * component upgraded. A newer call supersedes a pending one.
   *
   * Keep the task to tokenizing alone: a layout read after it (a `scrollY`,
   * a `getBoundingClientRect`) would force the style and layout of every new
   * link synchronously, instead of leaving it to the next frame.
   */
  private enhanceWordsAfterPaint() {
    const signal = this.scope.latest("words");
    this.scope.rAF(() => {
      this.scope.timeout(() => {
        if (!signal.aborted) this.enhanceWords(this.resultsElement);
      }, 0);
    });
  }

  /** Adopts committed dictionary settings: form, URL, tray, landing page, then one fetch. */
  private applySettingsCommit(commit: DictSettingsCommit) {
    this.activeDictKeys = commit.dictKeys;
    this.activeDictBitmask = commit.bitmask;
    this.isInflected = commit.isInflected;
    const o = commit.isInflected ? "1" : "0";

    // Searches keep what's on screen, so the search form carries the new state.
    const form = this.searchForm;
    if (form) {
      form.dataset.d = commit.bitmask;
      form.dataset.o = o;
    }
    const hiddenD = form?.querySelector<HTMLInputElement>('input[name="d"]');
    const hiddenO = form?.querySelector<HTMLInputElement>('input[name="o"]');
    if (hiddenD) hiddenD.value = commit.bitmask;
    if (hiddenO) hiddenO.value = o;
    this.syncUrlParams({ d: commit.bitmask, o, dropLang: true });

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

    const currentQuery = this.inputElement?.value.trim() ?? "";
    if (!currentQuery) return;
    void this.fetchResults(currentQuery);

    // Re-cluster suggestions immediately if the active prefix is in the chunk cache.
    if (this.shownSuggestions.length > 0) {
      const { query: activeQ, isSuffix: activeSuffix } =
        cleanCompletionQuery(currentQuery);
      if (!activeSuffix && activeQ.length >= 2) {
        const prefix = activeQ.slice(0, 2).toLowerCase();
        if (this.chunkCache.hasPrefix(prefix)) {
          this.renderCachedCompletions(prefix, activeQ);
        }
      }
    }
  }

  private scrollToResults(behavior: ScrollBehavior = "instant") {
    if (!this.resultsElement) return;
    if (typeof this.resultsElement.scrollIntoView === "function") {
      this.resultsElement.scrollIntoView({ behavior, block: "start" });
    }
  }

  private syncUrlParams(updates: {
    d?: string;
    o?: string;
    dropLang?: boolean;
  }) {
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
    if (updates.dropLang) {
      url.searchParams.delete("lang");
    }
    // Writes our own d/o query params
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  private clearSuggestions() {
    this.debouncedFetchPrefixChunk.cancel();
    this.debouncedFetchSuffixCompletions.cancel();
    this.scope.cancel("completions");
    this.showSuggestions([]);
  }

  /**
   * The list's items live only in `<morcus-dict-suggestions>`: it closes
   * itself on blur and Escape, so a copy here would go stale and could
   * reopen it later (e.g. on a dictionary settings change).
   */
  private get shownSuggestions(): readonly CompletionItem[] {
    return queryUpgraded(this, "morcus-dict-suggestions")?.items ?? [];
  }

  private showSuggestions(items: readonly CompletionItem[]) {
    const suggestions = queryUpgraded(this, "morcus-dict-suggestions");
    if (suggestions) {
      suggestions.items = items;
    }
  }

  private readonly handleInput = () => {
    const raw = this.inputElement?.value ?? "";
    const { query, isSuffix } = cleanCompletionQuery(raw);
    if (query.length < 2) {
      this.clearSuggestions();
      return;
    }

    if (isSuffix) {
      this.debouncedFetchPrefixChunk.cancel();
      this.debouncedFetchSuffixCompletions(query);
      return;
    }

    this.debouncedFetchSuffixCompletions.cancel();
    const prefix = query.slice(0, 2).toLowerCase();
    if (this.chunkCache.hasPrefix(prefix)) {
      this.debouncedFetchPrefixChunk.cancel();
      this.renderCachedCompletions(prefix, query);
    } else {
      this.debouncedFetchPrefixChunk(prefix);
    }
  };

  private chooseSuggestion(suggestion: string) {
    const clean = trimRawQuery(suggestion);
    if (this.inputElement) {
      this.inputElement.value = clean;
    }
    this.clearSuggestions();
    void this.searchQuery(clean);
  }

  private async searchQuery(query: string) {
    const cleanQuery = trimRawQuery(query);
    if (!cleanQuery) return;
    if (this.inputElement) {
      this.inputElement.value = cleanQuery;
      this.inputElement.blur();
    }

    const url = new URL(window.location.href);
    // A search replaces whatever was on screen, so it must not stay under
    // /v2/dicts/id/:id. That path renders the right results now, but on reload
    // or when shared it re-runs the ID lookup and drops ?q entirely.
    if (url.pathname.startsWith("/v2/dicts/id/")) {
      url.pathname = "/v2/dicts";
    }
    applyDictSearch(url.searchParams, {
      q: cleanQuery,
      d: this.activeDictBitmask,
      inflected: this.isInflected,
    });

    const newSearchPath = url.pathname + url.search;
    // Pushes our own search URL, then fetches the results
    window.history.pushState({ q: cleanQuery }, "", newSearchPath);
    document.title = `${cleanQuery} - Morcus Dictionary`;
    await this.fetchResults(cleanQuery);
    this.scope.rAF(() => {
      this.scrollToResults("smooth");
    });
  }

  /**
   * Fetches and swaps in results for `query`.
   *
   * Does not reject: `fetchAndSwapPartial` reports failure by return value rather than
   * by throwing. Callers in sync event handlers can therefore `void` this safely — if
   * that ever stops being true, they need real rejection handling instead.
   */
  private async fetchResults(query: string) {
    if (!this.resultsElement) return;
    closeActiveSectionUI();
    const currentParams = new URLSearchParams(window.location.search);
    const isEmbedded = currentParams.get("embedded") === "1";
    const langParam = currentParams.get("lang");

    const fetchParams = new URLSearchParams();
    fetchParams.set("q", query);
    fetchParams.set("format", "partial");
    if (isEmbedded) fetchParams.set("embedded", "1");
    if (langParam) fetchParams.set("lang", langParam);
    fetchParams.set("d", this.activeDictBitmask);
    fetchParams.set("o", this.isInflected ? "1" : "0");

    const url = `/v2/dicts?${fetchParams.toString()}`;
    const success = await fetchAndSwapPartial(this.resultsElement, url, {
      signal: this.scope.latest("results"),
      errorMessage: "Error loading results.",
      loadingOpacity: 0.5,
    });
    if (success) {
      this.enhanceWordsAfterPaint();
    }
  }

  public enhanceWords(container: HTMLElement | null) {
    if (!container) return;

    // Hoisted out of `renderWord`: a long entry has thousands of words, so
    // anything done per word here shows up directly in mount time.
    const searchParams = new URLSearchParams(window.location.search);
    const hrefFor = dictUrlBuilder({
      d: this.activeDictBitmask,
      inflected: this.isInflected,
      lang: searchParams.get("lang"),
      embedded: searchParams.get("embedded"),
    });
    tokenizeTargets(container, {
      targetSelector: "[data-tokenize-target='true'], .entry-content",
      enhancedDatasetKey: "wordsEnhanced",
      isExcludedElement: (node) => {
        const cls = node.className;
        return typeof cls === "string" && NO_WORD_LINK_CLASSES.test(cls);
      },
      renderWord: (token, cleanWord) =>
        createWordLink(token, cleanWord, hrefFor(cleanWord)),
    });
  }
}

registerElement("morcus-dict-search", MorcusDictSearch);

declare module "@/web/v2/core/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-search": MorcusDictSearch;
  }
}
