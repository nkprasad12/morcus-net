import {
  BaseElement,
  registerElement,
  settingsStore,
} from "@/web/ui/core/index.client";

/**
 * Progressively enhanced custom element for the Greek query Logeion embed.
 *
 * Handles:
 * - Syncing the auto-open Logeion preference with settingsStore.
 * - Auto-opening the <details> element if the preference is enabled.
 */
export class MorcusGreekEmbed extends BaseElement {
  #detailsEl: HTMLDetailsElement | null = null;
  #checkbox: HTMLInputElement | null = null;

  protected override onConnect() {
    this.#detailsEl = this.scope.$<HTMLDetailsElement>(".greek-details");
    this.#checkbox = this.scope.$<HTMLInputElement>(
      ".greek-auto-open-checkbox"
    );

    const isAutoOpen = Boolean(settingsStore.get().autoOpenLogeion);

    if (this.#checkbox) {
      this.#checkbox.checked = isAutoOpen;
      this.scope.listen(this.#checkbox, "change", () => {
        const enabled = Boolean(this.#checkbox?.checked);
        this.#saveAutoOpenPreference(enabled);
        if (enabled && this.#detailsEl && !this.#detailsEl.open) {
          this.#detailsEl.open = true;
        }
      });
    }

    if (this.#detailsEl && isAutoOpen && !this.#detailsEl.open) {
      // The server never renders `open`, so an open disclosure here was
      // opened by the user before upgrade; auto-open only ever adds to that.
      // The auto-open checkbox itself is `data-js-only`, so it can't have
      // been toggled before upgrade.
      this.#detailsEl.open = true;
    }
  }

  #saveAutoOpenPreference(enabled: boolean) {
    settingsStore.update({ autoOpenLogeion: enabled });
  }
}

registerElement("morcus-greek-embed", MorcusGreekEmbed);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-greek-embed": MorcusGreekEmbed;
  }
}
