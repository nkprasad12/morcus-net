import {
  BaseElement,
  ICON_BOOKMARK,
  ICON_CLOSE,
  registerElement,
  setHtml,
  html,
} from "@/web/ui/core/index.client";
import { savedSpotsStore } from "@/web/ui/reader/saved_spots.client";

export class MorcusLibraryView extends BaseElement {
  #currentFilter: string = "all";
  #currentQuery: string = "";
  /** Lowercased visible author and title, read once per card. */
  readonly #searchText = new WeakMap<
    HTMLAnchorElement,
    { author: string; title: string }
  >();

  // Read in more than one place; a getter re-queries rather than caches.
  get #workCards() {
    return this.scope.$$<HTMLAnchorElement>(".work-card");
  }

  /**
   * The card's author and title as the user sees them, for filtering. The
   * server doesn't duplicate them into attributes; the saved-spot badge sits
   * in the wrapper, outside these spans, so it never leaks into the text.
   */
  #textOf(card: HTMLAnchorElement): { author: string; title: string } {
    let text = this.#searchText.get(card);
    if (!text) {
      const read = (sel: string) =>
        (card.querySelector(sel)?.textContent ?? "").trim().toLowerCase();
      text = {
        author: read(".work-card-author"),
        title: read(".work-card-title"),
      };
      this.#searchText.set(card, text);
    }
    return text;
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
      const { author, title } = this.#textOf(card);
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

  /**
   * Shows the "In progress" pill while any card has a saved spot (its
   * `progress` tag); with none left, leaves that filter for "All".
   */
  #syncProgressPill(): void {
    const pill = this.scope.$<HTMLElement>('[data-filter="progress"]');
    const any = this.#workCards.some((c) =>
      c.dataset.tags?.includes("progress")
    );
    if (pill) pill.hidden = !any;
    if (!any && this.#currentFilter === "progress") this.#setFilter("all");
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

      // The card's own URL, without any jump a previous connect added: this
      // can run again when the element is moved, and reader URLs carry no
      // query or fragment of their own.
      const baseUrl = (card.getAttribute("href") || "").split(/[?#]/)[0];

      // Update card href to jump directly to saved spot
      const jumpUrl = `${baseUrl}?jump=${encodeURIComponent(
        secId
      )}#sec-${secId}`;
      card.setAttribute("href", jumpUrl);
      const tags = (card.dataset.tags || "").split(" ");
      if (!tags.includes("progress")) {
        card.dataset.tags = [...tags, "progress"].join(" ");
      }

      // Built on demand for the few cards with a saved spot in localStorage
      // rather than pre-rendered hidden on all 126 cards (no server state to
      // drift from). It sits in the top-right corner tag beside the link (at
      // the outer right edge, after any edition badges), since its clear
      // button can't go inside the link.
      const host = card.parentElement ?? card;
      const tag = host.querySelector<HTMLElement>(".work-card-corner-tag");
      if (!tag) continue;
      let resume = tag.querySelector<HTMLElement>(".badge-resume");
      if (!resume) {
        resume = document.createElement("span");
        resume.className = "badge badge-resume";
        tag.append(resume);
      }
      // No title on the badge: it lets clicks through to the card (CSS), so it
      // never gets hovered, and its clear button would inherit it.
      setHtml(
        resume,
        html`<svg
            viewBox="4 2 16 20"
            width="9"
            height="10.5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            aria-hidden="true">
            <path d="${ICON_BOOKMARK}" /></svg
          ><span>${secId}</span
          ><button
            type="button"
            class="work-card-clear-spot"
            aria-label="Clear saved spot (§ ${secId})"
            title="Clear saved spot">
            <svg
              viewBox="3 3 18 18"
              width="8.5"
              height="8.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true">
              <path d="${ICON_CLOSE}" />
            </svg>
          </button>`
      );
      const clear = resume.querySelector<HTMLButtonElement>(
        ".work-card-clear-spot"
      );
      this.scope.listen(clear, "click", () => {
        savedSpotsStore.remove(workId);
        card.setAttribute("href", baseUrl);
        card.dataset.tags = (card.dataset.tags || "")
          .split(" ")
          .filter((t) => t !== "progress")
          .join(" ");
        resume.remove();
        this.#syncProgressPill();
        this.#applyFilter();
        // The button is gone; keep keyboard focus on the card.
        card.focus();
      });
    }
    this.#syncProgressPill();
  }
}

registerElement("morcus-library-view", MorcusLibraryView);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-library-view": MorcusLibraryView;
  }
}
