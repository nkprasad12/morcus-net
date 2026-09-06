import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { MorcusDictSuggestions } from "@/web/v2/client/morcus_dict_suggestions";

/**
 * Progressively enhanced dictionary search component using Light DOM.
 *
 * Without JS:
 * - The browser natively renders the inner server-rendered <form> and <output id="dict-results">.
 * - Submitting the form issues a standard HTTP GET /v2/dicts?q=... request.
 *
 * With JS:
 * - Enhances the existing DOM in place (Light DOM mode: createRenderRoot returns this).
 * - Debounces input typing to fetch autocomplete suggestions from /v2/api/completions.
 * - Intercepts form submissions to perform smooth AJAX partial updates without full page reloads.
 * - Updates the browser URL bar via history.pushState.
 */
@customElement("morcus-dict-search")
export class MorcusDictSearch extends LitElement {
  // CRITICAL: Force Light DOM so all global CSS applies and native form submission works without JS
  override createRenderRoot() {
    return this;
  }

  @state()
  private suggestions: string[] = [];

  @state()
  private selectedSuggestionIndex: number = -1;

  private currentSearchPath: string = "";
  private debounceTimer: number | null = null;
  private formElement: HTMLFormElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private resultsElement: HTMLElement | null = null;
  private suggestionsEl: MorcusDictSuggestions | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.currentSearchPath = window.location.pathname + window.location.search;
    this.enhanceExistingMarkup();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListeners();
  }

  private enhanceExistingMarkup() {
    this.formElement = this.querySelector<HTMLFormElement>(
      "form.v2-search-form"
    );
    this.inputElement = this.querySelector<HTMLInputElement>("input.v2-input");
    this.resultsElement = this.querySelector<HTMLElement>("#dict-results");

    if (this.formElement) {
      this.formElement.addEventListener("submit", this.handleFormSubmit);
    }

    if (this.inputElement) {
      this.inputElement.addEventListener("input", this.handleInput);
      this.inputElement.addEventListener("keydown", this.handleKeyDown);
      this.inputElement.addEventListener("blur", this.handleBlur);
    }

    // Handle browser back/forward buttons to restore results without page reload
    window.addEventListener("popstate", this.handlePopState);

    // Create and attach child Lit component for suggestions
    const inputWrapper = this.querySelector<HTMLElement>(".v2-input-wrapper");
    if (inputWrapper && !this.suggestionsEl) {
      const suggestionsTag = document.createElement("morcus-dict-suggestions");
      this.suggestionsEl = suggestionsTag;
      this.suggestionsEl.addEventListener("suggestion-select", (e: Event) => {
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

    if (this.inputElement && document.activeElement === document.body) {
      this.inputElement.focus();
    }
  }

  private removeEventListeners() {
    if (this.formElement) {
      this.formElement.removeEventListener("submit", this.handleFormSubmit);
    }
    if (this.inputElement) {
      this.inputElement.removeEventListener("input", this.handleInput);
      this.inputElement.removeEventListener("keydown", this.handleKeyDown);
      this.inputElement.removeEventListener("blur", this.handleBlur);
    }
    window.removeEventListener("popstate", this.handlePopState);
  }

  private readonly handleInput = () => {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    const query = this.inputElement?.value.trim() ?? "";
    if (query.length < 2) {
      this.suggestions = [];
      this.selectedSuggestionIndex = -1;
      this.requestUpdate();
      return;
    }

    this.debounceTimer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/v2/api/completions?q=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          this.suggestions = await res.json();
          this.selectedSuggestionIndex = -1;
          this.requestUpdate();
        }
      } catch (e) {
        console.error("Failed to fetch suggestions", e);
      }
    }, 180);
  };

  private readonly handleKeyDown = (e: KeyboardEvent) => {
    if (this.suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedSuggestionIndex =
        (this.selectedSuggestionIndex + 1) % this.suggestions.length;
      this.requestUpdate();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedSuggestionIndex =
        (this.selectedSuggestionIndex - 1 + this.suggestions.length) %
        this.suggestions.length;
      this.requestUpdate();
    } else if (e.key === "Enter" && this.selectedSuggestionIndex >= 0) {
      e.preventDefault();
      this.chooseSuggestion(this.suggestions[this.selectedSuggestionIndex]);
    } else if (e.key === "Escape") {
      this.suggestions = [];
      this.selectedSuggestionIndex = -1;
      this.requestUpdate();
    }
  };

  private readonly handleBlur = () => {
    // Delay closing suggestions so click events on suggestions can register
    window.setTimeout(() => {
      this.suggestions = [];
      this.selectedSuggestionIndex = -1;
      this.requestUpdate();
    }, 200);
  };

  private chooseSuggestion(suggestion: string) {
    if (this.inputElement) {
      this.inputElement.value = suggestion;
    }
    this.suggestions = [];
    this.selectedSuggestionIndex = -1;
    this.requestUpdate();
    this.searchQuery(suggestion);
  }

  private readonly handleFormSubmit = (e: Event) => {
    e.preventDefault(); // Hijack standard submit when JS is enabled
    const query = this.inputElement?.value.trim() ?? "";
    this.suggestions = [];
    this.requestUpdate();
    this.searchQuery(query);
  };

  private readonly handlePopState = () => {
    const newSearchPath = window.location.pathname + window.location.search;
    if (newSearchPath === this.currentSearchPath) {
      // The path and query params have not changed (e.g. in-page anchor/hash navigation).
      // Do not re-fetch results, avoiding destruction of the DOM and preserving open details.
      return;
    }
    this.currentSearchPath = newSearchPath;
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get("q") ?? "";
    if (this.inputElement) {
      this.inputElement.value = q;
    }
    this.fetchResults(q, false);
  };

  private async searchQuery(query: string) {
    if (this.inputElement) {
      this.inputElement.blur();
    }
    // Update browser URL bar
    const newUrl = query
      ? `/v2/dicts?q=${encodeURIComponent(query)}`
      : "/v2/dicts";
    this.currentSearchPath = newUrl;
    window.history.pushState({ q: query }, "", newUrl);
    document.title = query
      ? `${query} - Morcus Dictionary`
      : "Morcus Dictionary";
    await this.fetchResults(query, true);
  }

  private async fetchResults(query: string, _pushState: boolean) {
    if (!this.resultsElement) return;

    this.resultsElement.style.opacity = "0.5";

    try {
      const url = `/v2/dicts?q=${encodeURIComponent(query)}&format=partial`;
      const res = await fetch(url, {
        headers: { "X-Requested-With": "fetch" },
      });

      if (res.ok) {
        const partialHtml = await res.text();
        const range = document.createRange();
        range.selectNodeContents(this.resultsElement);
        const fragment = range.createContextualFragment(partialHtml);
        this.resultsElement.replaceChildren(fragment);
      } else {
        const p = document.createElement("p");
        p.textContent = "Error loading results.";
        const div = document.createElement("div");
        div.className = "v2-no-results";
        div.appendChild(p);
        this.resultsElement.replaceChildren(div);
      }
    } catch (e) {
      console.error("AJAX search failed", e);
      const p = document.createElement("p");
      p.textContent = "Network error loading results.";
      const div = document.createElement("div");
      div.className = "v2-no-results";
      div.appendChild(p);
      this.resultsElement.replaceChildren(div);
    } finally {
      this.resultsElement.style.opacity = "1";
    }
  }

  // Update suggestions child component state declaratively
  override render() {
    if (this.suggestionsEl) {
      this.suggestionsEl.items = this.suggestions;
      this.suggestionsEl.activeIndex = this.selectedSuggestionIndex;
    }
    return null;
  }
}
