/**
 * UI V2 Shared Bottom Drawer Controller
 *
 * Encapsulates pointer drag physics, height snap points, keyboard accessibility,
 * and <details>/<summary> disclosure coordination for bottom sheet drawers.
 */

import { BaseController } from "@/web/v2/core/base_element.client";
import { trackPointerDrag } from "@/web/v2/core/gesture.client";

/**
 * Snap points and bounds for bottom sheet drawers in small viewport height units (svh).
 */
export const DRAWER_DEFAULT_SVH = 48;
export const DRAWER_FLOOR_SVH = 18;
export const DRAWER_EXPANDED_SVH = 88;
export const DRAWER_MIN_HEIGHT = 54;

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

export interface DrawerControllerOptions {
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
  /** Optional layout/container element that also tracks drawer height via CSS variable */
  layoutElement?: HTMLElement | (() => HTMLElement | null) | null;
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
  private details: HTMLDetailsElement | null = null;
  private summary: HTMLElement | null = null;

  private readonly minHeight: number;
  private readonly defaultSvh: number;
  private readonly floorSvh: number;
  private readonly expandedSvh: number;
  private preferredSvh: number;

  private isUpdatingDetails = false;

  constructor(private readonly options: DrawerControllerOptions) {
    super(options.root ?? options.drawer ?? document);

    this.minHeight = options.minHeight ?? DRAWER_MIN_HEIGHT;
    this.defaultSvh = options.defaultSvh ?? DRAWER_DEFAULT_SVH;
    this.floorSvh = options.floorSvh ?? DRAWER_FLOOR_SVH;
    this.expandedSvh = options.expandedSvh ?? DRAWER_EXPANDED_SVH;
    this.preferredSvh = options.preferredSvh ?? this.defaultSvh;

    this.resolveElements();
  }

  private getLayoutElement(): HTMLElement | null {
    if (typeof this.options.layoutElement === "function") {
      return this.options.layoutElement();
    }
    return this.options.layoutElement ?? null;
  }

  private resolveElements(): void {
    const options = this.options;

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
      this.details = options.detailsElement;
    } else if (options.detailsSelector) {
      this.details = this.root.querySelector<HTMLDetailsElement>(
        options.detailsSelector
      );
    } else if (this.drawer instanceof HTMLDetailsElement) {
      this.details = this.drawer;
    } else {
      this.details = this.drawer?.querySelector("details") ?? null;
    }

