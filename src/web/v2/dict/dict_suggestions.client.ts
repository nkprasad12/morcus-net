import { BaseElement, registerElement } from "@/web/v2/core/index.client";
import type { CompletionItem } from "@/web/v2/dict/dict_completions.common";

/**
 * Lightweight native Web Component for rendering dictionary autocomplete suggestions.
 */
export class MorcusDictSuggestions extends BaseElement {
  private _items: CompletionItem[] = [];
  private _activeIndex: number = -1;
  private readonly listEl: HTMLUListElement;

  constructor() {
    super();
    this.listEl = document.createElement("ul");
    this.listEl.className = "suggestions";
  }

  protected override onConnect() {
    if (!this.contains(this.listEl)) {
      this.appendChild(this.listEl);
    }

    // Event delegation on container: avoids creating closure listeners for each item
    this.delegate<HTMLElement>(
      this.listEl,
      "mousedown",
      ".suggestion-item",
      (e, target) => {
        if (target.dataset.word) {
          e.preventDefault();
          this.emit("suggestion-select", { word: target.dataset.word });
        }
      }
    );

    this.render();
  }

  get items(): CompletionItem[] {
    return this._items;
  }

  set items(val: CompletionItem[]) {
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
        const isActive = i === this._activeIndex;
        item.classList.toggle("active", isActive);
        if (isActive) {
          item.scrollIntoView({ block: "nearest" });
        }
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
      li.className = `suggestion-item${
        idx === this._activeIndex ? " active" : ""
      }`;
      li.dataset.word = item.word;

      const chip = document.createElement("span");
      chip.className = `lang-chip lang-chip-${item.lang.toLowerCase()}`;
      chip.textContent = item.lang;

      const wordSpan = document.createElement("span");
      wordSpan.className = "suggestion-word";
      wordSpan.textContent = item.word;

      li.appendChild(chip);
      li.appendChild(wordSpan);
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
