/**
 * UI V2 Shared Bottom Drawer Controller
 *
 * Encapsulates pointer drag physics, height snap points, keyboard accessibility,
 * and <details>/<summary> disclosure coordination for bottom sheet drawers.
 */

import { BaseController } from "@/web/v2/core/dom/base_controller.client";
import { trackPointerDrag } from "@/web/v2/core/widgets/gesture.client";

/**
 * Snap points and bounds for bottom sheet drawers in small viewport height units (svh).
 */
export const DRAWER_DEFAULT_SVH = 48;
export const DRAWER_FLOOR_SVH = 18;
export const DRAWER_EXPANDED_SVH = 88;
export const DRAWER_MIN_HEIGHT = 54;

/**
 * Thresholds {@link resolveDrawerSnapDecision} applies on pointer release.
 */
export const DRAWER_SNAP = {
  /** A release is a tap if it moved less than this (px)... */
  tapMaxMovePx: 6,
  /** ...and was released within this (ms). */
  tapMaxMs: 350,
  /** A downward release must travel more than this (px) to count as a flick. */
  flickMinDownPx: 35,
  /** Flick if the release velocity exceeds this (px/ms)... */
  flickMinVelocity: 0.75,
  /** ...or the average speed over the gesture exceeds this (viewport heights/s). */
  flickMinVhPerSec: 1.1,
  /** Minimize when released below this height (px), whatever the floor svh. */
  minimizeBelowPx: 110,
} as const;

export interface DrawerSnapInput {
  dy: number;
  elapsedMs: number;
  velocityY: number;
  currentHeight: number;
  winHeight: number;
  floorSvh: number;
  expandedSvh: number;
}

type DrawerSnapDecision =
  | { action: "tap" }
  | { action: "minimize" }
  /** `targetSvh` is omitted when the viewport can't be measured: keep the preferred height. */
  | { action: "restore"; targetSvh?: number };

/**
 * Pure snap decision math for drawer gestures on pointer release.
 *
 * Resolves tap early-return, fast flick downward to minimize, slow drag
 * below the floor threshold into minimize, or release snapping to clamped svh.
 */
export function resolveDrawerSnapDecision(
  input: DrawerSnapInput
): DrawerSnapDecision {
  const {
    dy,
    elapsedMs,
    velocityY,
    currentHeight,
    winHeight,
    floorSvh,
    expandedSvh,
  } = input;

  if (
    Math.abs(dy) < DRAWER_SNAP.tapMaxMovePx &&
    elapsedMs < DRAWER_SNAP.tapMaxMs
  ) {
    return { action: "tap" };
  }

  // Fast flick down, by release velocity or by average speed over the gesture.
  // `elapsedMs` is at least 1 from `trackPointerDrag`; guard it anyway.
  const safeElapsedMs = elapsedMs > 0 ? elapsedMs : 1;
  const isFastFlickDown =
    dy > DRAWER_SNAP.flickMinDownPx &&
    (velocityY > DRAWER_SNAP.flickMinVelocity ||
      (winHeight > 0 &&
        (dy / winHeight) * (1000 / safeElapsedMs) >
          DRAWER_SNAP.flickMinVhPerSec));
  if (isFastFlickDown || currentHeight < DRAWER_SNAP.minimizeBelowPx) {
    return { action: "minimize" };
  }

  // Without a viewport height there is no svh to snap to.
  if (winHeight <= 0) return { action: "restore" };

  const currentSvh = Math.round((currentHeight / winHeight) * 100);
  if (currentSvh < floorSvh) return { action: "minimize" };
  const clampedSvh = Math.min(expandedSvh, Math.max(floorSvh, currentSvh));
  return { action: "restore", targetSvh: clampedSvh };
}

let svhProbe: HTMLElement | null = null;

/**
 * Measures `100svh` in pixels using a cached fixed-position `height: 100svh`
 * probe element, falling back to `document.documentElement.clientHeight` or
 * `window.innerHeight` when layout engines (such as jsdom) report `0`.
 */
