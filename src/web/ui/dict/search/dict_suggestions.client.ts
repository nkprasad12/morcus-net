import {
  BaseElement,
  ComboboxController,
  registerElement,
} from "@/web/ui/core/index.client";
import type { CompletionItem } from "@/web/ui/dict/search/dict_completions.common";

/**
 * Lightweight native Web Component for rendering dictionary autocomplete suggestions.
 * Owns `ComboboxController` for input ARIA, keyboard navigation, and selection.
 *
 * Adopts the server-rendered listbox (its first child) and the input named by
 * `data-input` (see `renderDictSearchBar`). Without `data-input` it still
 * renders and handles clicks, with no input to make a combobox.
 */
export class MorcusDictSuggestions extends BaseElement {
  #listbox: HTMLUListElement | null = null;
  #combobox: ComboboxController<CompletionItem> | null = null;

  protected override onConnect() {
    const listbox = this.firstElementChild;
    if (!(listbox instanceof HTMLUListElement)) {
      throw new Error("<morcus-dict-suggestions> needs its listbox");
    }
    this.#listbox = listbox;

    if (!this.#combobox) {
      this.#combobox = new ComboboxController<CompletionItem>({
        root: this,
        getInput: () => {
          const input = this.ownerDocument.getElementById(
            this.dataset.input ?? ""
          );
          return input instanceof HTMLInputElement ? input : null;
        },
        getListbox: () => this.#listbox,
        acceptOnTab: false,
        onVisibilityChange: (open) => {
          this.style.display = open ? "" : "none";
        },
        renderItems: (items, box) => {
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
      this.addController(this.#combobox);
    }
  }

  protected override onDisconnect() {
    this.#listbox = null;
  }

  get items(): readonly CompletionItem[] {
    return this.#combobox?.items ?? [];
  }

  set items(val: readonly CompletionItem[]) {
    this.#combobox?.setItems(val);
  }
}

registerElement("morcus-dict-suggestions", MorcusDictSuggestions);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-suggestions": MorcusDictSuggestions;
  }
}
