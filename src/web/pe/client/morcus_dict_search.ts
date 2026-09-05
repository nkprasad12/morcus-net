import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";

/**
 * Progressively enhanced dictionary search component using Light DOM.
 *
 * Without JS:
 * - The browser natively renders the inner server-rendered <form> and <output id="dict-results">.
 * - Submitting the form issues a standard HTTP GET /pe/dicts?q=... request.
 *
 * With JS:
 * - Enhances the existing DOM in place (Light DOM mode: createRenderRoot returns this).
 * - Debounces input typing to fetch autocomplete suggestions from /pe/api/completions.
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

  private debounceTimer: number | null = null;
  private formElement: HTMLFormElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private resultsElement: HTMLElement | null = null;
  private suggestionsContainer: HTMLElement | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.enhanceExistingMarkup();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListeners();
  }

  private enhanceExistingMarkup() {
    this.formElement = this.querySelector<HTMLFormElement>(
      "form.pe-search-form"
    );
    this.inputElement = this.querySelector<HTMLInputElement>("input.pe-input");
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

    // Create container for reactive suggestions dropdown inside the input wrapper
    const inputWrapper = this.querySelector<HTMLElement>(".pe-input-wrapper");
    if (inputWrapper && !this.suggestionsContainer) {
      this.suggestionsContainer = document.createElement("div");
      this.suggestionsContainer.className = "pe-suggestions-host";
      inputWrapper.appendChild(this.suggestionsContainer);
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
          `/pe/api/completions?q=${encodeURIComponent(query)}`
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
      ? `/pe/dicts?q=${encodeURIComponent(query)}`
      : "/pe/dicts";
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
      const url = `/pe/dicts?q=${encodeURIComponent(query)}&format=partial`;
      const res = await fetch(url, {
        headers: { "X-Requested-With": "fetch" },
      });

      if (res.ok) {
        const partialHtml = await res.text();
        this.resultsElement.innerHTML = partialHtml;
      } else {
        this.resultsElement.innerHTML = `<div class="pe-no-results"><p>Error loading results.</p></div>`;
      }
    } catch (e) {
      console.error("AJAX search failed", e);
      this.resultsElement.innerHTML = `<div class="pe-no-results"><p>Network error loading results.</p></div>`;
    } finally {
      this.resultsElement.style.opacity = "1";
    }
  }

  // Render reactive suggestions overlay into Light DOM
  override render() {
    if (!this.suggestionsContainer) return null;

    if (this.suggestions.length === 0) {
      this.suggestionsContainer.innerHTML = "";
      return null;
    }

    const items = this.suggestions.map((item, idx) => {
      const isActive = idx === this.selectedSuggestionIndex;
      return `<li class="pe-suggestion-item ${
        isActive ? "active" : ""
      }" data-word="${item}">${item}</li>`;
    });

    this.suggestionsContainer.innerHTML = `<ul class="pe-suggestions">${items.join(
      ""
    )}</ul>`;

    // Attach click listener for suggestion items
    const ul = this.suggestionsContainer.querySelector(".pe-suggestions");
    if (ul) {
      ul.addEventListener("mousedown", (e) => {
        if (!(e.target instanceof Element)) {
          return;
        }
        const target = e.target.closest(".pe-suggestion-item");
        if (target) {
          const word = target.getAttribute("data-word");
          if (word) {
            this.chooseSuggestion(word);
          }
        }
      });
    }

    return null;
  }
}
