/**
 * Swipe page turns for the reader.
 *
 * The passage panel follows the finger during a horizontal swipe. Releasing
 * past {@link COMMIT_RATIO} slides it the rest of the way out while the next
 * page loads, then slides the new page in from the opposite side; releasing
 * short of it springs back.
 *
 * Page turns themselves are delegated to the host (`turn`), so this controller
 * owns only gesture policy and the slide; history, TOC, notes, and saved-spot
 * handling stay in the host's single swap path.
 *
 * V1's side-tap zones are deliberately not ported: the sticky-bar pager
 * arrows already cover tap-to-turn (see FEATURE_PARITY.md).
 *
 * Zero-JS: pure enhancement; without JS the pager links and continuation
 * cards remain the only way to turn pages.
 */

import {
  BaseController,
  trackHorizontalSwipe,
} from "@/web/v2/core/index.client";
import { isSwipeNavOn } from "@/web/v2/reader/reader_settings.client";

export type PageDir = "prev" | "next";

/** Swipes starting this close (px) to a screen edge belong to the OS back gesture. */
export const EDGE_GUARD_PX = 24;
/** Release distance that commits a swipe, as a fraction of `min(vw, vh)` (V1: 20%). */
export const COMMIT_RATIO = 0.2;
/** Drag multiplier toward a direction with no page, for a rubber-band feel. */
export const RESISTANCE = 0.25;
/** Slide duration; must match `[data-swipe="anim"]` in reader_page_nav.css. */
export const SLIDE_MS = 180;
/** Distance (px) the incoming page slides in from. */
const ENTER_PX = 48;

export interface ReaderPageNavOptions {
  root: HTMLElement;
  /** Whether there is a page in `dir`. */
  canTurn: (dir: PageDir) => boolean;
  /** Turns to the page in `dir`; resolves true once it is in place. */
  turn: (dir: PageDir) => Promise<boolean>;
}

const matches = (query: string) => !!window.matchMedia?.(query).matches;
const dirOf = (dx: number): PageDir => (dx < 0 ? "next" : "prev");
const commitPx = () =>
  COMMIT_RATIO * Math.min(window.innerWidth, window.innerHeight);
const hasSelection = () => window.getSelection()?.isCollapsed === false;

export class ReaderPageNavController extends BaseController {
  private readonly options: ReaderPageNavOptions;
  private panel: HTMLElement | null = null;
  /** True while a slide is running; new gestures are ignored until it ends. */
  private busy = false;

  constructor(options: ReaderPageNavOptions) {
    super(options.root);
    this.options = options;
  }

  protected override onConnect(): void {
    this.busy = false;
    const panel = (this.panel = this.scope.$(".reader-text-panel"));
    if (!panel) return;
    this.scope.use(
      trackHorizontalSwipe(panel, {
        filter: (touch) =>
          !this.busy &&
          isSwipeNavOn() &&
          touch.clientX > EDGE_GUARD_PX &&
          touch.clientX < window.innerWidth - EDGE_GUARD_PX &&
          // A horizontal drag while pinch-zoomed is a pan, not a swipe.
          (window.visualViewport?.scale ?? 1) < 1.01 &&
          !hasSelection(),
        onMove: (dx) => {
          const x = this.options.canTurn(dirOf(dx)) ? dx : dx * RESISTANCE;
          // Fades to half as the swipe arms, so "release now turns" is visible.
          this.place(
            panel,
            "drag",
            x,
            1 - Math.min(Math.abs(x) / commitPx(), 1) / 2
          );
        },
        onEnd: (dx, cancelled) => {
          const dir = dirOf(dx);
          const commit =
            !cancelled &&
            Math.abs(dx) >= commitPx() &&
            this.options.canTurn(dir);
          void this.settle(panel, commit ? dir : null);
        },
      })
    );
  }

  protected override onDisconnect(): void {
    if (this.panel) this.reset(this.panel);
  }

  /**
   * Ends a swipe. With a `dir`, slides the page out that way, turns, and
   * slides the new page in; without one (or if the turn fails), springs the
   * panel back into place. New swipes are ignored until this finishes.
   */
  private async settle(panel: HTMLElement, dir: PageDir | null): Promise<void> {
    this.busy = true;
    if (dir) {
      const sign = dir === "next" ? -1 : 1;
      const [ok] = await Promise.all([
        this.options.turn(dir),
        this.animate(panel, sign * window.innerWidth, 0),
      ]);
      if (ok) {
        this.place(panel, "drag", -sign * ENTER_PX, 0);
        // Commit the start position so the entry below transitions from it.
        panel.getBoundingClientRect();
      }
    }
    await this.animate(panel, 0, 1);
    this.reset(panel);
    this.busy = false;
  }

  private animate(panel: HTMLElement, x: number, fade: number): Promise<void> {
    this.place(panel, "anim", x, fade);
    const ms = matches("(prefers-reduced-motion: reduce)") ? 0 : SLIDE_MS;
    return new Promise((resolve) => this.scope.timeout(() => resolve(), ms));
  }

  /**
   * Writes only CSS variables; reader_page_nav.css maps them to `translate`
   * and `opacity`. Inline `opacity` is off limits: `fetchAndSwapPartial` owns
   * it for its loading dim.
   */
  private place(
    panel: HTMLElement,
    mode: "drag" | "anim",
    x: number,
    fade: number
  ): void {
    panel.dataset.swipe = mode;
    panel.style.setProperty("--swipe-x", `${x}px`);
    panel.style.setProperty("--swipe-fade", `${fade}`);
  }

  private reset(panel: HTMLElement): void {
    delete panel.dataset.swipe;
    panel.style.removeProperty("--swipe-x");
    panel.style.removeProperty("--swipe-fade");
  }
}
