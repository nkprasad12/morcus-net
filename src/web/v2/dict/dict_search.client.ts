import {
  BaseElement,
  bindDismissable,
  debounce,
  dictSettingsStore,
  inflectedSettingsStore,
  fetchAndSwapPartial,
  registerElement,
  replaceWithHtml,
  setHtml,
} from "@/web/v2/core/index.client";
import {
  processTokens,
  removeDiacritics,
  trimRawQuery,
} from "@/common/text_cleaning";
import {
  cleanCompletionQuery,
  type CompletionItem,
} from "@/web/v2/dict/dict_completions.common";
import { filterAndClusterDictionaryChunks } from "@/web/v2/dict/dict_clustering.common";
import { DictChunkCache } from "@/web/v2/dict/dict_chunk_cache.client";
import type { MorcusDictSuggestions } from "@/web/v2/dict/dict_suggestions.client";
import { buildWelcomeMessage } from "@/web/v2/dict/dict_landing.common";
import {
  encodeDictBitmask,
  DEFAULT_DICT_BITMASK,
  DEFAULT_DICT_KEYS,
} from "@/web/v2/dict/dict_bitmask.common";
import {
  parseInflectionParam,
  resolveDictParams,
} from "@/web/v2/dict/dict_selection.common";
import { handleDictPermalinkClick } from "@/web/v2/dict/dict_permalink.client";
import {
  computeActiveLanguages,
  renderLangChipsHtml,
  renderInflectChipHtml,
} from "@/web/v2/dict/search_bar.common";

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
export class MorcusDictSearch extends BaseElement<"completions" | "results"> {
  public readonly chunkCache: DictChunkCache = new DictChunkCache();
  private suggestions: CompletionItem[] = [];
  private selectedSuggestionIndex: number = -1;

