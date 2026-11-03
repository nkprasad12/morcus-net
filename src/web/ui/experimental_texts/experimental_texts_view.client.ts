/**
 * `<morcus-experimental-texts-view>`: instant, in-place filtering of the server-rendered
 * Experimental Texts catalog (`/experimentalTexts`, `experimental_texts.server.ts`).
 *
 * Like `<morcus-library-view>`, it only toggles `hidden` (and `open`, to unfold
 * an author card holding a match) and rewrites a few text nodes: no markup is
 * created, and the URL never changes.
 */

import { BaseElement, registerElement } from "@/web/ui/core/index.client";
import {
  EXPERIMENTAL_TEXTS_CATALOG_ROLES as ROLES,
  countLabel,
} from "@/web/ui/experimental_texts/experimental_texts_contract.common";

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

/** Sets `el.hidden`, leaving it alone (no mutation) if it already matches. */
function setHidden(el: HTMLElement, hidden: boolean) {
  if (el.hidden !== hidden) el.hidden = hidden;
}

interface IndexedWork {
  readonly el: HTMLElement;
  /** Lowercased text a query is matched against. */
  readonly text: string;
  readonly source: string | undefined;
  readonly period: string | undefined;
}

interface IndexedGroup {
  readonly el: HTMLDetailsElement;
  readonly works: readonly IndexedWork[];
}

export class MorcusExperimentalTextsView extends BaseElement {
  #query: string[] = [];
  readonly #filters = { source: "all", period: "all" };
  /** Built on first filter: the server-rendered list never changes. */
  #index: IndexedGroup[] | undefined = undefined;
  /** Author cards unfolded automatically while filtering, restored when cleared. */
  readonly #autoOpened = new WeakSet<HTMLDetailsElement>();

  #role(role: string): HTMLElement | null {
    return this.scope.$(`[data-role="${role}"]`);
  }

  protected override onConnect() {
    const input = this.scope.$<HTMLInputElement>(
      "#experimental-texts-search-input"
    );
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
    this.scope.listen(this.#role(ROLES.emptyReset), "click", () => {
      if (input) input.value = "";
      this.#query = [];
      this.#filters.source = this.#filters.period = "all";
      this.#apply();
      input?.focus();
    });
    this.scope.listen(this.#role(ROLES.toggleAll), "click", () => {
      this.#toggleAllGroups();
    });
    this.scope.listen(
      this,
      "toggle",
      (e) => {
        if (
          e.target instanceof HTMLDetailsElement &&
          e.target.classList.contains("experimental-texts-author-group")
        ) {
          if (!e.target.open) this.#autoOpened.delete(e.target);
          this.#syncToggleAll();
        }
      },
      { capture: true }
    );

    // The field is usable before upgrade; adopt anything already typed. The
    // pills are inert until now, so their state is ours (and survives a move).
    readQuery();
    if (this.#isFiltered()) this.#apply();
    else this.#syncToggleAll();
  }

  #groups(): HTMLDetailsElement[] {
    return this.#index
      ? this.#index.map((g) => g.el)
      : this.scope.$$<HTMLDetailsElement>(".experimental-texts-author-group");
  }

  #toggleAllGroups() {
    const groups = this.#groups();
    const anyVisibleOpen = groups.some((g) => !g.hidden && g.open);
    const nextOpen = !anyVisibleOpen;
    for (const group of groups) {
      group.open = nextOpen;
      this.#autoOpened.delete(group);
    }
    this.#syncToggleAll();
  }

  #syncToggleAll() {
    const btn = this.#role(ROLES.toggleAll);
    if (!btn) return;
    const visible = this.#groups().filter((g) => !g.hidden);
    setHidden(btn, visible.length === 0);
    setText(btn, visible.some((g) => g.open) ? "Collapse all" : "Expand all");
  }

  #isFiltered(): boolean {
    const { source, period } = this.#filters;
    return this.#query.length > 0 || source !== "all" || period !== "all";
  }

  /**
   * Reads each work's searchable text once. Matched on the author and title
   * as shown, the volume label, and the author's other names (`data-author`:
   * shared ones on the card, a work's own extras on its row).
   */
  #buildIndex(): IndexedGroup[] {
    return this.scope
      .$$<HTMLDetailsElement>(".experimental-texts-author-group")
      .map((group) => {
        const author = `${
          group.querySelector(".experimental-texts-author-name")?.textContent ??
          ""
        } ${group.dataset.author ?? ""}`;
        const works = Array.from(
          group.querySelectorAll<HTMLElement>(".experimental-texts-work-item")
        ).map((el) => {
          const { dataset } = el;
          const title = el.querySelector(
            ".experimental-texts-work-link"
          )?.textContent;
          return {
            el,
            text: `${author} ${dataset.author ?? ""} ${title} ${
              dataset.volume ?? ""
            }`.toLowerCase(),
            source: dataset.source,
            period: dataset.period,
          };
        });
        return { el: group, works };
      });
  }

  #apply() {
    const { source, period } = this.#filters;
    for (const pill of this.scope.$$(PILLS)) {
      const [kind, value] = pillFilter(pill);
      const active = this.#filters[kind] === value;
      pill.classList.toggle("active", active);
      pill.setAttribute("aria-pressed", String(active));
    }

    this.#index ??= this.#buildIndex();
    let works = 0;
    let authors = 0;
    const filtered = this.#isFiltered();
    for (const group of this.#index) {
      let shown = 0;
      for (const work of group.works) {
        const visible =
          (source === "all" || work.source === source) &&
          (period === "all" || work.period === period) &&
          this.#query.every((t) => work.text.includes(t));
        setHidden(work.el, !visible);
        if (visible) shown++;
      }
      setHidden(group.el, !shown);
      // Unfold a card the user folded earlier if it holds a match, so a
      // search never reports works it then hides, and restore it when cleared.
      if (filtered && shown > 0) {
        if (!group.el.open) {
          group.el.open = true;
          this.#autoOpened.add(group.el);
        }
      } else if (this.#autoOpened.has(group.el)) {
        group.el.open = false;
        this.#autoOpened.delete(group.el);
      }
      works += shown;
      if (shown) authors++;
    }

    setText(this.#role(ROLES.shownWorks), countLabel(works, "work"));
    setText(this.#role(ROLES.shownAuthors), countLabel(authors, "author"));
    const empty = this.scope.$("#experimental-texts-empty-state");
    if (empty) empty.hidden = works > 0;
    this.#syncToggleAll();
  }
}

registerElement("morcus-experimental-texts-view", MorcusExperimentalTextsView);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-experimental-texts-view": MorcusExperimentalTextsView;
  }
}
