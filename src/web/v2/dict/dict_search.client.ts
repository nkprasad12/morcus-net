import {
  BaseElement,
  bindDismissable,
  debounce,
  fetchAndSwapPartial,
  LatestTask,
  type QueryParamSync,
  registerElement,
} from "@/web/v2/core/index.client";
import type { MorcusDictSuggestions } from "@/web/v2/dict/dict_suggestions.client";

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
 * - Uses LatestTask to cleanly cancel stale completion requests.
 * - Uses syncQueryParam for seamless browser back/forward and title sync.
 * - Performs smooth AJAX partial swaps via fetchAndSwapPartial without full page reloads.
 */
export class MorcusDictSearch extends BaseElement {
  private suggestions: string[] = [];
  private selectedSuggestionIndex: number = -1;
  private readonly completionTask = new LatestTask();
  private router: QueryParamSync | null = null;

  private inputElement: HTMLInputElement | null = null;
  private resultsElement: HTMLElement | null = null;
  private suggestionsEl: MorcusDictSuggestions | null = null;

  private readonly debouncedFetchCompletions = debounce((query: string) => {
    const signal = this.completionTask.start();
    fetch(`/v2/api/completions?q=${encodeURIComponent(query)}`, { signal })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (document.activeElement !== this.inputElement) return;
        this.suggestions = data;
        this.selectedSuggestionIndex = -1;
        this.updateSuggestionsView();
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          console.error("Failed to fetch suggestions", e);
        }
      });
  }, 180);

  protected override onConnect() {
    this.router = this.syncQueryParam("q", {
      onChange: (q) => {
        if (this.inputElement) {
          this.inputElement.value = q;
        }
        this.fetchResults(q);
      },
      title: (q) =>
        q ? `${q} - Morcus Dictionary` : "Morcus Dictionary (UI V2)",
    });

    this.enhanceExistingMarkup();
  }

  protected override onDisconnect() {
    this.completionTask.cancel();
    this.debouncedFetchCompletions.cancel();
  }

  private enhanceExistingMarkup() {
    this.inputElement = this.$<HTMLInputElement>("input.v2-input");
    this.resultsElement = this.$<HTMLElement>("#dict-results");

    this.hijackForm("form.v2-search-form", ({ q }) => {
      this.clearSuggestions();
      this.searchQuery(q || "");
    });

    if (this.inputElement) {
      this.listen(this.inputElement, "input", this.handleInput);
      this.listen(this.inputElement, "keydown", this.handleKeyDown);
      this.listen(this.inputElement, "blur", this.handleBlur);
    }

    // Create and attach child component for suggestions
    const inputWrapper = this.$(".v2-input-wrapper");
    if (inputWrapper && !this.suggestionsEl) {
      const suggestionsTag = document.createElement("morcus-dict-suggestions");
      this.suggestionsEl = suggestionsTag;
      this.listen(this.suggestionsEl, "suggestion-select", (e: Event) => {
        if (
          e instanceof CustomEvent &&
          e.detail &&
          typeof e.detail.word === "string"
        ) {
          this.chooseSuggestion(e.detail.word);
        }
      });
      inputWrapper.appendChild(this.suggestionsEl);
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

    if (this.inputElement && document.activeElement === document.body) {
      this.inputElement.focus();
    }
  }

  private clearSuggestions() {
    this.debouncedFetchCompletions.cancel();
    this.completionTask.cancel();
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
    const query = this.inputElement?.value.trim() ?? "";
    if (query.length < 2) {
      this.clearSuggestions();
      return;
    }
    this.debouncedFetchCompletions(query);
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
      this.chooseSuggestion(this.suggestions[this.selectedSuggestionIndex]);
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
    if (this.inputElement) {
      this.inputElement.value = suggestion;
    }
    this.clearSuggestions();
    this.searchQuery(suggestion);
  }

  private async searchQuery(query: string) {
    if (this.inputElement) {
      this.inputElement.blur();
    }
    this.router?.push(query);
    await this.fetchResults(query);
  }

  private async fetchResults(query: string) {
    if (!this.resultsElement) return;
    const url = `/v2/dicts?q=${encodeURIComponent(query)}&format=partial`;
    await fetchAndSwapPartial(this.resultsElement, url, {
      errorMessage: "Error loading results.",
      loadingOpacity: 0.5,
    });
  }
}

registerElement("morcus-dict-search", MorcusDictSearch);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-dict-search": MorcusDictSearch;
  }
}
