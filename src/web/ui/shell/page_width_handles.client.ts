/**
 * Draggable page width handles (`<morcus-page-width>`), rendered by
 * `renderPageShell({ widthSurface })`.
 *
 * Both edges of the centered page column drag symmetrically (width =
 * start ± 2·dx), clamped between the surface minimum and the viewport (less
 * the dictionary's contents rail beside the column), and
 * snap to the old presets and to full width. Double-click, Enter or Esc
 * reset; arrows step {@link KEY_STEP_PX}, Home goes to the minimum, End to
 * full width.
 *
 * While a drag or a key press is in progress, the width is written inline
 * (`setLive`, at most once per frame while dragging): as non-inherited
 * `max-width` on the column and the app bar row, and as `--page-max` only
 * on this element (the handles and gutter tint). The inherited `--page-max`
 * on the column would restyle every element inside it on every frame. The
 * saved width is recorded on `:root` (`--{surface}-page-max`, applied
 * before first paint) only on commit (pointer release, key release, blur,
 * reset): a root custom property restyles the whole page.
 */

import {
  BaseElement,
  registerElement,
} from "@/web/ui/core/dom/base_element.client";
import { trackPointerDrag } from "@/web/ui/core/widgets/gesture.client";
import {
  getSurfaceWidth,
  isWidthSurface,
  resolveSurfaceWidth,
  setSurfaceWidth,
  syncSurfaceWidth,
  WIDTH_SURFACES,
  widthCssValue,
  type WidthSurface,
} from "@/web/ui/core/widgets/page_width.client";
import type { DraggedPageWidth } from "@/web/ui/core/state/settings.client";

export const KEY_STEP_PX = 48;
/** Container width beyond rail + column (dict/toc/dict_toc.css: `+ 40px`). */
const RAIL_GAP_PX = 40;

/**
 * The column's inline `max-width` for a live width (a CSS length).
 *
 * MIRRORS THE CSS: `max-width: var(--page-max)` on `.container`
 * (shell/page_width.css, reader/reader_layout.css) and, on a dictionary
 * entry with the contents rail, `calc(var(--page-max) + var(--dict-toc-w) +
 * 40px)` (dict/toc/dict_toc.css), where shell/page_width.css sets
 * `--page-extra` to exactly `var(--dict-toc-w) + 40px`. Change them
 * together.
 */
export function liveContainerMaxWidth(width: string): string {
  return `calc(${width} + var(--page-extra, 0px))`;
}

/** The readout / `aria-valuetext` for a width. */
export function pageWidthLabel(
  width: DraggedPageWidth | undefined,
  def: number
): string {
  if (width === "full") return "Full width";
  if (width === undefined || width === def) return `Default (${def}px)`;
  return `${width}px`;
}

class MorcusPageWidth extends BaseElement {
  #surface: WidthSurface = "reader";
  #handles: HTMLElement[] = [];
  #appBarRow: HTMLElement | null = null;
  #container: HTMLElement | null = null;
  #readout: HTMLElement | null = null;
  /** A key-stepped width shown live but not yet committed (see keyup). */
  #keyPending: DraggedPageWidth | null = null;

  protected override onConnect(): void {
    const surface = this.dataset.surface;
    if (!isWidthSurface(surface)) return;
    this.#surface = surface;
    syncSurfaceWidth(surface);

    this.#handles = Array.from(
      this.querySelectorAll<HTMLElement>(".page-handle")
    );
    this.#readout = this.querySelector<HTMLElement>(".page-width-readout");
    this.#appBarRow = document.querySelector<HTMLElement>(".app-bar-inner");
    this.#container = document.querySelector<HTMLElement>(".container");
    this.#updateAria(getSurfaceWidth(surface));

    for (const handle of this.#handles) this.#bindHandle(handle);
    // The column and app bar row are outside this element: if it goes away
    // mid-drag or mid-key-step (no release, keyup or blur will arrive), drop
    // the uncommitted inline width rather than leave it on them.
    this.scope.use(() => {
      this.#keyPending = null;
      this.#setLive(null);
    });
  }

  get #config() {
    return WIDTH_SURFACES[this.#surface];
  }

