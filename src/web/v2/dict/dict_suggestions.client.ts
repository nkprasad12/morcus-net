import { BaseElement, registerElement } from "@/web/v2/core/index.client";

/**
 * Lightweight native Web Component for rendering dictionary autocomplete suggestions.
 */
export class MorcusDictSuggestions extends BaseElement {
  private _items: string[] = [];
  private _activeIndex: number = -1;
  private readonly listEl: HTMLUListElement;

  constructor() {
    super();
    this.listEl = document.createElement("ul");
    this.listEl.className = "v2-suggestions";

    // Event delegation on container: avoids creating closure listeners for each item
    this.delegate<HTMLElement>(
      this.listEl,
      "mousedown",
      ".v2-suggestion-item",
      (e, target) => {
        if (target.dataset.word) {
          e.preventDefault();
          this.emit("suggestion-select", { word: target.dataset.word });
        }
      }
    );
  }

  protected override onConnect() {
    if (!this.contains(this.listEl)) {
      this.appendChild(this.listEl);
    }
    this.render();
  }

  get items(): string[] {
    return this._items;
  }

  set items(val: string[]) {
    this._items = Array.isArray(val) ? val : [];
    this.render();
  }

  get activeIndex(): number {
    return this._activeIndex;
  }

  set activeIndex(val: number) {
    this._activeIndex = val;
    this.updateActiveItem();
  }

  private updateActiveItem() {
    const children = this.listEl.children;
    for (let i = 0; i < children.length; i++) {
      const item = children[i];
      if (item instanceof HTMLElement) {
        item.classList.toggle("active", i === this._activeIndex);
      }
    }
  }

  private render() {
    if (this._items.length === 0) {
      this.style.display = "none";
      this.listEl.replaceChildren();
      return;
    }

    this.style.display = "";
    const fragment = document.createDocumentFragment();
    this._items.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = `v2-suggestion-item${
        idx === this._activeIndex ? " active" : ""
      }`;
      li.dataset.word = item;
      li.textContent = item;
      fragment.appendChild(li);
    });

    this.listEl.replaceChildren(fragment);
  }
}

registerElement("morcus-dict-suggestions", MorcusDictSuggestions);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-dict-suggestions": MorcusDictSuggestions;
  }
}
