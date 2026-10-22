import {
  BaseElement,
  registerElement,
  setHtml,
  html,
} from "@/web/ui/core/index.client";
import { savedSpotsStore } from "@/web/ui/reader/saved_spots.client";

export class MorcusLibraryView extends BaseElement {
  #currentFilter: string = "all";
  #currentQuery: string = "";

  // Read in more than one place; a getter re-queries rather than caches.
  get #workCards() {
    return this.scope.$$<HTMLAnchorElement>(".work-card");
  }

  protected override onConnect() {
    this.#hydrateSavedSpots();

    const input = this.scope.$<HTMLInputElement>("#library-search-input");
    const emptyResetBtn = this.scope.$<HTMLButtonElement>(
      "#library-reset-filter-btn"
    );

    if (input) {
      this.scope.listen(input, "input", () => {
        this.#currentQuery = input.value.trim().toLowerCase();
        this.#applyFilter();
      });
      // The input is usable before upgrade; apply anything already typed.
      this.#currentQuery = input.value.trim().toLowerCase();
      if (this.#currentQuery) {
        this.#applyFilter();
      }
    }

    this.scope.delegate<HTMLButtonElement>(
      this,
      "click",
      ".filter-pill",
      (e, pill) => {
        // Our filter pills; setFilter() filters in place
        e.preventDefault();
        const filter = pill.dataset.filter || "all";
        this.#setFilter(filter);
      }
    );

    if (emptyResetBtn && input) {
      this.scope.listen(emptyResetBtn, "click", () => {
        input.value = "";
        this.#currentQuery = "";
        this.#setFilter("all");
      });
    }
  }

  #setFilter(filter: string) {
    this.#currentFilter = filter;
    const pills = this.scope.$$<HTMLButtonElement>(".filter-pill");
    for (const p of pills) {
      if (p.dataset.filter === filter) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    }
    this.#applyFilter();
  }

  #applyFilter() {
    const cards = this.#workCards;
    const emptyState = this.scope.$<HTMLElement>("#library-empty-state");

    let visibleCount = 0;
    const tokens = this.#currentQuery.split(/\s+/).filter((t) => t.length > 0);

    for (const card of cards) {
      const author = card.dataset.author || "";
      const title = card.dataset.title || "";
      const tags = (card.dataset.tags || "").split(" ");

      const matchesTag =
        this.#currentFilter === "all" || tags.includes(this.#currentFilter);
      const matchesQuery =
        tokens.length === 0 ||
        tokens.every((tok) => author.includes(tok) || title.includes(tok));

      const isVisible = matchesTag && matchesQuery;
      // The card's wrapper is the grid item (see library.server.ts).
      (card.parentElement ?? card).hidden = !isVisible;
      if (isVisible) visibleCount++;
    }

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }

  #hydrateSavedSpots(): void {
    const spots = savedSpotsStore.getAll();
    const cards = this.#workCards;
    for (const card of cards) {
      const workId = card.dataset.workId || card.getAttribute("data-work-id");
      if (!workId) continue;
      const spot = spots[workId];
      if (!spot || !spot.sectionId) continue;

      const secId = spot.sectionId;
      // A spot on the first page links where the card already goes.
      if (secId === card.dataset.firstPage) continue;

      const baseUrl =
        card.dataset.readerUrl ||
        card.getAttribute("data-reader-url") ||
        card.getAttribute("href") ||
        "";

      // Update card href to jump directly to saved spot
      const jumpUrl = `${baseUrl}?jump=${encodeURIComponent(
        secId
      )}#sec-${secId}`;
      card.setAttribute("href", jumpUrl);

      // Built on demand for the few cards with a saved spot in localStorage
      // rather than pre-rendered hidden on all 126 cards (no server state to
      // drift from). It sits beside the link in the card's wrapper, since its
      // clear button can't go inside the link.
      const host = card.parentElement ?? card;
      let tag = host.querySelector<HTMLElement>(".work-card-corner-tag");
      if (!tag) {
        tag = document.createElement("div");
        tag.className = "work-card-corner-tag";
        host.append(tag);
      }
      // No title on the badge: it lets clicks through to the card (CSS), so it
      // never gets hovered, and its clear button would inherit it.
      setHtml(
        tag,
        html`<span class="badge badge-resume"
          >&sect;&nbsp;${secId} <span class="resume-label">saved</span
          ><button
            type="button"
            class="work-card-clear-spot"
            aria-label="Clear saved spot (§ ${secId})"
            title="Clear saved spot">
            &times;
          </button></span
        >`
      );
      const clear = tag.querySelector<HTMLButtonElement>(
        ".work-card-clear-spot"
      );
      this.scope.listen(clear, "click", () => {
        savedSpotsStore.remove(workId);
        card.setAttribute("href", baseUrl);
        tag.remove();
        // The button is gone; keep keyboard focus on the card.
        card.focus();
      });
    }
  }
}

registerElement("morcus-library-view", MorcusLibraryView);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-library-view": MorcusLibraryView;
  }
}
