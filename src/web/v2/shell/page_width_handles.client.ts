/**
 * Draggable page width handles (`<morcus-page-width>`), rendered by
 * `renderPageShell({ widthSurface })`.
 *
 * Both edges of the centered page column drag symmetrically (width =
 * start ± 2·dx), clamped between the surface minimum and the viewport, and
 * snap to the old presets and to full width. Double-click, Enter or Esc
 * reset; arrows step {@link KEY_STEP_PX}, Home goes to the minimum, End to
 * full width.
 *
 * During a drag only `--page-max` on the column, the app bar row and this
 * element is written (once per frame). The saved width is recorded on
 * `:root` (`--{surface}-page-max`, applied before first paint) only on
 * commit: a root custom property restyles the whole page.
 */

import {
  BaseElement,
  registerElement,
} from "@/web/v2/core/base_element.client";
import { trackPointerDrag } from "@/web/v2/core/gesture.client";
import {
  getSurfaceWidth,
  isWidthSurface,
  resolveSurfaceWidth,
  setSurfaceWidth,
  syncSurfaceWidth,
  WIDTH_SURFACES,
  widthCssValue,
  type WidthSurface,
} from "@/web/v2/core/page_width.client";
import type { DraggedPageWidth } from "@/web/v2/core/settings.client";

export const KEY_STEP_PX = 48;
/** Container width beyond rail + column (dict/dict_toc.css: `+ 40px`). */
const RAIL_GAP_PX = 40;

/** The readout / `aria-valuetext` for a width. */
export function pageWidthLabel(
  width: DraggedPageWidth | undefined,
  def: number
): string {
  if (width === "full") return "Full width";
  if (width === undefined || width === def) return `Default (${def}px)`;
  return `${width}px`;
}

export class MorcusPageWidth extends BaseElement {
  private surface: WidthSurface = "reader";
  private handles: HTMLElement[] = [];
  /** Elements that get `--page-max` inline while dragging. */
  private liveTargets: HTMLElement[] = [];
  private readout: HTMLElement | null = null;

  protected override onConnect(): void {
    const surface = this.dataset.surface;
    if (!isWidthSurface(surface)) return;
    this.surface = surface;
    syncSurfaceWidth(surface);

    this.handles = Array.from(
      this.querySelectorAll<HTMLElement>(".page-handle")
    );
    this.readout = this.querySelector<HTMLElement>(".page-width-readout");
    this.liveTargets = [this];
    for (const sel of [".app-bar-inner", ".container"]) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) this.liveTargets.push(el);
    }
    this.updateAria(getSurfaceWidth(surface));

    for (const handle of this.handles) this.bindHandle(handle);
  }

  private get config() {
    return WIDTH_SURFACES[this.surface];
  }

  private viewportWidth(): number {
    return document.documentElement.clientWidth;
  }

  /**
   * The reading column's current width; reads layout, so never call it
   * mid-drag. The container is wider than the column when the dictionary's
   * contents rail shows beside it (dict/dict_toc.css): that extra is
   * subtracted, so the saved width is always the column's.
   */
  private measureWidth(): number {
    const container = this.liveTargets[this.liveTargets.length - 1];
    if (!container) return this.config.def;
    // The rail is sticky only in its desktop beside-the-column mode.
    const rail = container.querySelector<HTMLElement>(
      ".results-layout.has-toc .drawer-toc"
    );
    const extra =
      rail && getComputedStyle(rail).position === "sticky"
        ? rail.getBoundingClientRect().width + RAIL_GAP_PX
        : 0;
    return container.getBoundingClientRect().width - extra || this.config.def;
  }

  private bindHandle(handle: HTMLElement): void {
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
      this.setLive(pending);
      this.updateAria(pending, max);
      if (this.readout) {
        this.readout.textContent = pageWidthLabel(pending, this.config.def);
        this.readout.style.transform = `translate(${readoutX}px, ${readoutY}px)`;
      }
    };

    this.scope.use(
      trackPointerDrag(handle, {
        handleActiveClass: "is-resizing",
        bodyActiveClass: "resizing-page",
        // Measured once: onMove writes the width, so reading it per move
        // would force a synchronous layout on every pointer event.
        onStart: () => {
          startWidth = this.measureWidth();
          max = this.viewportWidth();
          pending = null;
          this.updateAria(getSurfaceWidth(this.surface), max);
        },
        onMove: ({ dx, currentX, currentY }) => {
          pending = resolveSurfaceWidth(
            startWidth + 2 * sign * dx,
            this.config,
            max
          );
          readoutX = currentX + 14;
          readoutY = currentY - 10;
          if (!frame) frame = requestAnimationFrame(paint);
        },
        onEnd: ({ isCancelled }) => {
          // A queued frame finds `pending` cleared and does nothing.
          const committed = pending;
          pending = null;
          if (committed === null || isCancelled) {
            this.setLive(null);
            return;
          }
          this.commit(committed);
        },
      })
    );

    this.scope.listen(handle, "dblclick", () => this.commit(undefined));
    // The saved width can change outside a drag (another tab, Reset).
    this.scope.listen(handle, "focus", () =>
      this.updateAria(getSurfaceWidth(this.surface))
    );
    this.scope.listen(handle, "keydown", (e: KeyboardEvent) => {
      let next: DraggedPageWidth | undefined | null = null;
      const keyMax = this.viewportWidth();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const step = (e.key === "ArrowRight" ? 1 : -1) * sign * KEY_STEP_PX;
        next = resolveSurfaceWidth(
          this.measureWidth() + step,
          this.config,
          keyMax
        );
      } else if (e.key === "Home") {
        next = this.config.min;
      } else if (e.key === "End") {
        next = "full";
      } else if (e.key === "Enter" || e.key === "Escape") {
        next = undefined;
      } else {
        return;
      }
      // Keys on the separator it owns resize the page instead of scrolling.
      e.preventDefault();
      this.commit(next, keyMax);
    });
  }

  /** Writes (or clears) the in-progress width on the live targets. */
  private setLive(width: DraggedPageWidth | null): void {
    const value = width === null ? "" : widthCssValue(width) ?? "";
    for (const el of this.liveTargets)
      el.style.setProperty("--page-max", value);
  }

  /** Saves `width` (`undefined` = default) and records it for pre-paint. */
  private commit(
    width: DraggedPageWidth | undefined,
    max = this.viewportWidth()
  ): void {
    // Record on :root first, then drop the inline values, so the column
    // never flashes back to the old width in between.
    setSurfaceWidth(this.surface, width);
    this.setLive(null);
    this.updateAria(getSurfaceWidth(this.surface), max);
  }

  private updateAria(
    width: DraggedPageWidth | undefined,
    max = this.viewportWidth()
  ): void {
    const { def, min } = this.config;
    // aria-valuemin is static (server-rendered).
    const now = width === "full" ? max : width ?? def;
    const text = pageWidthLabel(width, def);
    for (const handle of this.handles) {
      handle.setAttribute("aria-valuemax", String(Math.max(min, max)));
      handle.setAttribute("aria-valuenow", String(Math.round(now)));
      handle.setAttribute("aria-valuetext", text);
    }
  }
}

registerElement("morcus-page-width", MorcusPageWidth);

declare module "@/web/v2/core/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-page-width": MorcusPageWidth;
  }
}
