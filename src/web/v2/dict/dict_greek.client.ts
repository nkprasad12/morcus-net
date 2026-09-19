import {
  BaseElement,
  registerElement,
  settingsStore,
  storage,
} from "@/web/v2/core/index.client";
import { EMBEDDED_LOGEION_SETTING_KEY } from "@/web/v2/dict/dict_greek.common";

/**
 * Progressively enhanced custom element for the Greek query Logeion embed.
 *
 * Handles:
 * - Syncing the "Automatically open embedded Logeion searches" preference with localStorage.
 * - Auto-opening the <details> element if the preference is enabled.
 * - Updating the toggle button text ("Open Logeion Embed" <-> "Close Logeion Embed") on disclosure change.
 */
export class MorcusGreekEmbed extends BaseElement {
  private detailsEl: HTMLDetailsElement | null = null;
  private toggleText: HTMLElement | null = null;
  private toggleIcon: HTMLElement | null = null;
  private checkbox: HTMLInputElement | null = null;

  protected override onConnect() {
    this.detailsEl = this.scope.$<HTMLDetailsElement>(".greek-details");
    this.toggleText = this.scope.$<HTMLElement>(".greek-toggle-text");
    this.toggleIcon = this.scope.$<HTMLElement>(".greek-toggle-icon");
    this.checkbox = this.scope.$<HTMLInputElement>(".greek-auto-open-checkbox");

    const isAutoOpen = this.getAutoOpenPreference();

    if (this.checkbox) {
      this.checkbox.checked = isAutoOpen;
      this.scope.listen(this.checkbox, "change", () => {
        const enabled = Boolean(this.checkbox?.checked);
        this.saveAutoOpenPreference(enabled);
        if (enabled && this.detailsEl && !this.detailsEl.open) {
          this.detailsEl.open = true;
          this.updateToggleState(true);
        }
      });
    }

    if (this.detailsEl) {
      if (isAutoOpen && !this.detailsEl.open) {
        this.detailsEl.open = true;
      }
      this.updateToggleState(this.detailsEl.open);

      this.scope.listen(this.detailsEl, "toggle", () => {
        this.updateToggleState(Boolean(this.detailsEl?.open));
      });
    }
  }

  private updateToggleState(isOpen: boolean) {
    if (this.toggleText) {
      this.toggleText.textContent = isOpen
        ? "Close Logeion Embed"
        : "Open Logeion Embed";
    }
    if (this.toggleIcon) {
      // The literal glyphs rather than &#x25BE; / &#x25B8;, so this can be
      // textContent: no markup, no HTML sink.
      this.toggleIcon.textContent = isOpen ? "▾" : "▸";
    }
  }

  private getAutoOpenPreference(): boolean {
    const stored = storage.get(EMBEDDED_LOGEION_SETTING_KEY);
    if (stored !== null) {
      return stored === "true";
    }
    const globalSettings = settingsStore.get();
    return Boolean(globalSettings.autoOpenLogeion);
  }

  private saveAutoOpenPreference(enabled: boolean) {
    storage.setBoolean(EMBEDDED_LOGEION_SETTING_KEY, enabled);
    settingsStore.update({ autoOpenLogeion: enabled });
  }
}

registerElement("morcus-greek-embed", MorcusGreekEmbed);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-greek-embed": MorcusGreekEmbed;
  }
}
