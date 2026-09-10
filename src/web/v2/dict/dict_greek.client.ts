import {
  BaseElement,
  registerElement,
  settingsStore,
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
    this.detailsEl = this.$<HTMLDetailsElement>(".v2-greek-details");
    this.toggleText = this.$<HTMLElement>(".v2-greek-toggle-text");
    this.toggleIcon = this.$<HTMLElement>(".v2-greek-toggle-icon");
    this.checkbox = this.$<HTMLInputElement>(".v2-greek-auto-open-checkbox");

    const isAutoOpen = this.getAutoOpenPreference();

    if (this.checkbox) {
      this.checkbox.checked = isAutoOpen;
      this.listen(this.checkbox, "change", () => {
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

      this.listen(this.detailsEl, "toggle", () => {
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
      this.toggleIcon.innerHTML = isOpen ? "&#x25BE;" : "&#x25B8;";
    }
  }

  private getAutoOpenPreference(): boolean {
    try {
      const stored = localStorage.getItem(EMBEDDED_LOGEION_SETTING_KEY);
      if (stored !== null) {
        return stored === "true";
      }
      const globalSettings = settingsStore.get();
      return Boolean(globalSettings.autoOpenLogeion);
    } catch {
      return false;
    }
  }

  private saveAutoOpenPreference(enabled: boolean) {
    try {
      localStorage.setItem(EMBEDDED_LOGEION_SETTING_KEY, String(enabled));
      settingsStore.update({ autoOpenLogeion: enabled });
    } catch (e) {
      console.warn("Could not save Logeion auto-open preference", e);
    }
  }
}

registerElement("morcus-greek-embed", MorcusGreekEmbed);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-greek-embed": MorcusGreekEmbed;
  }
}
