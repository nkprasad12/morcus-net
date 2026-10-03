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

import { BaseController } from "@/web/v2/core/base_element.client";
import { trackPointerDrag } from "@/web/v2/core/gesture.client";
import { setPrepaint } from "@/web/v2/core/prepaint.client";
import { storage } from "@/web/v2/core/storage.client";

/**
 * Bounds for the desktop dictionary panel, in px. There is no fixed maximum:
 * the dictionary may grow until the passage is down to `MIN_TEXT_PANEL_WIDTH`,
 * so on wide screens (or the Full page width preset) it can take most of the
 * row. `SPLIT_CHROME_WIDTH` is the splitter (16px) plus the passage column's
 * right margin (`--space-3`, 6px); reader_dict.css mirrors the same total as
 * `max-width: calc(100% - 342px)`.
 */
export const MIN_SPLIT_WIDTH = 300;
export const MIN_TEXT_PANEL_WIDTH = 320;
export const SPLIT_CHROME_WIDTH = 22;
export const DEFAULT_SPLIT_WIDTH = 420;
export const READER_DICT_WIDTH_STORAGE_KEY = "morcus_v2_reader_dict_width";

/**
 * Computes the maximum allowable dictionary split width based on available
 * container width, guaranteeing at least `MIN_TEXT_PANEL_WIDTH` for reading text.
 */
export function computeMaxSplitWidth(containerWidth: number): number {
  return Math.max(
    MIN_SPLIT_WIDTH,
    containerWidth - MIN_TEXT_PANEL_WIDTH - SPLIT_CHROME_WIDTH
  );
}

export interface ReaderLayoutElements {
  /** The split container element (.reader-split-layout) */
  splitLayout: HTMLElement | null;
  /** The draggable divider separator (.reader-splitter) */
  splitter: HTMLElement | null;
  /** The dictionary panel element (.reader-dict-panel) */
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

export class ReaderLayoutController extends BaseController {
  public splitLayout: HTMLElement | null = null;
  public splitter: HTMLElement | null = null;
  public dictPanel: HTMLElement | null = null;
  private readonly overrides?: Partial<ReaderLayoutElements>;
  private readonly storageKey: string;
  private readonly onWidthChange?: (width: number) => void;

  constructor(options: ReaderLayoutOptions = {}) {
    super(options.root ?? document);
    this.overrides = options.elements;
    this.storageKey = options.storageKey ?? READER_DICT_WIDTH_STORAGE_KEY;
    this.onWidthChange = options.onWidthChange;
    this.resolveElements();
  }

  private resolveElements(): void {
    const overrides = this.overrides;

    this.splitLayout =
      overrides?.splitLayout !== undefined
        ? overrides.splitLayout
        : this.root.querySelector<HTMLElement>(".reader-split-layout");

    this.splitter =
      overrides?.splitter !== undefined
        ? overrides.splitter
        : this.root.querySelector<HTMLElement>(".reader-splitter");

    this.dictPanel =
      overrides?.dictPanel !== undefined
        ? overrides.dictPanel
        : this.root.querySelector<HTMLElement>(".reader-dict-panel");
  }

  protected override onConnect(): void {
    this.resolveElements();
    if (!this.splitter || !this.splitLayout || !this.dictPanel) {
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

    const savedWidth = storage.get(this.storageKey);
    let restored: number | null = null;
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      // No upper bound: the saved width may come from a wider window, and
      // reader_dict.css clamps the panel to the current container.
      if (!isNaN(parsed) && parsed >= MIN_SPLIT_WIDTH) {
        restored = parsed;
        splitLayout.style.setProperty("--dict-width", `${parsed}px`);
        splitter.setAttribute("aria-valuenow", String(parsed));
      }
    }
    // Re-record on every connect so a stale pre-paint snapshot heals.
    this.recordPrepaintWidth(restored);
  }

  /**
   * Records the persisted width for the critical script to apply to <html>
   * before first paint. Only called for committed widths (release, keyboard,
   * reset), never per pointer move: a root custom property restyles the
   * whole page.
   */
  private recordPrepaintWidth(width: number | null): void {
    setPrepaint("--dict-width", width === null ? null : `${width}px`);
  }

