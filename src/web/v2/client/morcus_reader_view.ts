/**
 * Progressively enhanced Reader View with embedded dictionary lookup using Light DOM.
 *
 * Without JS:
 * - Each Latin word is an HTML <a> link pointing to /v2/reader?q=word#v2-reader-dict.
 * - Clicking a word triggers a native standard HTTP GET request.
 * - The server re-renders the reader page with the chosen word's dictionary entry in the sidebar.
 *
 * With JS:
 * - Intercepts word clicks via event delegation.
 * - Fetches partial HTML fragments from /v2/dicts?q=word&format=partial.
 * - Swaps the dictionary panel contents instantaneously with replaceChildren(fragment).
 * - Synchronizes the active word visual indicator, browser URL bar, and history state.
 */
export class MorcusReaderView extends HTMLElement {
  private resultsElement: HTMLElement | null = null;
  private currentQuery: string = "";
  private abortController: AbortController | null = null;

  connectedCallback() {
    this.resultsElement = this.querySelector<HTMLElement>(
      "#v2-reader-dict-results"
    );

    const initialParams = new URLSearchParams(window.location.search);
    this.currentQuery = initialParams.get("q") ?? "";

    this.addEventListener("click", this.handleClick);
    window.addEventListener("popstate", this.handlePopState);

    const form = this.querySelector<HTMLFormElement>(".v2-reader-search-form");
    form?.addEventListener("submit", this.handleSearchSubmit);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
    window.removeEventListener("popstate", this.handlePopState);

    const form = this.querySelector<HTMLFormElement>(".v2-reader-search-form");
    form?.removeEventListener("submit", this.handleSearchSubmit);

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private readonly handleSearchSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const input = this.querySelector<HTMLInputElement>(".v2-reader-input");
    const query = input?.value.trim() || "";
    if (!query) return;
    this.lookupWord(query, undefined, true);
  };

  private readonly handleClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;

    // Handle close button click (collapses sheet/clears word)
    const closeBtn = e.target.closest<HTMLAnchorElement>(
      "a.v2-reader-sheet-close"
    );
    if (closeBtn) {
      e.preventDefault();
      this.closeDictionary(true);
      return;
    }

    const wordAnchor = e.target.closest<HTMLAnchorElement>("a.v2-lat-word");
    if (!wordAnchor) return;

    // Check if the click is inside the reader text panel (not inside dictionary entries themselves)
    const textPanel = this.querySelector(".v2-reader-text-panel");
    if (!textPanel || !textPanel.contains(wordAnchor)) {
      return;
    }

    e.preventDefault();
    const href = wordAnchor.getAttribute("href") || "";
    const urlMatch = href.match(/[?&]q=([^&#]+)/);
    const word = urlMatch
      ? decodeURIComponent(urlMatch[1])
      : wordAnchor.textContent?.trim() || "";
    if (!word) return;

    this.lookupWord(word, wordAnchor, true);
  };

  private readonly handlePopState = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get("q") ?? "";
    if (q === this.currentQuery) return;

    if (!q) {
      this.closeDictionary(false);
      return;
    }

    this.currentQuery = q;
    let matchingAnchor: HTMLElement | undefined;
    const allAnchors = this.querySelectorAll<HTMLAnchorElement>(
      ".v2-reader-text-panel a.v2-lat-word"
    );
    for (const a of allAnchors) {
      const aHref = a.getAttribute("href") || "";
      if (aHref.includes(`q=${encodeURIComponent(q)}`)) {
        matchingAnchor = a;
        break;
      }
    }
    this.lookupWord(q, matchingAnchor, false);
  };

  private closeDictionary(updateHistory: boolean = true) {
    this.currentQuery = "";
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Remove active highlights
    const allWords = this.querySelectorAll<HTMLAnchorElement>(
      ".v2-reader-text-panel a.v2-lat-word"
    );
    allWords.forEach((el) => el.classList.remove("v2-word-active"));

    // Clear search input
    const readerInput =
      this.querySelector<HTMLInputElement>(".v2-reader-input");
    if (readerInput) {
      readerInput.value = "";
    }

    // Update split layout class to empty
    const splitLayout = this.querySelector<HTMLElement>(
      ".v2-reader-split-layout"
    );
    if (splitLayout) {
      splitLayout.classList.remove("v2-reader-layout-active");
      splitLayout.classList.add("v2-reader-layout-empty");
    }

    // Update mobile teaser label
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
    if (sheetLabel) {
      sheetLabel.textContent = "Tap any word to view definitions";
    }

    // Remove close button from teaser if present
    const teaserClose = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-teaser .v2-reader-sheet-close"
    );
    if (teaserClose) {
      teaserClose.remove();
    }

    // Show empty state in results
    if (this.resultsElement) {
      this.resultsElement.innerHTML = `
        <div class="v2-reader-empty-state">
          <p class="v2-reader-empty-title">Select a word to view definitions</p>
          <p class="v2-reader-empty-desc">
            Click or tap any word in the text on the left to inspect its lexical entries,
            inflections, and translations.
          </p>
        </div>
      `;
    }

    if (updateHistory) {
      window.history.pushState({}, "", "/v2/reader");
      document.title = "Latin Reader - Morcus Latin Tools";
    }
  }

