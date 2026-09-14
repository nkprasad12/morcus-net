/**
 * UI V2 Reader Layout & Desktop Splitter Controller
 *
 * Coordinates the two-column split layout between the reader passage and
 * dictionary panel on desktop screens:
 * - Resizable splitter gutter with pointer drag and touch suppression
 * - Keyboard navigation (Arrow keys, Home, End, Enter/Escape reset)
 * - LocalStorage persistence of user-preferred panel widths
 * - Preserves zero-reflow layout writes during active drag gestures
 */

import { DisposableBag } from "@/web/v2/core/disposable.client";
import { trackPointerDrag } from "@/web/v2/core/gesture.client";

/**
 * Bounds for the desktop dictionary panel, in px. `MIN_TEXT_PANEL_WIDTH` is the
 * slice reserved for the passage, so the dictionary may grow to the container
 * width less that much, capped at `MAX_SPLIT_WIDTH`.
 */
export const MIN_SPLIT_WIDTH = 300;
export const MAX_SPLIT_WIDTH = 800;
export const MIN_TEXT_PANEL_WIDTH = 320;
export const DEFAULT_SPLIT_WIDTH = 420;
export const READER_DICT_WIDTH_STORAGE_KEY = "morcus_v2_reader_dict_width";

/**
 * Computes the maximum allowable dictionary split width based on available
 * container width, guaranteeing at least `MIN_TEXT_PANEL_WIDTH` for reading text.
 */
export function computeMaxSplitWidth(containerWidth: number): number {
  return Math.max(
    MIN_SPLIT_WIDTH,
    Math.min(MAX_SPLIT_WIDTH, containerWidth - MIN_TEXT_PANEL_WIDTH)
  );
}

export interface ReaderLayoutElements {
  /** The split container element (.v2-reader-split-layout) */
  splitLayout: HTMLElement | null;
  /** The draggable divider separator (.v2-reader-splitter) */
  splitter: HTMLElement | null;
  /** The dictionary panel element (.v2-reader-dict-panel) */
  dictPanel: HTMLElement | null;
}

export interface ReaderLayoutOptions {
  /** Root container used to query layout elements (defaults to document) */
  root?: ParentNode;
  /** Explicit element overrides */
  elements?: Partial<ReaderLayoutElements>;
  /** Storage key for persisting width (defaults to morcus_v2_reader_dict_width) */
  storageKey?: string;
  /** Optional callback fired when width changes */
  onWidthChange?: (width: number) => void;
}

export class ReaderLayoutController {
  private readonly disposables = new DisposableBag();
  public readonly splitLayout: HTMLElement | null;
  public readonly splitter: HTMLElement | null;
  public readonly dictPanel: HTMLElement | null;
  private readonly storageKey: string;
  private readonly onWidthChange?: (width: number) => void;

  constructor(options: ReaderLayoutOptions = {}) {
    const root = options.root ?? document;
    const overrides = options.elements;

    this.splitLayout =
      overrides?.splitLayout !== undefined
        ? overrides.splitLayout
        : root.querySelector<HTMLElement>(".v2-reader-split-layout");

    this.splitter =
      overrides?.splitter !== undefined
        ? overrides.splitter
        : root.querySelector<HTMLElement>(".v2-reader-splitter");

    this.dictPanel =
      overrides?.dictPanel !== undefined
        ? overrides.dictPanel
        : root.querySelector<HTMLElement>(".v2-reader-dict-panel");

    this.storageKey = options.storageKey ?? READER_DICT_WIDTH_STORAGE_KEY;
    this.onWidthChange = options.onWidthChange;

    const splitter = this.splitter;
    const splitLayout = this.splitLayout;
    const dictPanel = this.dictPanel;
    if (!splitter || !splitLayout || !dictPanel) {
      return;
    }

    this.restoreSavedWidth();
    this.initDrag();
    this.initDblClick();
    this.initKeyboard();
  }

