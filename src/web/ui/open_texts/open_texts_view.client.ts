/**
 * `<morcus-open-texts-view>`: instant, in-place filtering of the server-rendered
 * Open Texts catalog (`/opentexts`, `open_texts.server.ts`).
 *
 * Like `<morcus-library-view>`, it only toggles `hidden` (and `open`, to unfold
 * an author card holding a match) and rewrites a few text nodes: no markup is
 * created, and the URL never changes.
 */

import { BaseElement, registerElement } from "@/web/ui/core/index.client";
import {
  OPEN_TEXTS_CATALOG_ROLES as ROLES,
  countLabel,
} from "@/web/ui/open_texts/open_texts_contract.common";

const PILLS = "[data-source-filter],[data-period-filter]";

/** The pill's filter kind and value. */
function pillFilter(pill: HTMLElement): ["source" | "period", string] {
  const { sourceFilter, periodFilter } = pill.dataset;
  return sourceFilter !== undefined
    ? ["source", sourceFilter]
    : ["period", periodFilter ?? "all"];
}

/** Sets `el`'s text, leaving it alone (no mutation) if it already matches. */
function setText(el: Element | null, text: string) {
  if (el && el.textContent !== text) el.textContent = text;
}

export class MorcusOpenTextsView extends BaseElement {
  #query: string[] = [];
  readonly #filters = { source: "all", period: "all" };

  #role(role: string): HTMLElement | null {
    return this.scope.$(`[data-role="${role}"]`);
  }

  protected override onConnect() {
    const input = this.scope.$<HTMLInputElement>("#open-texts-search-input");
    const readQuery = () => {
      this.#query = (input?.value ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t);
    };
    this.scope.listen(input, "input", () => {
      readQuery();
      this.#apply();
    });
    this.scope.delegate(this, "click", PILLS, (_e, pill) => {
      const [kind, value] = pillFilter(pill);
      this.#filters[kind] = value;
      this.#apply();
    });
    for (const role of [ROLES.reset, ROLES.emptyReset]) {
      this.scope.listen(this.#role(role), "click", () => {
        if (input) input.value = "";
        this.#query = [];
        this.#filters.source = this.#filters.period = "all";
        this.#apply();
        input?.focus();
      });
    }

    // The field is usable before upgrade; adopt anything already typed. The
    // pills are inert until now, so their state is ours (and survives a move).
    readQuery();
    if (this.#isFiltered()) this.#apply();
  }

  #isFiltered(): boolean {
    const { source, period } = this.#filters;
    return this.#query.length > 0 || source !== "all" || period !== "all";
  }

  #apply() {
    const { source, period } = this.#filters;
    for (const pill of this.scope.$$(PILLS)) {
      const [kind, value] = pillFilter(pill);
      const active = this.#filters[kind] === value;
      pill.classList.toggle("active", active);
      pill.setAttribute("aria-pressed", String(active));
    }

    let total = 0;
    let works = 0;
    let authors = 0;
    const filtered = this.#isFiltered();
    for (const group of this.scope.$$<HTMLDetailsElement>(
      ".open-texts-author-group"
    )) {
      // Matched on the author and title as shown, and the volume label.
      const author =
        group.querySelector(".open-texts-author-name")?.textContent ?? "";
      let shown = 0;
      for (const item of Array.from(
        group.querySelectorAll<HTMLElement>(".open-texts-work-item")
      )) {
        total++;
        const { dataset } = item;
        const title = item.querySelector(".open-texts-work-link")?.textContent;
        const text = `${author} ${title} ${dataset.volume}`.toLowerCase();
        const visible =
          (source === "all" || dataset.source === source) &&
          (period === "all" || dataset.period === period) &&
          this.#query.every((t) => text.includes(t));
        item.hidden = !visible;
        if (visible) shown++;
      }
      group.hidden = !shown;
      // Unfold a card the user folded earlier if it holds a match, so a
      // search never reports works it then hides.
      if (filtered && shown && !group.open) group.open = true;
      setText(
        group.querySelector(".open-texts-author-count"),
        countLabel(shown, "work")
      );
      works += shown;
      if (shown) authors++;
    }

    setText(this.#role(ROLES.shownWorks), countLabel(works, "work"));
    setText(this.#role(ROLES.shownAuthors), countLabel(authors, "author"));
    const note = this.#role(ROLES.filteredNote);
    if (note) note.hidden = !filtered || works === total;
    const reset = this.#role(ROLES.reset);
    if (reset) reset.hidden = !filtered;
    const empty = this.scope.$("#open-texts-empty-state");
    if (empty) empty.hidden = works > 0;
  }
}

registerElement("morcus-open-texts-view", MorcusOpenTextsView);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-open-texts-view": MorcusOpenTextsView;
  }
}
