import {
  BaseElement,
  registerElement,
  setupModalDialog,
  type ModalDialogHandle,
} from "@/web/ui/core/index.client";
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

/** The panel's width (px), as in `appearance_menu.css`, and its minimum gap to the viewport edge. */
const PANEL_WIDTH = 300;
const EDGE = 8;

/**
 * The app-bar Appearance menu (`appearance_menu.server.ts`): owner of the
 * appearance preferences (`appearance.client.ts`), including the theme, so it
 * replaces the old one-button theme toggle.
 *
 * On every connect it re-applies the saved appearance, which also heals a
 * stale pre-paint snapshot. Every change applies live and is saved at once,
 * except the highlight slider, which is saved when released.
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
    if (!this.isOpen()) this.#modal?.open();
  }

  public close(): void {
    if (this.isOpen()) this.#modal?.close();
  }

  /**
   * Places the panel under its trigger, right edges aligned, kept inside the
   * viewport. On phones the trigger sits at the left of the app bar, so the
   * clamp is what keeps the panel on screen there.
   */
  #position() {
    const panel = this.#panel;
    const trigger = this.scope.$<HTMLElement>("#appearance-btn");
    if (!panel || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = this.ownerDocument.documentElement.clientWidth;
    const width = Math.min(PANEL_WIDTH, viewport - 2 * EDGE);
    const left = Math.min(
      Math.max(EDGE, rect.right - width),
      viewport - width - EDGE
    );
    panel.style.top = `${Math.round(rect.bottom + 8)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  protected override onConnect() {
    this.#appearance = appearanceStore.get();
    applyAppearance(this.#appearance);
    this.#syncControls();
    this.#syncThemeColor();

    // Trigger, close button, backdrop clicks and Escape (setupModalDialog).
    const panel = this.#panel;
    if (panel) {
      this.#modal = setupModalDialog(panel, {
        trigger: this.scope.$<HTMLButtonElement>("#appearance-btn"),
        onOpen: () => this.#position(),
      });
      this.scope.use(this.#modal);
    }
    this.scope.listen<Event>(this.ownerDocument, OPEN_APPEARANCE_EVENT, () =>
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

    const slider = this.scope.$<HTMLInputElement>("#appearance-highlight");
    this.scope.listen(slider, "input", () => {
      if (slider)
        this.#update({ highlightStrength: Number(slider.value) }, false);
    });
    this.scope.listen(slider, "change", () => {
      if (slider) this.#update({ highlightStrength: Number(slider.value) });
    });

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

  /** Applies `patch` live; with `persist` (the default) also saves it. */
  #update(patch: Partial<Appearance>, persist = true) {
    // A round trip through the stored form clamps out-of-range sizes.
    const next = resolveAppearance(
      appearanceToSettings({ ...this.#appearance, ...patch })
    );
    this.#appearance = persist ? appearanceStore.set(next) : next;
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

    const slider = this.scope.$<HTMLInputElement>("#appearance-highlight");
    if (slider && Number(slider.value) !== a.highlightStrength) {
      slider.value = String(a.highlightStrength);
    }
    const value = this.scope.$("#appearance-highlight-value");
    if (value) value.textContent = `${a.highlightStrength}%`;
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