  private restoreSavedWidth() {
    const splitLayout = this.splitLayout;
    const splitter = this.splitter;
    if (!splitLayout || !splitter) return;

    try {
      const savedWidth = localStorage.getItem(this.storageKey);
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= MIN_SPLIT_WIDTH && parsed <= 900) {
          splitLayout.style.setProperty("--v2-dict-width", `${parsed}px`);
          splitter.setAttribute("aria-valuenow", String(parsed));
        }
      }
    } catch {
      // localStorage may be disabled
    }
  }

  private initDrag() {
    const splitter = this.splitter;
    const splitLayout = this.splitLayout;
    const dictPanel = this.dictPanel;
    if (!splitter || !splitLayout || !dictPanel) return;

    let startWidth = 0;
    let maxWidth = MAX_SPLIT_WIDTH;

    const unbind = trackPointerDrag(splitter, {
      handleActiveClass: "v2-is-resizing",
      bodyActiveClass: "v2-resizing-panels",
      /**
       * Both measurements are taken once, here, because `onMove` writes
       * `--v2-dict-width`: reading either one per move would be a
       * read-after-write and would force a synchronous layout of the whole
       * passage on every pointer event.
       *
       * Safe because the container width does not depend on the value being
       * written. At this breakpoint `.v2-reader-split-layout` is a `flex: 1`
       * row whose width comes from its parent, and `--v2-dict-width` only
       * divides space between its children (reader.css). The drag classes
       * applied immediately after this callback are `user-select` / `cursor` /
       * `pointer-events` only, so measuring before them is equivalent.
       */
      onStart: () => {
        startWidth = dictPanel.getBoundingClientRect().width;
        const containerWidth = splitLayout.getBoundingClientRect().width;
        maxWidth = computeMaxSplitWidth(containerWidth);
      },
      onMove: ({ dx }) => {
        const newWidth = Math.round(
          Math.max(MIN_SPLIT_WIDTH, Math.min(maxWidth, startWidth - dx))
        );
        splitLayout.style.setProperty("--v2-dict-width", `${newWidth}px`);
        splitter.setAttribute("aria-valuenow", String(newWidth));
        this.onWidthChange?.(newWidth);
      },
      onEnd: () => {
        const finalWidth = parseInt(
          splitter.getAttribute("aria-valuenow") || String(DEFAULT_SPLIT_WIDTH),
          10
        );
        try {
          localStorage.setItem(this.storageKey, String(finalWidth));
        } catch {
          // ignore
        }
      },
    });

    this.disposables.add(unbind);
  }

  private initDblClick() {
    const splitter = this.splitter;
    if (!splitter) return;

    const onDblClick = () => {
      this.resetWidth();
    };

    splitter.addEventListener("dblclick", onDblClick);
    this.disposables.add(() => {
      splitter.removeEventListener("dblclick", onDblClick);
    });
  }

  private initKeyboard() {
    const splitter = this.splitter;
    const splitLayout = this.splitLayout;
    if (!splitter || !splitLayout) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const currentWidth = parseInt(
        splitter.getAttribute("aria-valuenow") || String(DEFAULT_SPLIT_WIDTH),
        10
      );
      const containerWidth = splitLayout.getBoundingClientRect().width;
      const keyMaxWidth = computeMaxSplitWidth(containerWidth);
      let nextWidth: number | null = null;

      if (e.key === "ArrowLeft") {
        nextWidth = Math.min(keyMaxWidth, currentWidth + 24);
      } else if (e.key === "ArrowRight") {
        nextWidth = Math.max(MIN_SPLIT_WIDTH, currentWidth - 24);
      } else if (e.key === "Home") {
        nextWidth = MIN_SPLIT_WIDTH;
      } else if (e.key === "End") {
        nextWidth = keyMaxWidth;
      } else if (e.key === "Enter" || e.key === "Escape") {
        this.resetWidth();
        return;
      }

      if (nextWidth !== null) {
        e.preventDefault();
        this.setWidth(nextWidth, true);
      }
    };

    splitter.addEventListener("keydown", onKeyDown);
    this.disposables.add(() => {
      splitter.removeEventListener("keydown", onKeyDown);
    });
  }

  /**
   * Returns the current dictionary panel width in px parsed from the splitter's
   * aria-valuenow attribute (falling back to DEFAULT_SPLIT_WIDTH).
   */
  public getWidth(): number {
    if (this.splitter) {
      const parsed = parseInt(
        this.splitter.getAttribute("aria-valuenow") || "",
        10
      );
      if (!isNaN(parsed)) return parsed;
    }
    return DEFAULT_SPLIT_WIDTH;
  }

  /**
   * Sets the dictionary panel split width in CSS and updates ARIA attributes.
   * Optionally persists the new width to localStorage.
   */
  public setWidth(width: number, persist: boolean = false): void {
    if (this.splitLayout) {
      this.splitLayout.style.setProperty("--v2-dict-width", `${width}px`);
    }
    if (this.splitter) {
      this.splitter.setAttribute("aria-valuenow", String(width));
    }
    this.onWidthChange?.(width);
    if (persist) {
      try {
        localStorage.setItem(this.storageKey, String(width));
      } catch {
        // ignore
      }
    }
  }

  /**
   * Resets the split width to the default (420px), removes the custom CSS property,
   * resets ARIA attributes, and clears the persisted entry from localStorage.
   */
  public resetWidth(): void {
    if (this.splitLayout) {
      this.splitLayout.style.removeProperty("--v2-dict-width");
    }
    if (this.splitter) {
      this.splitter.setAttribute("aria-valuenow", String(DEFAULT_SPLIT_WIDTH));
    }
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // ignore
    }
    this.onWidthChange?.(DEFAULT_SPLIT_WIDTH);
  }

  /**
   * Updates split layout CSS classes between active (expanded content) and empty.
   */
  public setActive(active: boolean): void {
    if (!this.splitLayout) return;
    if (active) {
      this.splitLayout.classList.remove("v2-reader-layout-empty");
      this.splitLayout.classList.add("v2-reader-layout-active");
    } else {
      this.splitLayout.classList.remove("v2-reader-layout-active");
      this.splitLayout.classList.add("v2-reader-layout-empty");
    }
  }

  /**
   * Cleans up all registered event listeners and gesture tracking.
   */
  public destroy(): void {
    this.disposables.dispose();
  }
}

export { ReaderLayoutController as ReaderSplitterController };
