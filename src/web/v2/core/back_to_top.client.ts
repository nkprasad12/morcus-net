import {
  createSingletonSetup,
  type CleanupFn,
} from "@/web/v2/core/disposable.client";
import { clearUpgraded, markUpgraded } from "@/web/v2/core/js_gate.client";

export interface BackToTopOptions {
  /**
   * Scroll container element, or a getter returning the active scroll container.
   * When omitted, scrolls `win` (`window`).
   */
  container?: HTMLElement | (() => HTMLElement | null);
  /**
   * Scroll event targets to listen on. Defaults to `[container]` when `container`
   * is an `HTMLElement`, or `[win]` when `container` is omitted.
   */
  scrollTargets?: readonly (EventTarget | null | undefined)[];
  /**
   * Scroll offset threshold (in px) above which `.visible` is toggled on.
   * Defaults to `300`.
   */
  threshold?: number;
  /**
   * Target `top` offset (in px) to scroll to on click.
   * Defaults to `0`.
   */
  getTargetTop?: () => number;
  /**
   * Whether to strip `win.location.hash` via `history.replaceState` on click.
   * Defaults to `true` when scrolling `win`, `false` for element containers.
   */
  clearHash?: boolean;
  /**
   * Whether to mark the button with `markUpgraded` / `clearUpgraded` (for
   * standalone controls outside a custom element). Defaults to `false`.
   */
  markUpgraded?: boolean;
  /** Window reference (for testing / rAF). Defaults to `window`. */
  win?: Window;
}

/**
 * Binds a "Jump to top" button to a scroll container (or `window`), toggling
 * `.visible` past `threshold` via `requestAnimationFrame` and scrolling
 * instantly to the top on click. Returns a {@link CleanupFn} suitable for
 * `this.scope.use(...)`.
 */
export function bindBackToTop(
  btn: HTMLElement,
  options?: BackToTopOptions
): CleanupFn {
  const win = options?.win ?? window;
  const threshold = options?.threshold ?? 300;
  const clearHash = options?.clearHash ?? options?.container === undefined;

  const getContainer = (): HTMLElement | null => {
    if (!options?.container) return null;
    return typeof options.container === "function"
      ? options.container()
      : options.container;
  };

  const getScrollOffset = (): number => {
    if (!options?.container) return win.scrollY;
    const el = getContainer();
    return el ? el.scrollTop : 0;
  };

  let ticking = false;
  let disposed = false;
  const updateBackToTop = () => {
    ticking = false;
    if (disposed) return;
    const shouldShow = getScrollOffset() > threshold;
    btn.classList.toggle("visible", shouldShow);
  };

  const onScroll = () => {
    if (!ticking) {
      win.requestAnimationFrame(updateBackToTop);
      ticking = true;
    }
  };

  const rawTargets =
    options?.scrollTargets ??
    (options?.container && typeof options.container !== "function"
      ? [options.container]
      : [win]);
  const targets = rawTargets.filter(
    (t): t is EventTarget => t !== null && t !== undefined
  );

  for (const target of targets) {
    target.addEventListener("scroll", onScroll, { passive: true });
  }
  updateBackToTop();

  const onClick = (e: MouseEvent) => {
    // native-takeover(self): the `#top` jump is replaced by the scroll below,
    // on the button this binding owns.
    e.preventDefault();
    const top = options?.getTargetTop ? options.getTargetTop() : 0;
    if (!options?.container) {
      win.scrollTo({ top, behavior: "instant" });
    } else {
      const el = getContainer();
      if (!el) return;
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ top, behavior: "instant" });
      } else {
        el.scrollTop = top;
      }
    }

    if (clearHash && win.location.hash) {
      // native-takeover(self): drops a stale fragment from the URL. `:target`
      // is left as is, so an un-upgraded owner's No-JS UI is unaffected.
      win.history.replaceState(
        null,
        "",
        win.location.pathname + win.location.search
      );
    }
    btn.classList.remove("visible");
  };

  btn.addEventListener("click", onClick);
  if (options?.markUpgraded) {
    markUpgraded(btn);
  }

  return () => {
    disposed = true;
    if (options?.markUpgraded) {
      clearUpgraded(btn);
    }
    for (const target of targets) {
      target.removeEventListener("scroll", onScroll);
    }
    btn.removeEventListener("click", onClick);
  };
}

/**
 * Floating "Jump to top" button visibility & instant scroll for the page window.
 */
export const setupBackToTop: (doc?: Document, win?: Window) => CleanupFn =
  createSingletonSetup(
    (doc: Document = document, win: Window = window): CleanupFn => {
      const backToTopBtn = doc.querySelector<HTMLAnchorElement>(".back-to-top");
      if (!backToTopBtn) {
        return () => {};
      }
      return bindBackToTop(backToTopBtn, {
        win,
        clearHash: true,
        markUpgraded: true,
      });
    }
  );
