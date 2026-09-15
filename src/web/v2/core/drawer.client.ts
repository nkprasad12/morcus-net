/**
 * UI V2 Shared Bottom Drawer Controller
 *
 * Encapsulates pointer drag physics, height snap points, keyboard accessibility,
 * and <details>/<summary> disclosure coordination for bottom sheet drawers.
 */

import { DisposableBag } from "@/web/v2/core/disposable.client";
import { trackPointerDrag } from "@/web/v2/core/gesture.client";

/**
 * Snap points and bounds for bottom sheet drawers in dynamic viewport height units (dvh).
 */
export const DRAWER_DEFAULT_DVH = 48;
export const DRAWER_FLOOR_DVH = 18;
export const DRAWER_EXPANDED_DVH = 88;
export const DRAWER_MIN_HEIGHT = 54;

export interface DrawerControllerOptions {
  /** The drawer element whose height and styles are modified */
  drawer: HTMLElement;
  /** The drag handle element where pointer drag and keyboard events are listened to */
  handle: HTMLElement;
  /** Optional layout/container element that also tracks drawer height via CSS variable */
  layoutElement?: HTMLElement | null;
  /** Optional <details> element (for disclosure drawers). If omitted, inferred from drawer or its children. */
  detailsElement?: HTMLDetailsElement | null;
  /** Optional <summary> element (for drag suppression). If omitted, inferred from handle or details. */
  summaryElement?: HTMLElement | null;
  /** Minimum height in pixels (peek / minimized height). Defaults to DRAWER_MIN_HEIGHT (54). */
  minHeight?: number;
  /** Default / initial height in dvh (1-100). Defaults to DRAWER_DEFAULT_DVH (48). */
  defaultDvh?: number;
  /** Floor / collapse threshold in dvh. Defaults to DRAWER_FLOOR_DVH (18). */
  floorDvh?: number;
  /** Expanded snap height in dvh. Defaults to DRAWER_EXPANDED_DVH (88). */
  expandedDvh?: number;
  /** Initial preferred dvh. Defaults to defaultDvh. */
  preferredDvh?: number;
  /** Optional filter callback; return false to ignore pointerdown (e.g. clicking child buttons). */
  filter?: (e: PointerEvent) => boolean;
  /** Callback fired when drawer is minimized */
  onMinimize?: () => void;
  /** Callback fired when drawer is restored or expanded */
  onRestore?: (dvh: number) => void;
  /**
   * Callback fired continuously during drag move. Must avoid layout reads
   * (e.g. getBoundingClientRect, clientWidth) to prevent forced reflows.
   */
  onHeightChange?: (heightPx: number, dvhPercent: number) => void;
  /** Callback fired when Escape key is pressed */
  onEscape?: () => void;
}

export class DrawerController {
  private readonly drawer: HTMLElement;
  private readonly handle: HTMLElement;
  private readonly layoutElement?: HTMLElement | null;
  private readonly details: HTMLDetailsElement | null;
  private readonly summary: HTMLElement | null;

  private readonly minHeight: number;
  private readonly defaultDvh: number;
  private readonly floorDvh: number;
  private readonly expandedDvh: number;
  private preferredDvh: number;
  private readonly disposables = new DisposableBag();

  private isUpdatingDetails = false;

  constructor(private readonly options: DrawerControllerOptions) {
    this.drawer = options.drawer;
    this.handle = options.handle;
    this.layoutElement = options.layoutElement;

    this.details =
      options.detailsElement ??
      (options.drawer instanceof HTMLDetailsElement
        ? options.drawer
        : options.drawer.querySelector("details"));

    this.summary =
      options.summaryElement ??
      (options.handle.tagName.toLowerCase() === "summary"
        ? options.handle
        : this.details?.querySelector("summary") ?? null);

    this.minHeight = options.minHeight ?? DRAWER_MIN_HEIGHT;
    this.defaultDvh = options.defaultDvh ?? DRAWER_DEFAULT_DVH;
    this.floorDvh = options.floorDvh ?? DRAWER_FLOOR_DVH;
    this.expandedDvh = options.expandedDvh ?? DRAWER_EXPANDED_DVH;
    this.preferredDvh = options.preferredDvh ?? this.defaultDvh;

    this.initDrag();
    this.initKeyboard();
    this.initDetailsSync();
  }