  private async lookupWord(
    word: string,
    activeAnchor?: HTMLElement,
    updateHistory: boolean = true
  ) {
    if (!word) return;
    this.currentQuery = word;

    // Update active highlight in the text
    const allWords = this.querySelectorAll<HTMLAnchorElement>(
      ".v2-reader-text-panel a.v2-lat-word"
    );
    allWords.forEach((el) => el.classList.remove("v2-word-active"));
    if (activeAnchor) {
      activeAnchor.classList.add("v2-word-active");
    } else {
      for (const a of allWords) {
        const aHref = a.getAttribute("href") || "";
        if (aHref.includes(`q=${encodeURIComponent(word)}`)) {
          a.classList.add("v2-word-active");
          break;
        }
      }
    }

    // Update reader search input value
    const readerInput =
      this.querySelector<HTMLInputElement>(".v2-reader-input");
    if (readerInput && readerInput.value !== word) {
      readerInput.value = word;
    }

    // Update split layout class to active (expands mobile sheet)
    const splitLayout = this.querySelector<HTMLElement>(
      ".v2-reader-split-layout"
    );
    if (splitLayout) {
      splitLayout.classList.remove("v2-reader-layout-empty");
      splitLayout.classList.add("v2-reader-layout-active");
    }

    // Update mobile teaser bar label and ensure close button is present
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
    if (sheetLabel) {
      sheetLabel.innerHTML = `Definitions for <strong>${word}</strong>`;
    }
    const sheetTeaser = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-teaser"
    );
    if (sheetTeaser && !sheetTeaser.querySelector(".v2-reader-sheet-close")) {
      const closeBtn = document.createElement("a");
      closeBtn.href = "/v2/reader";
      closeBtn.className = "v2-reader-sheet-close";
      closeBtn.setAttribute("aria-label", "Close dictionary panel");
      closeBtn.title = "Close";
      closeBtn.textContent = "✕";
      sheetTeaser.appendChild(closeBtn);
    }

    // Synchronize browser history and page title
    if (updateHistory) {
      const newUrl = `/v2/reader?q=${encodeURIComponent(word)}`;
      window.history.pushState({ q: word }, "", newUrl);
      document.title = `${word} - Latin Reader - Morcus Latin Tools`;
    }

    if (!this.resultsElement) return;

    // Cancel in-flight requests
    if (this.abortController) {
      this.abortController.abort();
    }
    const controller = new AbortController();
    this.abortController = controller;

    this.resultsElement.style.opacity = "0.45";

    try {
      const url = `/v2/dicts?q=${encodeURIComponent(word)}&format=partial`;
      const res = await fetch(url, {
        headers: { "X-Requested-With": "fetch" },
        signal: controller.signal,
      });

      if (res.ok) {
        const partialHtml = await res.text();
        const range = document.createRange();
        range.selectNodeContents(this.resultsElement);
        const fragment = range.createContextualFragment(partialHtml);
        this.resultsElement.replaceChildren(fragment);

        // Reset dictionary scroll to top on desktop, or scroll into view on mobile
        const dictPanel = this.querySelector<HTMLElement>(
          ".v2-reader-dict-panel"
        );
        if (dictPanel && window.innerWidth > 960) {
          dictPanel.scrollTo({ top: 0, behavior: "instant" });
        } else if (window.innerWidth <= 960) {
          dictPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else {
        const errorDiv = document.createElement("div");
        errorDiv.className = "v2-no-results";
        const p = document.createElement("p");
        p.textContent = `Error loading dictionary entry for "${word}".`;
        errorDiv.appendChild(p);
        this.resultsElement.replaceChildren(errorDiv);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        console.error("Failed to load reader dictionary entry:", e);
        const errorDiv = document.createElement("div");
        errorDiv.className = "v2-no-results";
        const p = document.createElement("p");
        p.textContent = "Network error loading dictionary results.";
        errorDiv.appendChild(p);
        this.resultsElement?.replaceChildren(errorDiv);
      }
    } finally {
      if (this.resultsElement) {
        this.resultsElement.style.opacity = "1";
      }
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  }
}

if (!customElements.get("morcus-reader-view")) {
  customElements.define("morcus-reader-view", MorcusReaderView);
}

declare global {
  interface HTMLElementTagNameMap {
    "morcus-reader-view": MorcusReaderView;
  }
}
