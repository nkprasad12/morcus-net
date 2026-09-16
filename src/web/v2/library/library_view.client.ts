import {
  BaseElement,
  registerElement,
  setHtml,
  html,
} from "@/web/v2/core/index.client";
import { savedSpotsStore } from "@/web/v2/reader/saved_spots.client";

export class MorcusLibraryView extends BaseElement {
  private currentFilter: string = "all";
  private currentQuery: string = "";

  protected override onConnect() {
    this.hydrateSavedSpots();

    const input = this.$<HTMLInputElement>("#library-search-input");
    const emptyResetBtn = this.$<HTMLButtonElement>(
      "#library-reset-filter-btn"
    );

    if (input) {
      this.listen(input, "input", () => {
        this.currentQuery = input.value.trim().toLowerCase();
        this.applyFilter();
      });
    }

    this.listen(this, "click", (e) => {
      if (!(e.target instanceof Element)) return;
      const pill = e.target.closest<HTMLButtonElement>(".filter-pill");
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
    const pills = this.$$<HTMLButtonElement>(".filter-pill");
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
    const cards = this.$$<HTMLElement>(".work-card");
    const emptyState = this.$<HTMLElement>("#library-empty-state");

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

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }

  private hydrateSavedSpots(): void {
    const spots = savedSpotsStore.getAll();
    const cards = this.$$<HTMLAnchorElement>(".work-card");
    for (const card of cards) {
      const workId = card.dataset.workId || card.getAttribute("data-work-id");
      if (!workId) continue;
      const spot = spots[workId];
      if (!spot || !spot.sectionId) continue;

      const secId = spot.sectionId;
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

      // Add or update the corner tag
      let tag = card.querySelector<HTMLElement>(".work-card-corner-tag");
      if (!tag) {
        tag = document.createElement("div");
        tag.className = "work-card-corner-tag";
        card.prepend(tag);
      }
      setHtml(
        tag,
        html`<span
          class="badge badge-resume"
          title="Resume at section ${secId}">
          &sect;&nbsp;${secId}
          <span class="resume-label">saved</span>
        </span>`
      );
    }
  }
}

registerElement("morcus-library-view", MorcusLibraryView);
