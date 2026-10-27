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
import {
  isLineSpacing,
  isTextFont,
  TEXT_CONTRASTS,
} from "@/web/ui/core/state/settings.client";
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
  /** The OS scheme, which decides the theme on screen under "System". */
  #darkQuery: MediaQueryList | null = null;

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
    this.#darkQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
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

    // The steppers. Contrast is saved per theme: it edits the one on screen.
    for (const [end, delta] of [
      ["dec", -1],
      ["inc", 1],
    ] as const) {
      this.scope.listen(this.scope.$(`#appearance-size-${end}`), "click", () =>
        this.#update({
          textScale: this.#appearance.textScale + delta * TEXT_SCALE.step,
        })
      );
      this.scope.listen(
        this.scope.$(`#appearance-contrast-${end}`),
        "click",
        () => {
          const key = this.#isDark() ? "contrastDark" : "contrastLight";
          const level =
            TEXT_CONTRASTS[
              TEXT_CONTRASTS.indexOf(this.#appearance[key]) + delta
            ];
          if (level) this.#update({ [key]: level });
        }
      );
    }

    const reset = this.scope.$<HTMLButtonElement>("#appearance-reset-btn");
    this.scope.listen(reset, "click", () => {
      this.#update(resolveAppearance({}));
    });

    // With no saved theme the OS scheme applies; keep the meta tags, the
    // "System" option's meaning and the theme the contrast row edits in step
    // when it changes.
    const mq = this.#darkQuery;
    if (typeof mq?.addEventListener === "function") {
      this.scope.listen(mq, "change", () => {
        this.#syncThemeColor();
        this.#syncControls();
      });
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

  /** Whether the dark theme is on screen: saved, or the OS's under "System". */
  #isDark(): boolean {
    const theme = this.#appearance.theme;
    return theme === "system"
      ? this.#darkQuery?.matches === true
      : theme === "dark";
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
    this.#syncStepper(
      "size",
      `${a.textScale}%`,
      a.textScale <= TEXT_SCALE.min,
      a.textScale >= TEXT_SCALE.max
    );
    const dark = this.#isDark();
    const contrast = dark ? a.contrastDark : a.contrastLight;
    const level = TEXT_CONTRASTS.indexOf(contrast);
    // Capitalized by CSS.
    this.#syncStepper(
      "contrast",
      contrast,
      level <= 0,
      level >= TEXT_CONTRASTS.length - 1
    );
    const note = this.scope.$("#appearance-contrast-note");
    if (note) note.textContent = `For the ${dark ? "dark" : "light"} theme`;
  }

  /** A stepper's value and, at either end of its range, disabled buttons. */
  #syncStepper(name: string, value: string, atMin: boolean, atMax: boolean) {
    const label = this.scope.$(`#appearance-${name}-label`);
    if (label) label.textContent = value;
    const dec = this.scope.$<HTMLButtonElement>(`#appearance-${name}-dec`);
    const inc = this.scope.$<HTMLButtonElement>(`#appearance-${name}-inc`);
    if (dec) dec.disabled = atMin;
    if (inc) inc.disabled = atMax;
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
