import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Progressively enhanced dictionary card wrapper.
 * Provides client-side helpers like Expand All / Collapse All and remembering states.
 */
@customElement("morcus-dict-entry")
export class MorcusDictEntry extends LitElement {
  override createRenderRoot() {
    return this;
  }

  override connectedCallback() {
    super.connectedCallback();
  }

  override render() {
    return html`<slot></slot>`;
  }
}
