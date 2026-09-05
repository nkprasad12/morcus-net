import { LitElement, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Idiomatic Lit component for rendering dictionary autocomplete suggestions.
 * Uses Lit's fine-grained template diffing and declarative event binding.
 */
@customElement("morcus-dict-suggestions")
export class MorcusDictSuggestions extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ type: Array })
  items: string[] = [];

  @property({ type: Number })
  activeIndex: number = -1;

  private dispatchSelect(word: string) {
    this.dispatchEvent(
      new CustomEvent("suggestion-select", {
        detail: { word },
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    if (this.items.length === 0) {
      return null;
    }

    return html`
      <ul class="pe-suggestions">
        ${this.items.map((item, idx) => {
          const isActive = idx === this.activeIndex;
          return html`
            <li
              class="pe-suggestion-item ${isActive ? "active" : ""}"
              data-word="${item}"
              @mousedown=${(e: MouseEvent) => {
                e.preventDefault();
                this.dispatchSelect(item);
              }}>
              ${item}
            </li>
          `;
        })}
      </ul>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "morcus-dict-suggestions": MorcusDictSuggestions;
  }
}