  /**
   * Returns true if the drawer is currently in a minimized/collapsed state.
   */
  isMinimized(): boolean {
    if (this.details && !this.details.open) {
      return true;
    }
    return this.drawer.classList.contains("drawer-minimized");
  }

  /**
   * Returns the current preferred height in dvh.
   */
  getPreferredDvh(): number {
    return this.preferredDvh;
  }

  /**
   * Minimizes the drawer to peek height (54px).
   */
  minimize(): void {
    this.drawer.classList.add("drawer-minimized");
    if (this.details && this.details.open) {
      this.isUpdatingDetails = true;
      this.details.open = false;
      this.isUpdatingDetails = false;
    }
    this.drawer.style.setProperty("--drawer-height", `${this.minHeight}px`);
    this.layoutElement?.style.setProperty(
      "--drawer-height",
      `${this.minHeight}px`
    );
    this.handle.setAttribute("aria-valuenow", "0");
    this.options.onMinimize?.();
  }

  /**
   * Restores the drawer to the specified or preferred dvh height.
   */
  restore(targetDvh?: number): void {
    const dvh = Math.min(
      this.expandedDvh,
      Math.max(this.floorDvh, targetDvh ?? this.preferredDvh ?? this.defaultDvh)
    );
    this.preferredDvh = dvh;

    this.drawer.classList.remove("drawer-minimized");
    if (this.details && !this.details.open) {
      this.isUpdatingDetails = true;
      this.details.open = true;
      this.isUpdatingDetails = false;
    }
    this.drawer.style.setProperty("--drawer-height", `${dvh}dvh`);
    this.layoutElement?.style.setProperty("--drawer-height", `${dvh}dvh`);
    this.handle.setAttribute("aria-valuenow", String(dvh));

    this.options.onRestore?.(dvh);
  }

  /**
   * Directly sets the drawer height in pixels within the allowed bounds.
   */
  setHeight(heightPx: number): void {
    const winHeight = window.innerHeight || 800;
    const maxHeight = Math.round(winHeight * (this.expandedDvh / 100));
    const clamped = Math.max(this.minHeight, Math.min(maxHeight, heightPx));
    this.drawer.style.setProperty("--drawer-height", `${clamped}px`);
    this.layoutElement?.style.setProperty("--drawer-height", `${clamped}px`);
    const percent = Math.round((clamped / winHeight) * 100);
    this.handle.setAttribute("aria-valuenow", String(percent));
    this.options.onHeightChange?.(clamped, percent);
  }

