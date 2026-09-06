/**
 * Lightweight native Web Component for rendering dictionary autocomplete suggestions.
 */
export class MorcusDictSuggestions extends HTMLElement {
  private _items: string[] = [];
  private _activeIndex: number = -1;
  private readonly listEl: HTMLUListElement;

  constructor() {
    super();
    this.listEl = document.createElement("ul");
    this.listEl.className = "v2-suggestions";

    // Event delegation on the container: avoids creating closure listeners for each item
    this.listEl.addEventListener("mousedown", (e: MouseEvent) => {
      const target =
        e.target instanceof Element
          ? e.target.closest(".v2-suggestion-item")
          : null;
      if (target instanceof HTMLElement && target.dataset.word) {
        e.preventDefault();
        this.dispatchSelect(target.dataset.word);
      }
    });
  }

  connectedCallback() {
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

  private dispatchSelect(word: string) {
    this.dispatchEvent(
      new CustomEvent("suggestion-select", {
        detail: { word },
        bubbles: true,
        composed: true,
      })
    );
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

if (!customElements.get("morcus-dict-suggestions")) {
  customElements.define("morcus-dict-suggestions", MorcusDictSuggestions);
}

declare global {
  interface HTMLElementTagNameMap {
    "morcus-dict-suggestions": MorcusDictSuggestions;
  }
}