    if (options.summaryElement !== undefined) {
      this.summary = options.summaryElement;
    } else if (this.handle?.tagName.toLowerCase() === "summary") {
      this.summary = this.handle;
    } else {
      this.summary = this.details?.querySelector("summary") ?? null;
    }
  }

  protected override onConnect(): void {
    if (this.options.enabled && !this.options.enabled()) {
      this.dispose();
      return;
    }
    this.resolveElements();
    if (!this.drawer || !this.handle) {
      this.dispose();
      return;
    }

    this.initDrag();
    this.initKeyboard();
    this.initDetailsSync();
  }

  protected override onDisconnect(): void {
    this.getLayoutElement()?.style.removeProperty("--drawer-height");
  }

  /**
   * Returns true if the drawer is currently in a minimized/collapsed state.
   */
  isMinimized(): boolean {
    this.resolveElements();
    if (this.details && !this.details.open) {
      return true;
    }
    return this.drawer?.classList.contains("drawer-minimized") ?? false;
  }

  /**
   * Returns the current preferred height in svh.
   */
  getPreferredSvh(): number {
    return this.preferredSvh;
  }

  /**
   * Minimizes the drawer to peek height (54px).
   */
  minimize(): void {
    this.resolveElements();
    if (this.drawer) {
      this.drawer.classList.add("drawer-minimized");
      this.drawer.style.setProperty("--drawer-height", `${this.minHeight}px`);
    }
    if (this.details && this.details.open) {
      this.isUpdatingDetails = true;
      this.details.open = false;
      this.isUpdatingDetails = false;
    }
    this.getLayoutElement()?.style.setProperty(
      "--drawer-height",
      `${this.minHeight}px`
    );
    this.handle?.setAttribute("aria-valuenow", "0");
    this.options.onMinimize?.();
  }

  /**
   * Restores the drawer to the specified or preferred svh height.
   */
  restore(targetSvh?: number): void {
    this.resolveElements();
    const svh = Math.min(
      this.expandedSvh,
      Math.max(this.floorSvh, targetSvh ?? this.preferredSvh ?? this.defaultSvh)
    );
    this.preferredSvh = svh;

    if (this.drawer) {
      this.drawer.classList.remove("drawer-minimized");
      this.drawer.style.setProperty("--drawer-height", `${svh}svh`);
    }
    if (this.details && !this.details.open) {
      this.isUpdatingDetails = true;
      this.details.open = true;
      this.isUpdatingDetails = false;
    }
    this.getLayoutElement()?.style.setProperty("--drawer-height", `${svh}svh`);
    this.handle?.setAttribute("aria-valuenow", String(svh));

    this.options.onRestore?.(svh);
  }

  /**
   * Directly sets the drawer height in pixels within the allowed bounds.
   */
  setHeight(heightPx: number): void {
    this.resolveElements();
    const winHeight = measureSvh100();
    const maxHeight = Math.round(winHeight * (this.expandedSvh / 100));
    const clamped = Math.max(this.minHeight, Math.min(maxHeight, heightPx));
    this.drawer?.style.setProperty("--drawer-height", `${clamped}px`);
    this.getLayoutElement()?.style.setProperty(
      "--drawer-height",
      `${clamped}px`
    );
    const percent = Math.round((clamped / winHeight) * 100);
    this.handle?.setAttribute("aria-valuenow", String(percent));
    this.options.onHeightChange?.(clamped, percent);
  }

  private initDrag(): void {
    const drawer = this.drawer;
    const handle = this.handle;
    if (!drawer || !handle) return;

    let wasMinimized = false;
    let startHeight = 0;
    let winHeight = 800;
    let maxHeight = 800;
    let wasDragged = false;

    this.scope.use(
      trackPointerDrag(handle, {
        handleActiveClass: "is-dragging",
        // The handle is a child of the drawer, so `.reader-dict-panel.is-dragging .dict-iframe`
        // (src/web/v2/reader/reader_dict.css#L31-L34) only matches if the panel is marked too.
        // That rule sets `pointer-events: none` on `.dict-iframe` so the dictionary iframe
        // cannot capture pointer events mid-drag.
        activeClassTarget: drawer,
        bodyActiveClass: "resizing-drawer",
        filter: this.options.filter,
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
          winHeight = measureSvh100();
          wasMinimized = this.isMinimized();
          startHeight = drawer.getBoundingClientRect().height || this.minHeight;
          maxHeight = Math.round(winHeight * (this.expandedSvh / 100));
          if (this.details && !this.details.open) {
            this.isUpdatingDetails = true;
            this.details.open = true;
            this.isUpdatingDetails = false;
            startHeight =
              drawer.getBoundingClientRect().height || this.minHeight;
          }
          if (wasMinimized) {
            drawer.classList.remove("drawer-minimized");
          }
          drawer.style.setProperty("--drawer-height", `${startHeight}px`);
          this.getLayoutElement()?.style.setProperty(
            "--drawer-height",
            `${startHeight}px`
          );
          wasDragged = false;
          this.options.onDragStart?.();
        },
        onMove: ({ dy }) => {
          if (Math.abs(dy) > 6) {
            wasDragged = true;
          }
          const newHeight = Math.max(
            this.minHeight,
            Math.min(maxHeight, startHeight - dy)
          );
          drawer.style.setProperty("--drawer-height", `${newHeight}px`);
          this.getLayoutElement()?.style.setProperty(
            "--drawer-height",
            `${newHeight}px`
          );
          const percent = Math.round((newHeight / winHeight) * 100);
          handle.setAttribute("aria-valuenow", String(percent));
          this.options.onHeightChange?.(newHeight, percent);
        },
        onEnd: ({ dy, elapsedMs, velocityY }) => {
          const measuredHeight = drawer.getBoundingClientRect().height;
          const currentHeight =
            measuredHeight > 0
              ? measuredHeight
              : Math.max(this.minHeight, Math.min(maxHeight, startHeight - dy));
          const currentSvh = Math.round((currentHeight / winHeight) * 100);

          // Handle simple tap (minimal movement)
          if (Math.abs(dy) < 6 && elapsedMs < 350) {
            wasDragged = false;
            if (!this.details) {
              this.restore();
            } else if (!wasMinimized) {
              drawer.style.setProperty(
                "--drawer-height",
                `${this.preferredSvh}svh`
              );
              this.getLayoutElement()?.style.setProperty(
                "--drawer-height",
                `${this.preferredSvh}svh`
              );
            }
            return;
          }

          // Fast flick down detection:
          const vhPerSec = (dy / winHeight) * (1000 / elapsedMs);
          const isFastFlickDown =
            dy > 35 && (velocityY > 0.75 || vhPerSec > 1.1);

          // Dragged into floor threshold
          const isDraggedToFloor =
            currentSvh < this.floorSvh || currentHeight < 110;

          if (isFastFlickDown || isDraggedToFloor) {
            this.minimize();
            return;
          }

          const clampedSvh = Math.min(
            this.expandedSvh,
            Math.max(this.floorSvh, currentSvh)
          );
          this.restore(clampedSvh);
        },
      })
    );

    if (this.summary) {
      this.scope.listen(
        this.summary,
        "click",
        (e: MouseEvent) => {
          if (wasDragged) {
            e.preventDefault();
            e.stopImmediatePropagation();
            wasDragged = false;
          }
        },
        true
      );
    }
  }

  private initKeyboard(): void {
    const drawer = this.drawer;
    const handle = this.handle;
    if (!drawer || !handle) return;

    this.scope.listen(handle, "keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (this.isMinimized()) {
          this.restore(this.defaultSvh);
        } else {
          this.restore(this.expandedSvh);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentHeight = drawer.getBoundingClientRect().height;
        const winHeight = measureSvh100();
        if (currentHeight > winHeight * 0.6) {
          this.restore(this.defaultSvh);
        } else {
          this.minimize();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (this.options.onEscape) {
          this.options.onEscape();
        } else {
          this.minimize();
        }
      }
    });
  }

  private initDetailsSync(): void {
    if (!this.details) return;
    this.scope.listen(this.details, "toggle", () => {
      if (this.isUpdatingDetails || !this.details) return;
      if (this.details.open) {
        this.restore();
      } else {
        this.minimize();
      }
    });
  }

  /**
   * Resets drawer DOM state to its collapsed initial state and removes custom
   * height styles on the drawer and layout elements.
   */
  public reset(): void {
    this.resolveElements();
    if (this.drawer) {
      this.drawer.classList.add("drawer-minimized");
      this.drawer.style.removeProperty("--drawer-height");
    }
    this.getLayoutElement()?.style.removeProperty("--drawer-height");
    this.handle?.setAttribute("aria-valuenow", "0");
  }

  /**
   * Disposes all event listeners and gesture tracking.
   */
  override dispose(): void {
    this.getLayoutElement()?.style.removeProperty("--drawer-height");
    super.dispose();
  }
}