  private inputElement: HTMLInputElement | null = null;
  private resultsElement: HTMLElement | null = null;
  private suggestionsEl: MorcusDictSuggestions | null = null;

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
    this.suggestions = items;
    this.selectedSuggestionIndex = -1;
    this.updateSuggestionsView();
  }

  private readonly debouncedFetchPrefixChunk = debounce(
    (prefix: string, query: string) => {
      const signal = this.latest("completions");
      this.chunkCache
        .loadPrefix(prefix)
        .then((chunks) => {
          if (signal.aborted) return;
          if (document.activeElement !== this.inputElement) return;
          const currentRaw = this.inputElement?.value ?? "";
          const currentClean = cleanCompletionQuery(currentRaw).query;
          if (!currentClean.toLowerCase().startsWith(prefix)) return;

          this.renderCachedCompletions(prefix, currentClean);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            console.error("Failed to load completions chunk", e);
          }
        });
    },
    180
  );

  private readonly debouncedFetchSuffixCompletions = debounce(
    (query: string) => {
      const signal = this.latest("completions");
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
          this.suggestions = Array.isArray(data) ? data : [];
          this.selectedSuggestionIndex = -1;
          this.updateSuggestionsView();
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            console.error("Failed to fetch suffix suggestions", e);
          }
        });
    },
    180
  );

  protected override onConnect() {
    this.initActiveSettings();

    this.syncQueryParam("q", {
      onChange: (q) => {
        if (this.inputElement) {
          this.inputElement.value = q;
        }
        void this.fetchResults(q);
      },
      title: (q) =>
        q ? `${q} - Morcus Dictionary` : "Morcus Dictionary (UI V2)",
    });

    this.enhanceExistingMarkup();
  }

  private initActiveSettings() {
    const params = new URLSearchParams(window.location.search);

    // Resolve inflection state: URL 'o' > stored setting > default (true).
    // getAll, not get: a No-JS form submits the hidden "0" and the checked box's "1" together.
    this.isInflected =
      parseInflectionParam(params.getAll("o")) ??
      inflectedSettingsStore.get() ??
      true;

    // Resolve dictionaries: URL ('dict' > 'd' > 'in') > stored setting > default.
    const keysFromQuery = resolveDictParams({
      dictParam: params.getAll("dict"),
      bitmaskParam: params.get("d"),
      inParam: params.getAll("in"),
    });
    const keys = keysFromQuery ??
      dictSettingsStore.get() ?? [...DEFAULT_DICT_KEYS];
    this.activeDictKeys = keys;
    // The bitmask is what we send to the server and write back to the URL, so it must never drift
    // from activeDictKeys.
    this.activeDictBitmask = encodeDictBitmask(keys);
  }

  protected override onDisconnect() {
    // In-flight lanes are aborted by BaseElement; these are the pending timers.
    this.debouncedFetchPrefixChunk.cancel();
    this.debouncedFetchSuffixCompletions.cancel();
  }

  private enhanceExistingMarkup() {
    this.inputElement = this.$<HTMLInputElement>("input.v2-input");
    this.resultsElement = this.$<HTMLElement>("#dict-results");

    this.hijackForm("form.v2-search-form", ({ q }) => {
      this.clearSuggestions();
      const cleaned = trimRawQuery(q || "");
      if (cleaned) {
        void this.searchQuery(cleaned);
      }
    });

    if (this.inputElement) {
      this.listen(this.inputElement, "input", this.handleInput);
      this.listen(this.inputElement, "keydown", this.handleKeyDown);
      this.listen(this.inputElement, "blur", this.handleBlur);
    }

    if (this.resultsElement) {
      this.enhanceWords(this.resultsElement);

      this.listen(this.resultsElement, "click", (e: MouseEvent) => {
        if (!(e.target instanceof Element)) return;

        // Allow middle-click (e.button !== 0) or modifier clicks (Ctrl, Cmd, Shift, Alt)
        // to follow standard browser navigation (e.g. open in a new tab / new window)
        if (
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }

        if (handleDictPermalinkClick(e, e.target)) {
          return;
        }

        const wordEl = e.target.closest<HTMLElement>(".v2-lat-word");
        if (wordEl) {
          e.preventDefault();
          const word = wordEl.dataset.word || wordEl.textContent?.trim() || "";
          if (word) {
            this.chooseSuggestion(word);
          }
          return;
        }

        const dLinkEl = e.target.closest<HTMLElement>(".dLink");
        if (dLinkEl) {
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

    // Create and attach child component for suggestions. Creating it is
    // one-time; listening to it is not.
    const inputWrapper = this.$(".v2-input-wrapper");
    if (inputWrapper && !this.suggestionsEl) {
      this.suggestionsEl = document.createElement("morcus-dict-suggestions");
      inputWrapper.appendChild(this.suggestionsEl);
    }

    // Deliberately outside the guard above. `BaseElement` disposes listeners on
    // disconnect, so registering this alongside the one-time creation would
    // leave a re-attached element holding a child it can no longer hear.
    if (this.suggestionsEl) {
      this.listen(this.suggestionsEl, "suggestion-select", (e: Event) => {
        if (
          e instanceof CustomEvent &&
          e.detail &&
          typeof e.detail.word === "string"
        ) {
          this.chooseSuggestion(e.detail.word);
        }
      });
    }

    // Dismiss suggestions on outside clicks
    this.addDisposable(
      bindDismissable({
        container: () => this.suggestionsEl,
        isOpen: () => this.suggestions.length > 0,
        onDismiss: () => this.clearSuggestions(),
        listenPointerDown: true,
        ignore: (target) => Boolean(this.inputElement?.contains(target)),
      })
    );

    // Listen for dictionary selection changes to re-fetch or update active search
    this.listen<{ dictKeys: string[]; bitmask?: string }>(
      this,
      "dict-selection-change",
      (e) => {
        const bitmask =
          e.detail?.bitmask ||
          (e.detail?.dictKeys ? encodeDictBitmask(e.detail.dictKeys) : "");

        if (bitmask) {
          this.activeDictBitmask = bitmask;
        }
        if (e.detail?.dictKeys) {
          this.activeDictKeys = e.detail.dictKeys;
        }

        // Update hidden input in form if present
        const hiddenD = this.$<HTMLInputElement>('input[name="d"]');
        if (hiddenD && bitmask) {
          hiddenD.value = bitmask;
        }

        // Update URL query parameter
        this.syncUrlParams({ d: bitmask });

        const currentQuery = this.inputElement?.value.trim() ?? "";
        if (currentQuery) {
          void this.fetchResults(currentQuery);
        }

        // Re-cluster suggestions immediately if active prefix is in chunk cache
        if (this.suggestions.length > 0 && currentQuery) {
          const { query: activeQ, isSuffix: activeSuffix } =
            cleanCompletionQuery(currentQuery);
          if (!activeSuffix && activeQ.length >= 2) {
            const prefix = activeQ.slice(0, 2).toLowerCase();
            if (this.chunkCache.hasPrefix(prefix)) {
              this.renderCachedCompletions(prefix, activeQ);
            }
          }
        }

        const welcomeEl = this.$<HTMLElement>("#v2-landing-welcome");
        if (welcomeEl && this.activeDictKeys) {
          welcomeEl.textContent = buildWelcomeMessage(
            this.activeDictKeys,
            this.isInflected
          );
        }

        // Update dictionary list badges live on the landing page
        if (e.detail?.dictKeys) {
          const activeSet = new Set(
            e.detail.dictKeys.map((k) => k.toUpperCase())
          );
          const items = this.$$<HTMLElement>(".v2-dict-list-item");
          for (const item of items) {
            const key = item.dataset.dictKey?.toUpperCase();
            if (!key) continue;
            const isEnabled = activeSet.has(key);
            item.classList.toggle("v2-dict-enabled", isEnabled);
            item.classList.toggle("v2-dict-disabled", !isEnabled);

            const badge = item.querySelector(".v2-lexicon-badge");
            if (badge) {
              badge.classList.toggle("v2-dict-enabled", isEnabled);
              badge.classList.toggle("v2-dict-disabled", !isEnabled);
            }
          }
        }

        // Update language chips in the search bar tray live
        const langChipsContainer = this.$<HTMLElement>(".v2-lang-chips");
        if (langChipsContainer && this.activeDictKeys) {
          const activeLangs = computeActiveLanguages(this.activeDictKeys);
          setHtml(langChipsContainer, renderLangChipsHtml(activeLangs));
        }
      }
    );

    // Listen for inflection mode toggle changes
    this.listen<{ isInflected: boolean }>(
      this,
      "dict-inflected-change",
      (e) => {
        this.isInflected = e.detail?.isInflected !== false;

        this.syncUrlParams({ o: this.isInflected ? "1" : "0" });

        // Update inflection badge in the search bar tray live
        const inflectChip = this.$<HTMLElement>(".v2-inflect-chip");
        if (inflectChip) {
          replaceWithHtml(inflectChip, renderInflectChipHtml(this.isInflected));
        }

        const welcomeEl = this.$<HTMLElement>("#v2-landing-welcome");
        if (welcomeEl && this.activeDictKeys) {
          welcomeEl.textContent = buildWelcomeMessage(
            this.activeDictKeys,
            this.isInflected
          );
        }

        const currentQuery = this.inputElement?.value.trim() ?? "";
        if (currentQuery) {
          void this.fetchResults(currentQuery);
        }
      }
    );

    const currentQuery = this.inputElement?.value.trim() ?? "";
    const hasHash = Boolean(window.location.hash);
    const navEntry = performance.getEntriesByType?.("navigation")?.[0];
    const isBackForward =
      typeof PerformanceNavigationTiming !== "undefined" &&
      navEntry instanceof PerformanceNavigationTiming &&
      navEntry.type === "back_forward";

    if (currentQuery && !hasHash && !isBackForward && this.resultsElement) {
      requestAnimationFrame(() => {
        this.scrollToResults("instant");
      });
    } else if (
      !currentQuery &&
      this.inputElement &&
      document.activeElement === document.body
    ) {
      this.inputElement.focus();
    }
  }

  private scrollToResults(behavior: ScrollBehavior = "instant") {
    if (!this.resultsElement) return;
    if (typeof this.resultsElement.scrollIntoView === "function") {
      this.resultsElement.scrollIntoView({ behavior, block: "start" });
    }
  }

  private syncUrlParams(updates: { d?: string; o?: string }) {
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
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  private clearSuggestions() {
    this.debouncedFetchPrefixChunk.cancel();
    this.debouncedFetchSuffixCompletions.cancel();
    this.cancel("completions");
    this.suggestions = [];
    this.selectedSuggestionIndex = -1;
    this.updateSuggestionsView();
  }

  private updateSuggestionsView() {
    if (this.suggestionsEl) {
      this.suggestionsEl.items = this.suggestions;
      this.suggestionsEl.activeIndex = this.selectedSuggestionIndex;
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
      this.debouncedFetchPrefixChunk(prefix, query);
    }
  };

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    if (this.suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedSuggestionIndex =
        (this.selectedSuggestionIndex + 1) % this.suggestions.length;
      this.updateSuggestionsView();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedSuggestionIndex =
        (this.selectedSuggestionIndex - 1 + this.suggestions.length) %
        this.suggestions.length;
      this.updateSuggestionsView();
    } else if (e.key === "Enter" && this.selectedSuggestionIndex >= 0) {
      e.preventDefault();
      this.chooseSuggestion(
        this.suggestions[this.selectedSuggestionIndex].word
      );
    } else if (e.key === "Escape") {
      this.clearSuggestions();
    }
  };

  private readonly handleBlur = () => {
    // Delay closing suggestions so click events on suggestions can register
    window.setTimeout(() => {
      this.clearSuggestions();
    }, 200);
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
    url.searchParams.set("q", cleanQuery);
    url.searchParams.set("d", this.activeDictBitmask);
    url.searchParams.set("o", this.isInflected ? "1" : "0");
    url.searchParams.delete("dict");
    url.searchParams.delete("in");

    const newSearchPath = url.pathname + url.search;
    window.history.pushState({ q: cleanQuery }, "", newSearchPath);
    document.title = `${cleanQuery} - Morcus Dictionary`;
    await this.fetchResults(cleanQuery);
    requestAnimationFrame(() => {
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
      signal: this.latest("results"),
      errorMessage: "Error loading results.",
      loadingOpacity: 0.5,
    });
    if (success) {
      this.enhanceWords(this.resultsElement);
    }
  }

  public enhanceWords(container: HTMLElement | null) {
    if (!container) return;

    const entries =
      container.querySelectorAll<HTMLElement>(".v2-entry-content");
    if (entries.length === 0) return;

    for (const entry of entries) {
      if (entry.dataset.wordsEnhanced === "true") continue;
      entry.dataset.wordsEnhanced = "true";

      const walker = document.createTreeWalker(
        entry,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
          acceptNode(node: Node) {
            if (node instanceof HTMLElement) {
              const tag = node.tagName.toLowerCase();
              const cls = node.className || "";
              if (
                tag === "a" ||
                tag === "button" ||
                tag === "script" ||
                tag === "style" ||
                node.getAttribute("lang") === "el" ||
                node.hasAttribute("data-no-linkify") ||
                (typeof cls === "string" &&
                  (cls.includes("lsOrth") ||
                    cls.includes("lsEmph") ||
                    cls.includes("lsHover") ||
                    cls.includes("lsSenseBullet") ||
                    cls.includes("v2-section-anchor") ||
                    cls.includes("v2-toc") ||
                    cls.includes("dLink")))
              ) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_SKIP;
            }
            if (node instanceof Text) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          },
        }
      );

      const textNodes: Text[] = [];
      let curr: Node | null = walker.nextNode();
      while (curr) {
        if (curr instanceof Text && curr.nodeValue) {
          textNodes.push(curr);
        }
        curr = walker.nextNode();
      }

      for (const textNode of textNodes) {
        const text = textNode.nodeValue || "";
        if (!/[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(text)) {
          continue;
        }

        const fragment = document.createDocumentFragment();
        let hasWords = false;

        for (const [token, isWord] of processTokens(text)) {
          const cleanWord = removeDiacritics(token).replaceAll("-", "").trim();
          const isLatinWord =
            isWord &&
            !/\d/.test(token) &&
            /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(cleanWord);

          if (isLatinWord) {
            hasWords = true;
            const a = document.createElement("a");
            a.className = "v2-lat-word";
            a.href = this.buildWordHref(cleanWord);
            a.dataset.word = cleanWord;
            a.textContent = token;
            fragment.appendChild(a);
          } else {
            fragment.appendChild(document.createTextNode(token));
          }
        }

        if (hasWords) {
          textNode.parentNode?.replaceChild(fragment, textNode);
        }
      }
    }
  }

  private buildWordHref(cleanWord: string): string {
    const searchParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    params.set("q", cleanWord);
    params.set("d", this.activeDictBitmask);
    params.set("o", this.isInflected ? "1" : "0");

    const langParam = searchParams.get("lang");
    if (langParam) {
      params.set("lang", langParam);
    }
    const embeddedParam = searchParams.get("embedded");
    if (embeddedParam) {
      params.set("embedded", embeddedParam);
    }
    return `/v2/dicts?${params.toString()}`;
  }
}

registerElement("morcus-dict-search", MorcusDictSearch);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-dict-search": MorcusDictSearch;
  }
}