export function measureSvh100(): number {
  if (typeof document !== "undefined" && document.body) {
    if (!svhProbe || !svhProbe.isConnected) {
      svhProbe = document.createElement("div");
      svhProbe.setAttribute("aria-hidden", "true");
      svhProbe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:100svh;pointer-events:none;visibility:hidden;z-index:-1;";
      document.body.appendChild(svhProbe);
    }
    const probeHeight = svhProbe.clientHeight;
    if (probeHeight > 0) {
      return probeHeight;
    }
  }
  if (
    typeof document !== "undefined" &&
    document.documentElement?.clientHeight > 0
  ) {
    return document.documentElement.clientHeight;
  }
  return (typeof window !== "undefined" && window.innerHeight) || 800;
}

/** Sets `--drawer-height` inline on `el`, or removes it when `value` is null. */
function setDrawerHeight(el: HTMLElement | null, value: string | null): void {
  if (!el) return;
  if (value === null) {
    el.style.removeProperty("--drawer-height");
  } else {
    el.style.setProperty("--drawer-height", value);
  }
}

interface DrawerControllerOptions {
  /** Optional root container used to resolve selectors (defaults to drawer or document) */
  root?: ParentNode;
  /** The drawer element whose height and styles are modified */
  drawer?: HTMLElement | null;
  /** Selector to resolve the drawer element from root on connect (use ":scope" for root itself) */
  drawerSelector?: string;
  /** The drag handle element where pointer drag and keyboard events are listened to */
  handle?: HTMLElement | null;
  /** Selector to resolve the handle element from root on connect */
  handleSelector?: string;
  /**
   * Elements outside the drawer that mirror `--drawer-height` inline (e.g. a
   * floating button that sits above the drawer). Never pass `<html>` or
   * `<body>`: an inherited custom property on a page-wide ancestor restyles
   * every element on each pointer move.
   */
  heightTargets?: () => Iterable<HTMLElement>;
  /** Optional <details> element (for disclosure drawers). If omitted, inferred from drawer or its children. */
  detailsElement?: HTMLDetailsElement | null;
  /** Optional selector to resolve the <details> element from root on connect */
  detailsSelector?: string;
  /** Optional <summary> element (for drag suppression). If omitted, inferred from handle or details. */
  summaryElement?: HTMLElement | null;
  /** Optional guard callback; if it returns false, onConnect() skips binding listeners. */
  enabled?: () => boolean;
  /** Minimum height in pixels (peek / minimized height). Defaults to DRAWER_MIN_HEIGHT (54). */
  minHeight?: number;
  /** Default / initial height in svh (1-100). Defaults to DRAWER_DEFAULT_SVH (48). */
  defaultSvh?: number;
  /** Floor / collapse threshold in svh. Defaults to DRAWER_FLOOR_SVH (18). */
  floorSvh?: number;
  /** Expanded snap height in svh. Defaults to DRAWER_EXPANDED_SVH (88). */
  expandedSvh?: number;
  /** Initial preferred svh. Defaults to defaultSvh. */
  preferredSvh?: number;
  /** Optional filter callback; return false to ignore pointerdown (e.g. clicking child buttons). */
  filter?: (e: PointerEvent) => boolean;
  /** Callback fired when pointer drag starts on the handle */
  onDragStart?: () => void;
  /** Callback fired when drawer is minimized */
  onMinimize?: () => void;
  /** Callback fired when drawer is restored or expanded */
  onRestore?: (svh: number) => void;
  /**
   * Callback fired continuously during drag move. Must avoid layout reads
   * (e.g. getBoundingClientRect, clientWidth) to prevent forced reflows.
   */
  onHeightChange?: (heightPx: number, svhPercent: number) => void;
  /** Callback fired when Escape key is pressed */
  onEscape?: () => void;
}

export class DrawerController extends BaseController {
  public drawer: HTMLElement | null = null;
  public handle: HTMLElement | null = null;
  #details: HTMLDetailsElement | null = null;
  #summary: HTMLElement | null = null;
  /** Cached `options.heightTargets`; see {@link #resolveTargets}. */
  #targets: HTMLElement[] = [];

  readonly #minHeight: number;
  readonly #defaultSvh: number;
  readonly #floorSvh: number;
  readonly #expandedSvh: number;
  #preferredSvh: number;
  readonly #options: DrawerControllerOptions;

  constructor(options: DrawerControllerOptions) {
    super(options.root ?? options.drawer ?? document);
    this.#options = options;

    this.#minHeight = options.minHeight ?? DRAWER_MIN_HEIGHT;
    this.#defaultSvh = options.defaultSvh ?? DRAWER_DEFAULT_SVH;
    this.#floorSvh = options.floorSvh ?? DRAWER_FLOOR_SVH;
    this.#expandedSvh = options.expandedSvh ?? DRAWER_EXPANDED_SVH;
    this.#preferredSvh = options.preferredSvh ?? this.#defaultSvh;

    this.#resolveElements();
  }