  private initDrag() {
    const splitter = this.splitter;
    const splitLayout = this.splitLayout;
    const dictPanel = this.dictPanel;
    if (!splitter || !splitLayout || !dictPanel) return;

    let startWidth = 0;
    let maxWidth = MIN_SPLIT_WIDTH;
    const unfreezeIframe = () =>
      splitLayout.style.removeProperty("--dict-frozen-width");

    this.scope.use(
      trackPointerDrag(splitter, {
        handleActiveClass: "is-resizing",
        bodyActiveClass: "resizing-panels",
        /**
         * Both measurements are taken once, here, because `onMove` writes
         * `--dict-width`: reading either one per move would be a
         * read-after-write and would force a synchronous layout of the whole
         * passage on every pointer event.
         *
         * Safe because the container width does not depend on the value being
         * written. At this breakpoint `.reader-split-layout` is a `flex: 1`
         * row whose width comes from its parent, and `--dict-width` only
         * divides space between its children (reader.css). The drag classes
         * applied immediately after this callback only set the handle's
         * `cursor` and the iframe's `pointer-events` / frozen width, so
         * measuring before them is equivalent.
         *
         * The iframe width is read with them, before any write, and frozen
         * via `--dict-frozen-width` (reader_dict.css) so the embedded
         * dictionary document does not relayout on every move. A deferred
         * dictionary has no iframe yet, so there is nothing to freeze.
         */
        onStart: () => {
          startWidth = dictPanel.getBoundingClientRect().width;
          const containerWidth = splitLayout.getBoundingClientRect().width;
          const iframeWidth = dictPanel
            .querySelector<HTMLElement>(".dict-iframe")
            ?.getBoundingClientRect().width;
          maxWidth = computeMaxSplitWidth(containerWidth);
          splitter.setAttribute("aria-valuemax", String(maxWidth));
          if (iframeWidth !== undefined && iframeWidth > 0) {
            splitLayout.style.setProperty(
              "--dict-frozen-width",
              `${iframeWidth}px`
            );
          }
        },
        onMove: ({ dx }) => {
          const newWidth = Math.round(
            Math.max(MIN_SPLIT_WIDTH, Math.min(maxWidth, startWidth - dx))
          );
          splitLayout.style.setProperty("--dict-width", `${newWidth}px`);
          splitter.setAttribute("aria-valuenow", String(newWidth));
          this.onWidthChange?.(newWidth);
        },
        onEnd: () => {
          const finalWidth = parseInt(
            splitter.getAttribute("aria-valuenow") ||
              String(DEFAULT_SPLIT_WIDTH),
            10
          );
          storage.set(this.storageKey, String(finalWidth));
          this.recordPrepaintWidth(finalWidth);
          // Also runs on pointercancel. The final `--dict-width` is already
          // set, so the iframe resizes to the committed width exactly once.
          unfreezeIframe();
        },
      })
    );
    // Unbinding mid-drag skips onEnd; never leave a stale frozen width.
    this.scope.use(unfreezeIframe);
  }

  private initDblClick() {
    const splitter = this.splitter;
    if (!splitter) return;

    this.scope.listen(splitter, "dblclick", () => {
      this.resetWidth();
    });
  }

  private initKeyboard() {
    const splitter = this.splitter;
    const splitLayout = this.splitLayout;
    if (!splitter || !splitLayout) return;

    this.scope.listen(splitter, "keydown", (e: KeyboardEvent) => {
      const currentWidth = parseInt(
        splitter.getAttribute("aria-valuenow") || String(DEFAULT_SPLIT_WIDTH),
        10
      );
      const containerWidth = splitLayout.getBoundingClientRect().width;
      const keyMaxWidth = computeMaxSplitWidth(containerWidth);
      splitter.setAttribute("aria-valuemax", String(keyMaxWidth));
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
        // Arrow/Home/End on the splitter it owns resize the panel instead of
        // scrolling
        e.preventDefault();
        this.setWidth(nextWidth, true);
      }
    });
  }

  /**
   * Returns the current dictionary panel width in px parsed from the splitter's
   * aria-valuenow attribute (falling back to DEFAULT_SPLIT_WIDTH).
   */
  public getWidth(): number {
    this.resolveElements();
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
    this.resolveElements();
    if (this.splitLayout) {
      this.splitLayout.style.setProperty("--dict-width", `${width}px`);
    }
    if (this.splitter) {
      this.splitter.setAttribute("aria-valuenow", String(width));
    }
    this.onWidthChange?.(width);
    if (persist) {
      storage.set(this.storageKey, String(width));
      this.recordPrepaintWidth(width);
    }
  }

  /**
   * Resets the split width to the default (420px), removes the custom CSS property,
   * resets ARIA attributes, and clears the persisted entry from localStorage.
   */
  public resetWidth(): void {
    this.resolveElements();
    if (this.splitLayout) {
      this.splitLayout.style.removeProperty("--dict-width");
    }
    if (this.splitter) {
      this.splitter.setAttribute("aria-valuenow", String(DEFAULT_SPLIT_WIDTH));
    }
    storage.remove(this.storageKey);
    this.recordPrepaintWidth(null);
    this.onWidthChange?.(DEFAULT_SPLIT_WIDTH);
  }

  /**
   * Updates split layout CSS classes between active (expanded content) and empty.
   */
  public setActive(active: boolean): void {
    this.resolveElements();
    if (!this.splitLayout) return;
    if (active) {
      this.splitLayout.classList.remove("reader-layout-empty");
      this.splitLayout.classList.add("reader-layout-active");
    } else {
      this.splitLayout.classList.remove("reader-layout-active");
      this.splitLayout.classList.add("reader-layout-empty");
    }
  }
}

export { ReaderLayoutController as ReaderSplitterController };
