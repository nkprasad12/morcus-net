import { BaseElement, registerElement } from "@/web/ui/core/index.client";
import {
  type ModalDialogHandle,
  setupModalDialog,
} from "@/web/ui/core/widgets/dialog.client";
import {
  applyAppearance,
  appearanceStore,
  appearanceToSettings,
  resolveAppearance,
  TEXT_SCALE,
  type Appearance,
  type ThemeChoice,
} from "@/web/ui/shell/appearance.client";
import { isLineSpacing, isTextFont } from "@/web/ui/core/state/settings.client";
import { THEME_COLOR } from "@/web/ui/shell/theme_color.common";
import { OPEN_APPEARANCE_EVENT } from "@/web/ui/shell/appearance_events.common";

function isThemeChoice(x: unknown): x is ThemeChoice {
  return x === "system" || x === "light" || x === "dark";
}

/**
 * The app-bar Appearance menu (`appearance_menu.server.ts`): owner of the
 * appearance preferences (`appearance.client.ts`), including the theme, so it
 * replaces the old one-button theme toggle.
 *
 * On every connect it re-applies the saved appearance, which also heals a
 * stale pre-paint snapshot. Every change applies live and is saved at once.
 */
class MorcusAppearanceMenu extends BaseElement {
  #appearance: Appearance = resolveAppearance({});
  #modal: ModalDialogHandle | null = null;

  get #panel() {
    return this.scope.$<HTMLDialogElement>("#appearance-popover");
  }

  public isOpen(): boolean {
    return this.#panel?.open ?? false;
  }

  public open(): void {
    if (this.#panel && !this.#panel.open) this.#modal?.open();
  }

  public close(): void {
    if (this.#panel?.open) this.#modal?.close();
  }

  protected override onConnect() {
    this.#appearance = appearanceStore.get();
    applyAppearance(this.#appearance);
    this.#syncControls();
    this.#syncThemeColor();

    // Trigger, close button, backdrop clicks and Escape (setupModalDialog).
    // The panel is centred in the viewport rather than anchored to its
    // trigger: it also opens from the settings dialogs' "Text appearance"
    // links, and on phones the app bar may have scrolled out of view. The
    // page keeps scrolling under it, which a centred panel doesn't mind.
    const panel = this.#panel;
    const trigger = this.scope.$<HTMLButtonElement>("#appearance-btn");
    if (panel) {
      const modal = setupModalDialog(panel, { trigger });
      this.#modal = modal;
      this.scope.use(() => {
        // The native `close` event is async, so reset the trigger here.
        this.close();
        trigger?.setAttribute("aria-expanded", "false");
        modal.dispose();
        this.#modal = null;
      });
    }
    this.scope.listen(this.ownerDocument, OPEN_APPEARANCE_EVENT, () =>
      this.open()
    );

    for (const [name, key] of [
      ["appearance-theme", "theme"],
      ["appearance-font", "textFont"],
      ["appearance-spacing", "lineSpacing"],
    ] as const) {
      for (const radio of this.#radios(name)) {
        this.scope.listen(radio, "change", () => {
          if (!radio.checked) return;
          const value = radio.value;
          if (key === "theme" && isThemeChoice(value)) {
            this.#update({ theme: value });
          } else if (key === "textFont" && isTextFont(value)) {
            this.#update({ textFont: value });
          } else if (key === "lineSpacing" && isLineSpacing(value)) {
            this.#update({ lineSpacing: value });
          }
        });
      }
    }

    for (const [id, delta] of [
      ["#appearance-size-dec", -TEXT_SCALE.step],
      ["#appearance-size-inc", TEXT_SCALE.step],
    ] as const) {
      const btn = this.scope.$<HTMLButtonElement>(id);
      this.scope.listen(btn, "click", () => {
        this.#update({ textScale: this.#appearance.textScale + delta });
      });
    }

    const reset = this.scope.$<HTMLButtonElement>("#appearance-reset-btn");
    this.scope.listen(reset, "click", () => {
      this.#update(resolveAppearance({}));
    });

    // With no saved theme the OS scheme applies; keep the meta tags and the
    // "System" option's meaning in step when it changes.
    if (typeof window.matchMedia === "function") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof mq?.addEventListener === "function") {
        this.scope.listen(mq, "change", () => this.#syncThemeColor());
      }
    }
  }

  /** Saves `patch` and applies it live. */
  #update(patch: Partial<Appearance>) {
    // A round trip through the stored form clamps out-of-range sizes.
    const next = resolveAppearance(
      appearanceToSettings({ ...this.#appearance, ...patch })
    );
    this.#appearance = appearanceStore.set(next);
    applyAppearance(this.#appearance);
    this.#syncControls();
    if ("theme" in patch) this.#syncThemeColor();
  }

  #radios(name: string): HTMLInputElement[] {
    return this.scope.$$<HTMLInputElement>(`input[name="${name}"]`);
  }

  #syncControls() {
    const a = this.#appearance;
    for (const [name, value] of [
      ["appearance-theme", a.theme],
      ["appearance-font", a.textFont],
      ["appearance-spacing", a.lineSpacing],
    ] as const) {
      for (const radio of this.#radios(name)) {
        radio.checked = radio.value === value;
      }
    }
    const sizeLabel = this.scope.$("#appearance-size-label");
    if (sizeLabel) sizeLabel.textContent = `${a.textScale}%`;
    const dec = this.scope.$<HTMLButtonElement>("#appearance-size-dec");
    const inc = this.scope.$<HTMLButtonElement>("#appearance-size-inc");
    if (dec) dec.disabled = a.textScale <= TEXT_SCALE.min;
    if (inc) inc.disabled = a.textScale >= TEXT_SCALE.max;
  }

  /**
   * The server renders one `theme-color` tag per OS scheme (by `media`). A
   * saved theme overrides the OS, so it sets both; "System" leaves each its own.
   */
  #syncThemeColor() {
    const theme = this.#appearance.theme;
    for (const meta of this.ownerDocument.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]'
    )) {
      const media = meta.getAttribute("media") ?? "";
      const dark =
        theme === "system" ? media.includes("dark") : theme === "dark";
      meta.setAttribute("content", THEME_COLOR[dark ? "dark" : "light"]);
    }
  }
}

registerElement("morcus-appearance-menu", MorcusAppearanceMenu);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-appearance-menu": MorcusAppearanceMenu;
  }
}