  /**
   * Sets `--drawer-height` (or removes it when `value` is null) on the drawer
   * and every height target.
   */
  #writeHeight(value: string | null): void {
    setDrawerHeight(this.drawer, value);
    this.#writeTargets(value);
  }

  /**
   * Sets `--drawer-height` (or removes it) on the height targets only.
   *
   * Uses the list cached by {@link #resolveTargets}, so a drag's pointermoves
   * never query the document.
   */
  #writeTargets(value: string | null): void {
    for (const el of this.#targets) setDrawerHeight(el, value);
  }

  /**
   * Re-queries `options.heightTargets`. Runs whenever elements are resolved
   * and at the start of each drag: the targets (e.g. `.back-to-top`) live in
   * the page shell and may not exist yet when the controller is constructed.
   */
  #resolveTargets(): void {
    this.#targets = Array.from(this.#options.heightTargets?.() ?? []);
  }

  #resolveElements(): void {
    const options = this.#options;

    if (options.drawer !== undefined) {
      this.drawer = options.drawer;
    } else if (options.drawerSelector === ":scope") {
      this.drawer = this.host;
    } else if (options.drawerSelector) {
      this.drawer = this.root.querySelector<HTMLElement>(
        options.drawerSelector
      );
    } else if (this.host) {
      this.drawer = this.host;
    } else {
      this.drawer = null;
    }

    if (options.handle !== undefined) {
      this.handle = options.handle;
    } else if (options.handleSelector) {
      this.handle = this.root.querySelector<HTMLElement>(
        options.handleSelector
      );
    } else {
      this.handle = null;
    }

    if (options.detailsElement !== undefined) {
      this.#details = options.detailsElement;
    } else if (options.detailsSelector) {
      this.#details = this.root.querySelector<HTMLDetailsElement>(
        options.detailsSelector
      );
    } else if (this.drawer instanceof HTMLDetailsElement) {
      this.#details = this.drawer;
    } else {
      this.#details = this.drawer?.querySelector("details") ?? null;
    }

    if (options.summaryElement !== undefined) {
      this.#summary = options.summaryElement;
    } else if (this.handle?.tagName.toLowerCase() === "summary") {
      this.#summary = this.handle;
    } else {
      this.#summary = this.#details?.querySelector("summary") ?? null;
    }

    this.#resolveTargets();
  }

  protected override onConnect(): void {
    if (this.#options.enabled && !this.#options.enabled()) {
      this.dispose();
      return;
    }
    this.#resolveElements();
    if (!this.drawer || !this.handle) {
      this.dispose();
      return;
    }

    // The drawer keeps its own inline height across a disconnect (e.g. the
    // dictionary TOC disposes at the desktop breakpoint and reconnects on the
    // way back), so `preferredSvh` and `aria-valuenow` stay true to what is
    // painted. Mirror it to the targets so they line up with it again.
    const kept = this.drawer.style.getPropertyValue("--drawer-height");
    if (kept) this.#writeTargets(kept);
    // Only the targets are cleared on teardown: they sit outside the drawer
    // and would otherwise keep offsetting for a drawer that is no longer
    // managed. Through the scope, not onDisconnect: also clears them if a
    // step below throws (BaseController skips onDisconnect after a failed
    // connect).
    this.scope.use(() => this.#writeTargets(null));
    this.#initDrag();
    this.#initKeyboard();
    this.#initDetailsSync();
    this.scope.listen(
      this.drawer.ownerDocument,
      "morcus:section-edit-open",
      (e: Event) => {
        if (
          !this.isMinimized() &&
          !(e.target instanceof Node && this.drawer?.contains(e.target))
        ) {
          this.minimize();
        }
      }
    );
    // Reconcile `<details>` and `.drawer-minimized` when they disagree:
    // - PH8: `<details>` toggles natively before upgrade; if the user closed
    //   it (`!open && !minimized`), adopt that rather than leaving the drawer
    //   at full height.
    // - Reconnect after a desktop round-trip: `MorcusDictToc` forces
    //   `<details open>` for the desktop rail while disposed; if the drawer
    //   was minimized before disconnect (`open && minimized`), re-close
    //   `<details>` on the way back to mobile.
    if (this.#details && this.#details.open === this.#isMinimizedClass()) {
      this.minimize();
    }
  }

  #isMinimizedClass(): boolean {
    return this.drawer?.classList.contains("drawer-minimized") ?? false;
  }

  /**
   * Returns true if the drawer is currently in a minimized/collapsed state.
   */
  isMinimized(): boolean {
    this.#resolveElements();
    if (this.#details && !this.#details.open) {
      return true;
    }
    return this.drawer?.classList.contains("drawer-minimized") ?? false;
  }

  /**
   * Returns the current preferred height in svh.
   */
  getPreferredSvh(): number {
    return this.#preferredSvh;
  }

  /**
   * Minimizes the drawer to peek height (54px).
   */
  minimize(): void {
    this.#resolveElements();
    if (this.drawer) {
      this.drawer.classList.add("drawer-minimized");
    }
    if (this.#details) this.#details.open = false;
    this.#writeHeight(`${this.#minHeight}px`);
    this.handle?.setAttribute("aria-valuenow", "0");
    this.#options.onMinimize?.();
  }

  /**
   * Restores the drawer to the specified or preferred svh height.
   */
  restore(targetSvh?: number): void {
    this.#resolveElements();
    const svh = Math.min(
      this.#expandedSvh,
      Math.max(
        this.#floorSvh,
        targetSvh ?? this.#preferredSvh ?? this.#defaultSvh
      )
    );
    this.#preferredSvh = svh;

    if (this.drawer) {
      this.drawer.classList.remove("drawer-minimized");
    }
    if (this.#details) this.#details.open = true;
    this.#writeHeight(`${svh}svh`);
    this.handle?.setAttribute("aria-valuenow", String(svh));

    this.#options.onRestore?.(svh);
  }

  /**
   * Directly sets the drawer height in pixels within the allowed bounds.
   */
  setHeight(heightPx: number): void {
    this.#resolveElements();
    const winHeight = measureSvh100();
    const maxHeight = Math.round(winHeight * (this.#expandedSvh / 100));
    const clamped = Math.max(this.#minHeight, Math.min(maxHeight, heightPx));
    this.#writeHeight(`${clamped}px`);
    const percent = Math.round((clamped / winHeight) * 100);
    this.handle?.setAttribute("aria-valuenow", String(percent));
    this.#options.onHeightChange?.(clamped, percent);
  }

  #initDrag(): void {
    const drawer = this.drawer;
    const handle = this.handle;
    if (!drawer || !handle) return;

    let wasMinimized = false;
    let startHeight = 0;
    let winHeight = 800;
    let maxHeight = 800;
    // Set once `onEnd` has applied the gesture itself, so the native `<summary>`
    // click that follows pointerup must not toggle `<details>` again.
    let suppressSummaryClick = false;

    this.scope.use(
      trackPointerDrag(handle, {
        handleActiveClass: "is-dragging",
        // The handle is a child of the drawer, so `.reader-dict-panel.is-dragging .dict-iframe`
        // (src/web/v2/reader/reader_dict.css#L31-L34) only matches if the panel is marked too.
        // That rule sets `pointer-events: none` on `.dict-iframe` so the dictionary iframe
        // cannot capture pointer events mid-drag.
        activeClassTarget: drawer,
        filter: this.#options.filter,
        /**
         * `100svh` (`measureSvh100()`) is measured once per gesture and reused by
         * `onMove` and `onEnd`. It is layout-dependent, so reading it per move —
         * right after the previous move wrote `--drawer-height` — forces a
         * synchronous layout. The viewport cannot change mid-gesture: the handle
         * is `touch-action: none` (drawer.css), so there is no scroll-driven
         * URL-bar collapse to react to. Reusing it in `onEnd` also keeps the
         * snap decision on the same basis as the heights the drag just painted.
         */
        onStart: () => {
          // Once per gesture, so `onMove` writes to a cached list.
          this.#resolveTargets();
          winHeight = measureSvh100();
          wasMinimized = this.isMinimized();
          startHeight =
            drawer.getBoundingClientRect().height || this.#minHeight;
          maxHeight = Math.round(winHeight * (this.#expandedSvh / 100));
          if (this.#details && !this.#details.open) {
            this.#details.open = true;
            startHeight =
              drawer.getBoundingClientRect().height || this.#minHeight;
          }
          if (wasMinimized) {
            drawer.classList.remove("drawer-minimized");
          }
          this.#writeHeight(`${startHeight}px`);
          suppressSummaryClick = false;
          this.#options.onDragStart?.();
        },
        onMove: ({ dy }) => {
          const newHeight = Math.max(
            this.#minHeight,
            Math.min(maxHeight, startHeight - dy)
          );
          this.#writeHeight(`${newHeight}px`);
          const percent = Math.round((newHeight / winHeight) * 100);
          handle.setAttribute("aria-valuenow", String(percent));
          this.#options.onHeightChange?.(newHeight, percent);
        },
        onEnd: ({ dy, elapsedMs, velocityY }) => {
          const measuredHeight = drawer.getBoundingClientRect().height;
          const currentHeight =
            measuredHeight > 0
              ? measuredHeight
              : Math.max(
                  this.#minHeight,
                  Math.min(maxHeight, startHeight - dy)
                );

          const decision = resolveDrawerSnapDecision({
            dy,
            elapsedMs,
            velocityY,
            currentHeight,
            winHeight,
            floorSvh: this.#floorSvh,
            expandedSvh: this.#expandedSvh,
          });
          suppressSummaryClick = true;

          if (decision.action === "tap") {
            // `onStart` already opened `<details>`, so the native click would
            // close it again: toggle here instead.
            if (this.#details && !wasMinimized) {
              this.minimize();
            } else {
              this.restore();
            }
            return;
          }

          if (decision.action === "minimize") {
            this.minimize();
            return;
          }

          this.restore(decision.targetSvh);
        },
      })
    );

    if (this.#summary) {
      this.scope.listen(
        this.#summary,
        "click",
        (e: MouseEvent) => {
          if (suppressSummaryClick) {
            // `onEnd` already applied this gesture; the native toggle would
            // undo it
            e.preventDefault();
            // Swallow the post-gesture click so other listeners on this
            // drawer's summary don't treat it as a second tap
            e.stopImmediatePropagation();
            suppressSummaryClick = false;
          }
        },
        true
      );
    }
  }

  #initKeyboard(): void {
    const drawer = this.drawer;
    const handle = this.handle;
    if (!drawer || !handle) return;

    this.scope.listen(handle, "keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        // ArrowUp on this drawer's handle expands the drawer instead of
        // scrolling
        e.preventDefault();
        if (this.isMinimized()) {
          this.restore(this.#defaultSvh);
        } else {
          this.restore(this.#expandedSvh);
        }
      } else if (e.key === "ArrowDown") {
        // ArrowDown on this drawer's handle shrinks the drawer instead of
        // scrolling
        e.preventDefault();
        const currentHeight = drawer.getBoundingClientRect().height;
        const winHeight = measureSvh100();
        if (currentHeight > winHeight * 0.6) {
          this.restore(this.#defaultSvh);
        } else {
          this.minimize();
        }
      } else if (e.key === "Escape") {
        // Escape on this drawer's handle minimizes the drawer (or runs
        // onEscape)
        e.preventDefault();
        if (this.#options.onEscape) {
          this.#options.onEscape();
        } else {
          this.minimize();
        }
      }
    });
  }

  #initDetailsSync(): void {
    if (!this.#details) return;
    this.scope.listen(this.#details, "toggle", () => {
      if (!this.#details) return;
      // `toggle` is dispatched a task after `open` changes, so a flag set
      // around our own writes can't recognise them. Compare state instead:
      // `minimize()`, `restore()`, `reset()` and drag start leave `open` and
      // `.drawer-minimized` agreeing, so only a native toggle (the user
      // activating `<summary>`) arrives with them disagreeing.
      if (this.#details.open !== this.#isMinimizedClass()) return;
      if (this.#details.open) {
        this.restore();
      } else {
        this.minimize();
      }
    });
  }

  /**
   * Resets drawer DOM state to its collapsed initial state and removes custom
   * height styles on the drawer and its height targets.
   */
  public reset(): void {
    this.#resolveElements();
    if (this.drawer) {
      this.drawer.classList.add("drawer-minimized");
    }
    if (this.#details) this.#details.open = false;
    this.#writeHeight(null);
    this.handle?.setAttribute("aria-valuenow", "0");
  }
}
