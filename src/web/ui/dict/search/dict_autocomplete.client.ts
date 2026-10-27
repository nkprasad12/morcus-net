import { type DictLang } from "@/common/dictionaries/dictionaries";
import { removeDiacritics } from "@/common/text_cleaning";
import {
  BaseController,
  KeyedFetchCache,
  queryUpgraded,
} from "@/web/ui/core/index.client";
import {
  cleanCompletionQuery,
  type CompletionItem,
  type DictChunksResponse,
} from "@/web/ui/dict/search/dict_completions.common";
import { filterAndClusterDictionaryChunks } from "@/web/ui/dict/search/dict_clustering.common";
import { parseFocusLang } from "@/web/ui/dict/search/dict_params.common";
import { createDictChunkCache } from "@/web/ui/dict/search/dict_chunk_cache.client";
import {
  DEFAULT_DICT_KEYS,
  encodeDictBitmask,
  parseDictsFromCookie,
} from "@/web/ui/dict/settings/dict_bitmask.common";
import "@/web/ui/dict/search/dict_suggestions.client";

interface DictAutocompleteOptions {
  /** Active dictionary keys currently selected for this view. */
  getActiveDictKeys: () => readonly string[];
  /**
   * Invoked when the user selects a suggestion from the dropdown. `lang` is the
   * suggestion's source language (its chip), when it is a concrete one.
   */
  onSelectSuggestion: (word: string, lang: DictLang | undefined) => void;
}

/**
 * Manages dictionary search input autocomplete:
 * - Debounces 2-letter prefix chunk loads (`chunkCache`) and client-side clustering.
 * - Debounces server-side suffix completion fetches (`-arum`, `-ibus`).
 * - Populates `<morcus-dict-suggestions>` and forwards `suggestion-select` events.
 */
export class DictAutocompleteController extends BaseController<"completions"> {
  public readonly chunkCache: KeyedFetchCache<DictChunksResponse> =
    createDictChunkCache();

  readonly #options: DictAutocompleteOptions;
  #inputElement: HTMLInputElement | null = null;
  /** The suggestions host, for events and dismissal (works before it upgrades). */
  #suggestionsEl: HTMLElement | null = null;

  constructor(root: HTMLElement, options: DictAutocompleteOptions) {
    super(root);
    this.#options = options;
  }

