import { type DictLang } from "@/common/dictionaries/dictionaries";
import { removeDiacritics } from "@/common/text_cleaning";
import {
  BaseController,
  ComboboxController,
  html,
  joinHtml,
  KeyedFetchCache,
  setHtml,
} from "@/web/ui/core/index.client";
import {
  cleanCompletionQuery,
  type CompletionItem,
  type DictChunksResponse,
} from "@/web/ui/dict/search/dict_completions.common";
import { filterAndClusterDictionaryChunks } from "@/web/ui/dict/search/dict_clustering.common";
import { createDictChunkCache } from "@/web/ui/dict/search/dict_chunk_cache.client";
import {
  DEFAULT_DICT_KEYS,
  encodeDictBitmask,
  parseDictsFromCookie,
} from "@/web/ui/dict/settings/dict_bitmask.common";

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
 * - Owns the `ComboboxController` on the server-rendered `#dict-suggestions-list`
 *   (see `renderDictSearchBar`) and renders the suggestions into it.
 */
export class DictAutocompleteController extends BaseController<"completions"> {
  public readonly chunkCache: KeyedFetchCache<DictChunksResponse> =
    createDictChunkCache();

  readonly #options: DictAutocompleteOptions;
  #inputElement: HTMLInputElement | null = null;
  #listboxElement: HTMLUListElement | null = null;

  /**
   * A child controller, so it connects after this controller's `onConnect` has
   * re-queried the elements it binds to (on first connect and on reattach).
   */
  readonly #combobox = this.addController(
    new ComboboxController<CompletionItem>({
      root: this.root,
      getInput: () => this.#inputElement,
      getListbox: () => this.#listboxElement,
      acceptOnTab: false,
      // No `id`, `role`, `aria-selected` or `data-index` here:
      // `ComboboxController.syncItemAttributes` manages those.
      renderItems: (items, box) => {
        setHtml(
          box,
          html`${joinHtml(
            items.map(
              (item) =>
                html`<li class="suggestion-item" data-word="${item.word}">
                  <span class="lang-chip lang-chip-${item.lang.toLowerCase()}"
                    >${item.lang}</span
                  ><span class="suggestion-word">${item.word}</span>
                </li>`
            )
          )}`
        );
      },
      onSelect: (item) => {
        // `*` (a universal dictionary) is no concrete language to focus on.
        this.#options.onSelectSuggestion(
          item.word,
          item.lang === "*" ? undefined : item.lang
        );
      },
    })
  );

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
    // Re-queried on every connect, so a re-attached element binds the
    // combobox to the elements actually in its subtree.
    this.#inputElement = this.scope.$<HTMLInputElement>("input.input");
    this.#listboxElement = this.scope.$<HTMLUListElement>(
      "#dict-suggestions-list"
    );
    if (this.#inputElement) {
      this.scope.listen(this.#inputElement, "input", this.#handleInput);
    }
  }

  protected override onDisconnect() {
    this.#inputElement = null;
    this.#listboxElement = null;
  }

  public override connect() {
    // `super.connect()` runs `onConnect` and then connects the combobox, so
    // only now can typed-ahead suggestions render. Starting them from
    // `onConnect` instead would, on reattach, render into a combobox that
    // `super.connect()` then reconnects (clearing it).
    super.connect();
    const input = this.#inputElement;
    if (!this.isConnected || !input) return;
    // The input is usable before upgrade, so its live value may be text the
    // user typed rather than the query the server rendered results for.
    const typedBeforeUpgrade = input.value.trim() !== input.defaultValue.trim();
    if (typedBeforeUpgrade && document.activeElement === input) {
      // The user is mid-search; start autocomplete for what's already typed.
      this.#handleInput();
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
   * The list's items live only in the combobox: it closes itself on blur and
   * Escape, so a copy here would go stale and could reopen it later (e.g. on
   * a dictionary settings change).
   */
  get #shownSuggestions(): readonly CompletionItem[] {
    return this.#combobox.items;
  }

  #showSuggestions(items: readonly CompletionItem[]) {
    this.#combobox.setItems(items);
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
