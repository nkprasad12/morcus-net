import { BaseElement, registerElement } from "@/web/v2/core/index.client";

export class MorcusLibraryView extends BaseElement {
  private currentFilter: string = "all";
  private currentQuery: string = "";

  protected override onConnect() {
    const input = this.$<HTMLInputElement>("#v2-library-search-input");
    const emptyResetBtn = this.$<HTMLButtonElement>(
      "#v2-library-reset-filter-btn"
    );

    if (input) {
      this.listen(input, "input", () => {
        this.currentQuery = input.value.trim().toLowerCase();
        this.applyFilter();
      });
    }

    this.listen(this, "click", (e) => {
      if (!(e.target instanceof Element)) return;
      const pill = e.target.closest<HTMLButtonElement>(".v2-filter-pill");
      if (pill) {
        e.preventDefault();
        const filter = pill.dataset.filter || "all";
        this.setFilter(filter);
      }
    });

    if (emptyResetBtn && input) {
      this.listen(emptyResetBtn, "click", () => {
        input.value = "";
        this.currentQuery = "";
        this.setFilter("all");
      });
    }
  }

  protected override onDisconnect() {
    // cleanup
  }

  private setFilter(filter: string) {
    this.currentFilter = filter;
    const pills = this.$$<HTMLButtonElement>(".v2-filter-pill");
    for (const p of pills) {
      if (p.dataset.filter === filter) {
        p.classList.add("active");
      } else {
        p.classList.remove("active");
      }
    }
    this.applyFilter();
  }

  private applyFilter() {
    const cards = this.$$<HTMLElement>(".v2-work-card");
    const sections = this.$$<HTMLElement>(".v2-library-author-section");
    const countBadge = this.$<HTMLElement>("#v2-library-count-badge");
    const emptyState = this.$<HTMLElement>("#v2-library-empty-state");

    let visibleCount = 0;
    const tokens = this.currentQuery.split(/\s+/).filter((t) => t.length > 0);

    for (const card of cards) {
      const author = card.dataset.author || "";
      const title = card.dataset.title || "";
      const tags = (card.dataset.tags || "").split(" ");

      const matchesTag =
        this.currentFilter === "all" || tags.includes(this.currentFilter);
      const matchesQuery =
        tokens.length === 0 ||
        tokens.every((tok) => author.includes(tok) || title.includes(tok));

      const isVisible = matchesTag && matchesQuery;
      card.hidden = !isVisible;
      if (isVisible) visibleCount++;
    }

    // Update author section counts and visibility
    for (const section of sections) {
      const visibleInSec = section.querySelectorAll<HTMLElement>(
        ".v2-work-card:not([hidden])"
      ).length;
      section.hidden = visibleInSec === 0;
      const countEl = section.querySelector<HTMLElement>(
        ".v2-library-author-count"
      );
      if (countEl) {
        countEl.textContent = `${visibleInSec} ${
          visibleInSec === 1 ? "work" : "works"
        }`;
      }
    }

    if (countBadge) {
      countBadge.textContent = `${visibleCount} ${
        visibleCount === 1 ? "work" : "works"
      }`;
    }

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }
}

registerElement("morcus-library-view", MorcusLibraryView);