  #viewportWidth(): number {
    return document.documentElement.clientWidth;
  }

  /**
   * How much wider the container is than the reading column: the
   * dictionary's contents rail plus its gap when the rail shows beside the
   * column (dict/toc/dict_toc.css), else 0. Reads layout.
   */
  #railExtra(): number {
    // The rail is sticky only in its desktop beside-the-column mode.
    const rail = this.#container?.querySelector<HTMLElement>(
      ".results-layout.has-toc .drawer-toc"
    );
    return rail && getComputedStyle(rail).position === "sticky"
      ? rail.getBoundingClientRect().width + RAIL_GAP_PX
      : 0;
  }

  /**
   * The widest the reading column can get: the viewport, less the rail
   * beside it. Widths are clamped to this and snap to `"full"` near it, so a
   * key step or drag past it doesn't stall at a width the column can't
   * reach. Reads layout, so never call it mid-drag.
   */
  #maxWidth(): number {
    return this.#viewportWidth() - this.#railExtra();
  }

  /**
   * The reading column's current width; reads layout, so never call it
   * mid-drag. The rail's extra (see {@link #railExtra}) is subtracted from the
   * container, so the saved width is always the column's.
   */
  #measureWidth(): number {
    const container = this.#container;
    if (!container) return this.#config.def;
    return (
      container.getBoundingClientRect().width - this.#railExtra() ||
      this.#config.def
    );
  }

  /** Commits a pending key-stepped width, if any. */
  #flushKeys(): void {
    const pending = this.#keyPending;
    if (pending === null) return;
    this.#commit(pending);
  }

  #bindHandle(handle: HTMLElement): void {
    // The arrow (or drag direction) pointing away from the column grows it.
    const sign = handle.dataset.side === "left" ? -1 : 1;
    let startWidth = 0;
    let max = 0;
    let pending: DraggedPageWidth | null = null;
    let frame = 0;
    let readoutX = 0;
    let readoutY = 0;

    const paint = () => {
      frame = 0;
      if (pending === null) return;
      this.#setLive(pending);
      this.#updateAria(pending, max);
      if (this.#readout) {
        this.#readout.textContent = pageWidthLabel(pending, this.#config.def);
        this.#readout.style.transform = `translate(${readoutX}px, ${readoutY}px)`;
      }
    };

    this.scope.use(
      trackPointerDrag(handle, {
        handleActiveClass: "is-resizing",
        bodyActiveClass: "resizing-page",
        // Measured once: onMove writes the width, so reading it per move
        // would force a synchronous layout on every pointer event.
        onStart: () => {
          this.#flushKeys();
          startWidth = this.#measureWidth();
          max = this.#maxWidth();
          pending = null;
          this.#updateAria(getSurfaceWidth(this.#surface), max);
        },
        onMove: ({ dx, currentX, currentY }) => {
          pending = resolveSurfaceWidth(
            startWidth + 2 * sign * dx,
            this.#config,
            max
          );
          readoutX = currentX + 14;
          readoutY = currentY - 10;
          // Scope-managed, so a frame queued before a disconnect never runs.
          if (!frame) frame = this.scope.rAF(paint);
        },
        onEnd: ({ isCancelled }) => {
          // A queued frame finds `pending` cleared and does nothing.
          const committed = pending;
          pending = null;
          if (committed === null || isCancelled) {
            this.#setLive(null);
            return;
          }
          this.#commit(committed, max);
        },
      })
    );

    this.scope.listen(handle, "dblclick", () => this.#commit(undefined));
    // The saved width can change outside a drag (another tab, Reset).
    this.scope.listen(handle, "focus", () =>
      this.#updateAria(getSurfaceWidth(this.#surface))
    );
    this.scope.listen(handle, "keydown", (e: KeyboardEvent) => {
      let next: DraggedPageWidth | undefined | null = null;
      const keyMax = this.#maxWidth();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const step = (e.key === "ArrowRight" ? 1 : -1) * sign * KEY_STEP_PX;
        next = resolveSurfaceWidth(
          this.#measureWidth() + step,
          this.#config,
          keyMax
        );
      } else if (e.key === "Home") {
        next = this.#config.min;
      } else if (e.key === "End") {
        next = "full";
      } else if (e.key === "Enter" || e.key === "Escape") {
        next = undefined;
      } else {
        return;
      }
      // Keys on the separator it owns resize the page instead of scrolling.
      e.preventDefault();
      if (next === undefined) {
        // Resets commit at once (commit drops any pending step).
        this.#commit(undefined, keyMax);
        return;
      }
      // Steps paint inline only; a held arrow key would otherwise rewrite
      // :root (a whole-document restyle) on every repeat. Committed on
      // keyup, or on blur if the keyup never arrives.
      this.#keyPending = next;
      this.#setLive(next);
      this.#updateAria(next, keyMax);
    });
    this.scope.listen(handle, "keyup", () => this.#flushKeys());
    this.scope.listen(handle, "blur", () => this.#flushKeys());
  }

  /**
   * Writes (or clears) the in-progress width inline: non-inherited
   * `max-width` on the column and the app bar row, so only they restyle,
   * and `--page-max` on this element, which positions the handles and the
   * gutter tint.
   *
   * MIRRORS THE CSS: the `max-width` values must match the rules they
   * override (see {@link liveContainerMaxWidth}; the app bar row is
   * `max-width: var(--page-max)` in shell/page_width.css and
   * reader/reader_layout.css). Change them together.
   */
  #setLive(width: DraggedPageWidth | null): void {
    const value = width === null ? null : widthCssValue(width);
    if (value === null) {
      this.style.removeProperty("--page-max");
      this.#appBarRow?.style.removeProperty("max-width");
      this.#container?.style.removeProperty("max-width");
      return;
    }
    this.style.setProperty("--page-max", value);
    this.#appBarRow?.style.setProperty("max-width", value);
    this.#container?.style.setProperty(
      "max-width",
      liveContainerMaxWidth(value)
    );
  }

  /**
   * Saves `width` (`undefined` = default) and records it for pre-paint. Any
   * commit (release, reset, double-click) supersedes a pending key step.
   */
  #commit(width: DraggedPageWidth | undefined, max = this.#maxWidth()): void {
    this.#keyPending = null;
    // Record on :root first, then drop the inline values, so the column
    // never flashes back to the old width in between.
    setSurfaceWidth(this.#surface, width);
    this.#setLive(null);
    this.#updateAria(getSurfaceWidth(this.#surface), max);
  }

  #updateAria(
    width: DraggedPageWidth | undefined,
    max = this.#maxWidth()
  ): void {
    const { def, min } = this.#config;
    // aria-valuemin is static (server-rendered).
    const now = width === "full" ? max : width ?? def;
    const text = pageWidthLabel(width, def);
    for (const handle of this.#handles) {
      handle.setAttribute("aria-valuemax", String(Math.max(min, max)));
      handle.setAttribute("aria-valuenow", String(Math.round(now)));
      handle.setAttribute("aria-valuetext", text);
    }
  }
}

registerElement("morcus-page-width", MorcusPageWidth);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-page-width": MorcusPageWidth;
  }
}