  private initDrag(): void {
    let wasMinimized = false;
    let startHeight = 0;
    let winHeight = 800;
    let maxHeight = 800;
    let wasDragged = false;

    this.disposables.add(
      trackPointerDrag(this.handle, {
        handleActiveClass: "is-dragging",
        // The handle is a child of the drawer, so `.drawer.is-dragging`
        // (and the reader's `.reader-dict-panel.is-dragging`) only match
        // if the panel is marked too. Those rules are what disable the height
        // transition mid-drag.
        activeClassTarget: this.drawer,
        bodyActiveClass: "resizing-drawer",
        filter: this.options.filter,
        /**
         * `window.innerHeight` is measured once per gesture and reused by
         * `onMove` and `onEnd`. It is layout-dependent, so reading it per move —
         * right after the previous move wrote `--drawer-height` — forces a
         * synchronous layout. The viewport cannot change mid-gesture: the handle
         * is `touch-action: none` (drawer.css), so there is no scroll-driven
         * URL-bar collapse to react to. Reusing it in `onEnd` also keeps the
         * snap decision on the same basis as the heights the drag just painted.
         */
        onStart: () => {
          winHeight = window.innerHeight || 800;
          maxHeight = Math.round(winHeight * (this.expandedDvh / 100));
          wasMinimized = this.isMinimized();
          startHeight = this.drawer.getBoundingClientRect().height;
          if (this.details && !this.details.open) {
            this.isUpdatingDetails = true;
            this.details.open = true;
            this.isUpdatingDetails = false;
            startHeight =
              this.drawer.getBoundingClientRect().height || this.minHeight;
          }
          if (wasMinimized) {
            this.drawer.classList.remove("drawer-minimized");
          }
          wasDragged = false;
        },
        onMove: ({ dy }) => {
          if (Math.abs(dy) > 6) {
            wasDragged = true;
          }
          const newHeight = Math.max(
            this.minHeight,
            Math.min(maxHeight, startHeight - dy)
          );
          this.drawer.style.setProperty("--drawer-height", `${newHeight}px`);
          this.layoutElement?.style.setProperty(
            "--drawer-height",
            `${newHeight}px`
          );
          const percent = Math.round((newHeight / winHeight) * 100);
          this.handle.setAttribute("aria-valuenow", String(percent));
          this.options.onHeightChange?.(newHeight, percent);
        },
        onEnd: ({ dy, elapsedMs, velocityY }) => {
          const currentHeight = this.drawer.getBoundingClientRect().height;
          const currentDvh = Math.round((currentHeight / winHeight) * 100);

          // Handle simple tap (minimal movement)
          if (Math.abs(dy) < 6 && elapsedMs < 350) {
            wasDragged = false;
            if (wasMinimized && !this.details) {
              this.restore();
            }
            return;
          }

          // Fast flick down detection:
          const vhPerSec = (dy / winHeight) * (1000 / elapsedMs);
          const isFastFlickDown =
            dy > 35 && (velocityY > 0.75 || vhPerSec > 1.1);

          // Dragged into floor threshold
          const isDraggedToFloor =
            currentDvh < this.floorDvh || currentHeight < 110;

          if (isFastFlickDown || isDraggedToFloor) {
            this.minimize();
            return;
          }

          const clampedDvh = Math.min(
            this.expandedDvh,
            Math.max(this.floorDvh, currentDvh)
          );
          this.restore(clampedDvh);
        },
      })
    );

    if (this.summary) {
      const onSummaryClick = (e: MouseEvent) => {
        if (wasDragged) {
          e.preventDefault();
          e.stopImmediatePropagation();
          wasDragged = false;
        }
      };
      this.summary.addEventListener("click", onSummaryClick, true);
      this.disposables.add(() => {
        this.summary?.removeEventListener("click", onSummaryClick, true);
      });
    }
  }

  private initKeyboard(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (this.isMinimized()) {
          this.restore(this.defaultDvh);
        } else {
          this.restore(this.expandedDvh);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentHeight = this.drawer.getBoundingClientRect().height;
        const winHeight = window.innerHeight || 800;
        if (currentHeight > winHeight * 0.6) {
          this.restore(this.defaultDvh);
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
    };
    this.handle.addEventListener("keydown", onKeyDown);
    this.disposables.add(() => {
      this.handle.removeEventListener("keydown", onKeyDown);
    });
  }

  private initDetailsSync(): void {
    if (!this.details) return;
    const onToggle = () => {
      if (this.isUpdatingDetails || !this.details) return;
      if (this.details.open) {
        this.restore();
      } else {
        this.minimize();
      }
    };
    this.details.addEventListener("toggle", onToggle);
    this.disposables.add(() => {
      this.details?.removeEventListener("toggle", onToggle);
    });
  }

  /**
   * Destroys all event listeners and gesture tracking.
   */
  destroy(): void {
    this.disposables.dispose();
  }
}
