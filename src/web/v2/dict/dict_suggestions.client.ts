import {
  BaseElement,
  ComboboxController,
  registerElement,
} from "@/web/v2/core/index.client";
import type { CompletionItem } from "@/web/v2/dict/dict_completions.common";

/**
 * Lightweight native Web Component for rendering dictionary autocomplete suggestions.
 * Owns `ComboboxController` for input ARIA, keyboard navigation, and selection.
 */
export class MorcusDictSuggestions extends BaseElement {
  private _listEl: HTMLUListElement | null = null;
  private combobox: ComboboxController<CompletionItem> | null = null;

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

    if (!this.combobox) {
      this.combobox = new ComboboxController<CompletionItem>({
        root: this,
        getInput: () =>
          this.parentElement?.querySelector<HTMLInputElement>("input") ?? null,
        getListbox: () => this.listEl,
        acceptOnTab: false,
        renderItems: (items, box) => {
          this.style.display = items.length > 0 ? "" : "none";
          if (items.length === 0) {
            box.replaceChildren();
            return;
          }
          const fragment = document.createDocumentFragment();
          for (const item of items) {
            const li = document.createElement("li");
            li.className = "suggestion-item";
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
          }
          box.replaceChildren(fragment);
        },
        onSelect: (item) => {
          this.emit("suggestion-select", { word: item.word });
        },
      });
      this.addController(this.combobox);
    }
  }

  get items(): readonly CompletionItem[] {
    return this.combobox?.items ?? [];
  }

  set items(val: readonly CompletionItem[]) {
    this.combobox?.setItems(Array.isArray(val) ? val : []);
  }
}

registerElement("morcus-dict-suggestions", MorcusDictSuggestions);

declare module "@/web/v2/core/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-suggestions": MorcusDictSuggestions;
  }
}