  /**
   * The dictionaries autocomplete suggests from: the ones a typed search will query. In a `lang=`
   * view (the reader's dictionary) a typed search leaves the scope and the server resolves the
   * user's saved selection, so suggest from that, not from the narrowed set on screen.
   */
  #suggestionDictKeys(): readonly string[] {
    if (!new URLSearchParams(window.location.search).has("lang")) {
      return this.#options.getActiveDictKeys();
    }
    return parseDictsFromCookie(document.cookie) ?? DEFAULT_DICT_KEYS;
  }

  #renderCachedCompletions(prefix: string, query: string) {
    const chunks = this.chunkCache.get(prefix);
    if (!chunks) {
      this.clear();
      return;
    }
    const items = filterAndClusterDictionaryChunks(
      chunks,
      this.#suggestionDictKeys(),
      query,
      25
    );
    this.#showSuggestions(items);
  }

  // Deliberately takes no query: by the time the debounce fires the one the
  // caller had is up to 180ms stale, so the live input value is re-read below.
  readonly #debouncedFetchPrefixChunk = this.debounce((prefix: string) => {
    const signal = this.scope.latest("completions");
    // The live query if this fetch still matters to it: not superseded, the
    // input still focused, and what's typed still starts with `prefix`.
    const liveQuery = (): string | undefined => {
      if (signal.aborted) return undefined;
      if (document.activeElement !== this.#inputElement) return undefined;
      const query = cleanCompletionQuery(this.#inputElement?.value ?? "").query;
      return removeDiacritics(query).toLowerCase().startsWith(prefix)
        ? query
        : undefined;
    };
    this.chunkCache
      .load(prefix)
      .then(() => {
        const query = liveQuery();
        if (query !== undefined) this.#renderCachedCompletions(prefix, query);
      })
      .catch((e: unknown) => {
        console.error(`Failed to load completions chunk "${prefix}"`, e);
        // The list may still show an earlier prefix's suggestions.
        if (liveQuery() !== undefined) this.clear();
      });
  }, 180);

  readonly #debouncedFetchSuffixCompletions = this.debounce((query: string) => {
    const signal = this.scope.latest("completions");
    const fetchParams = new URLSearchParams();
    fetchParams.set("q", query);
    fetchParams.set("d", encodeDictBitmask(this.#suggestionDictKeys()));

    fetch(`/api/completions?${fetchParams.toString()}`, { signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CompletionItem[]) => {
        if (signal.aborted) return;
        if (document.activeElement !== this.#inputElement) return;
        this.#showSuggestions(Array.isArray(data) ? data : []);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name !== "AbortError") {
          console.error("Failed to fetch suffix suggestions", e);
        }
      });
  }, 180);

  protected override onConnect() {
    this.#inputElement = this.scope.$<HTMLInputElement>("input.input");

    // Adopt the server-rendered suggestions host (see `renderDictSearchBar`).
    // Re-queried on every connect, so a re-attached element listens to the
    // child that is actually in its subtree.
    this.#suggestionsEl = this.scope.$("morcus-dict-suggestions");
    if (this.#suggestionsEl) {
      this.scope.listen(
        this.#suggestionsEl,
        "suggestion-select",
        (e: Event) => {
          if (e instanceof CustomEvent) {
            const detail: unknown = e.detail;
            if (
              typeof detail === "object" &&
              detail !== null &&
              "word" in detail &&
              typeof detail.word === "string"
            ) {
              this.#options.onSelectSuggestion(
                detail.word,
                "lang" in detail ? parseFocusLang(detail.lang) : undefined
              );
            }
          }
        }
      );
    }

    if (this.#inputElement) {
      this.scope.listen(this.#inputElement, "input", this.#handleInput);

      // The input is usable before upgrade, so its live value may be text the
      // user typed rather than the query the server rendered results for.
      const renderedQuery = this.#inputElement.defaultValue.trim();
      const typedBeforeUpgrade =
        this.#inputElement.value.trim() !== renderedQuery;
      if (typedBeforeUpgrade && document.activeElement === this.#inputElement) {
        // The user is mid-search; start autocomplete for what's already typed.
        this.#handleInput();
      }
    }
  }

  public clear() {
    this.#debouncedFetchPrefixChunk.cancel();
    this.#debouncedFetchSuffixCompletions.cancel();
    this.scope.cancel("completions");
    this.#showSuggestions([]);
  }

  /** Re-clusters suggestions immediately if the active prefix is in the chunk cache. */
  public refreshForDictChange(currentQuery: string) {
    if (this.#shownSuggestions.length === 0) return;
    const { query: activeQ, isSuffix: activeSuffix } =
      cleanCompletionQuery(currentQuery);
    const folded = removeDiacritics(activeQ).toLowerCase();
    if (!activeSuffix && folded.length >= 2) {
      const prefix = folded.slice(0, 2);
      if (this.chunkCache.has(prefix)) {
        this.#renderCachedCompletions(prefix, activeQ);
      }
    }
  }

  /**
   * The list's items live only in `<morcus-dict-suggestions>`: it closes
   * itself on blur and Escape, so a copy here would go stale and could
   * reopen it later (e.g. on a dictionary settings change).
   */
  get #shownSuggestions(): readonly CompletionItem[] {
    return this.host
      ? queryUpgraded(this.host, "morcus-dict-suggestions")?.items ?? []
      : [];
  }

  #showSuggestions(items: readonly CompletionItem[]) {
    if (!this.host) return;
    const suggestions = queryUpgraded(this.host, "morcus-dict-suggestions");
    if (suggestions) {
      suggestions.items = items;
    }
  }

  readonly #handleInput = () => {
    const raw = this.#inputElement?.value ?? "";
    const { query, isSuffix } = cleanCompletionQuery(raw);
    if (isSuffix) {
      if (query.length < 2) {
        this.clear();
        return;
      }
      this.#debouncedFetchPrefixChunk.cancel();
      this.#debouncedFetchSuffixCompletions(query);
      return;
    }

    const folded = removeDiacritics(query).toLowerCase();
    if (folded.length < 2) {
      this.clear();
      return;
    }

    this.#debouncedFetchSuffixCompletions.cancel();
    const prefix = folded.slice(0, 2);
    if (this.chunkCache.has(prefix)) {
      this.#debouncedFetchPrefixChunk.cancel();
      this.#renderCachedCompletions(prefix, query);
    } else {
      this.#debouncedFetchPrefixChunk(prefix);
    }
  };
}
