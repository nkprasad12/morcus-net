import { BaseElement, registerElement } from "@/web/v2/core/index.client";
import type { CompletionItem } from "@/web/v2/dict/dict_completions.common";

/**
 * Lightweight native Web Component for rendering dictionary autocomplete suggestions.
 */
export class MorcusDictSuggestions extends BaseElement {
  private _items: CompletionItem[] = [];
  private _activeIndex: number = -1;
  private _listEl: HTMLUListElement | null = null;

  public get listEl(): HTMLUListElement {
    if (!this._listEl) {
      const first = this.firstElementChild;
      if (first instanceof HTMLUListElement) {
        this._listEl = first;
      } else {
        this._listEl = document.createElement("ul");
        this._listEl.className = "suggestions";
        this._listEl.id = "dict-suggestions-list";
        this._listEl.setAttribute("role", "listbox");
      }
    }
    return this._listEl;
  }

  protected override onConnect() {
    const list = this.listEl;
    if (!this.contains(list)) {
      this.appendChild(list);
    }

    // Event delegation on container: avoids creating closure listeners for each item
    this.scope.delegate<HTMLElement>(
      this.listEl,
      "mousedown",
      ".suggestion-item",
      (e, target) => {
        if (target.dataset.word) {
          // Keeps input focus; emits suggestion-select
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
        item.setAttribute("aria-selected", String(isActive));
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
      li.id = `dict-suggestion-${idx}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(idx === this._activeIndex));
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

declare module "@/web/v2/core/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-suggestions": MorcusDictSuggestions;
  }
}
