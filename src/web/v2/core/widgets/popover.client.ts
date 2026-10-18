/**
 * Reusable Anchored Popover Controller & Keyboard Focus Trap
 *
 * Consolidates anchored popover positioning, focus trapping, Escape/outside-click
 * dismissal (via bindDismissable), clean DOM state reset on disconnect, and
 * grouped mutual exclusion via `morcus:popover-will-open`.
 */

import { computeAnchoredPlacement } from "@/web/v2/core/widgets/anchored_position.client";
import { BaseController } from "@/web/v2/core/dom/base_controller.client";
import {
  type CleanupFn,
  LifetimeScope,
} from "@/web/v2/core/dom/lifetime_scope.client";
import {
  bindDismissable,
  hasForeignDialog,
  isFocusIn,
} from "@/web/v2/core/widgets/dismissable.client";
import { assertConnected } from "@/web/v2/core/dom/dom.client";

export interface PopoverWillOpenDetail {
  source: unknown;
  group?: string;
}

type PopoverAlignment = "center" | "end";

interface AnchoredPopoverOptions {
  /** Root node (BaseElement, HTMLElement, or Document) owning this controller. */
  root?: ParentNode;
  /** Mutual-exclusion group name (e.g., "reader-chrome"). */
  group?: string;
  /** Horizontal alignment relative to the trigger button. Defaults to "end". */
  align?: PopoverAlignment;
  /** Fallback width (px) when offsetWidth is 0 in headless/jsdom environments. */
  defaultWidth?: number;
  /** Returns the popover/drawer panel element. */
  getPanel: () => HTMLElement | null;
  /** Returns the trigger button that toggles the popover. */
  getTrigger: () => HTMLElement | null;
  /** Optional: returns the full-viewport dismissal backdrop element. */
  getBackdrop?: () => HTMLElement | null;
  /** Optional: returns the close button inside the popover. */
  getCloseBtn?: () => HTMLElement | null;
  /**
   * Optional custom initial focus target resolver when the popover opens.
   * Defaults to focusing `getCloseBtn()`.
   */
  getInitialFocus?: (panel: HTMLElement) => HTMLElement | null;
  /** Optional callback invoked after the popover opens. */
  onOpen?: () => void;
  /** Optional callback invoked after the popover closes. */
  onClose?: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab and Shift+Tab keyboard focus within `panel` while open.
 *
 * Only intercepts Tab when focus is in the popover's context (`panel`, the
 * optional trigger, or nowhere / `<body>` — e.g. after clicking whitespace
 * in `panel` or when its focused child became hidden) and no `<dialog open>`
 * outside `panel` owns the keyboard. Returns an unbind cleanup function.
 */
export function trapFocus(
  panel: HTMLElement,
  getTrigger?: () => HTMLElement | null
): CleanupFn {
  const doc = panel.ownerDocument ?? document;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || e.defaultPrevented) return;

    const active = doc.activeElement;
    if (
      hasForeignDialog(doc, panel) ||
      !isFocusIn(doc, active, [panel, getTrigger?.()])
    ) {
      return;
    }

    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(
      (el) =>
        !el.hasAttribute("hidden") &&
        !el.closest("[hidden]") &&
        (el.offsetParent !== null || el.getClientRects().length > 0)
    );

    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        // Wraps Shift+Tab focus to the panel's last focusable while the trap is
        // active
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !panel.contains(active)) {
        // Wraps Tab focus to the panel's first focusable while the trap is
        // active
        e.preventDefault();
        first.focus();
      }
    }
  };

  // Tab isn't an activation key, so the gate never skips this listener.
  const scope = new LifetimeScope(doc);
  scope.listen(doc, "keydown", onKeyDown);
  return () => scope.dispose();
}

export class AnchoredPopoverController extends BaseController {
  #isOpen = false;
  #openScope: LifetimeScope | null = null;
  readonly #options: AnchoredPopoverOptions;
  readonly #group?: string;
  readonly #align: PopoverAlignment;
  readonly #defaultWidth: number;

  constructor(options: AnchoredPopoverOptions) {
    super(options.root ?? document);
    this.#options = options;
    this.#group = options.group;
    this.#align = options.align ?? "end";
    this.#defaultWidth =
      options.defaultWidth ?? (this.#align === "center" ? 360 : 320);
  }

  public get isOpen(): boolean {
    return this.#isOpen;
  }

  #getPanel(): HTMLElement | null {
    return this.#options.getPanel();
  }

  #getTrigger(): HTMLElement | null {
    return this.#options.getTrigger();
  }

  #getBackdrop(): HTMLElement | null {
    return this.#options.getBackdrop?.() ?? null;
  }

  #getCloseBtn(): HTMLElement | null {
    return this.#options.getCloseBtn?.() ?? null;
  }

  protected override onConnect(): void {
    const panel = this.#getPanel();
    if (!panel) return;

    const trigger = this.#getTrigger();
    const closeBtn = this.#getCloseBtn();
    const backdrop = this.#getBackdrop();

    this.scope.listen(trigger, "click", (e: MouseEvent) => {
      // This popover's trigger toggles the popover in place of its native
      // action
      e.preventDefault();
      // Keep the toggling click from reaching outside-click dismissal on
      // ancestors
      e.stopPropagation();
      this.toggle();
    });

    this.scope.listen(closeBtn, "click", (e: MouseEvent) => {
      // This popover's close button closes it in place of its native action
      e.preventDefault();
      this.close();
      this.#getTrigger()?.focus();
    });

    this.scope.listen(backdrop, "click", (e: MouseEvent) => {
      // A click on this popover's backdrop closes it in place of its native
      // action
      e.preventDefault();
      // Keep the backdrop click from reaching outside-click dismissal on
      // ancestors
      e.stopPropagation();
      this.close();
    });
  }

  protected override onDisconnect(): void {
    this.close();
  }

  public open(): void {
    const panel = this.#getPanel();
    if (this.#isOpen || !panel) return;
    if (process.env.NODE_ENV !== "production" && !this.isConnected) {
      // Unconnected, the while-open scope below derives from DEAD_SCOPE, so
      // dismissal, the focus trap and repositioning are silently dropped.
      throw new Error(
        "[UI V2] AnchoredPopoverController.open() called before connect(). " +
          "Register it with addController() or call connect() first."
      );
    }

    const doc = this.ownerDocument;
    if (this.#group) {
      doc.dispatchEvent(
        new CustomEvent<PopoverWillOpenDetail>("morcus:popover-will-open", {
          detail: { source: this, group: this.#group },
        })
      );
    }

    this.#isOpen = true;
    this.#sync();

    const initialFocus = this.#options.getInitialFocus
      ? this.#options.getInitialFocus(panel)
      : this.#getCloseBtn();
    initialFocus?.focus();

    this.#options.onOpen?.();
  }

  public close(): void {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#sync();
    this.#options.onClose?.();
  }

  public toggle(): void {
    if (this.#isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public updatePosition(): void {
    const panel = this.#getPanel();
    if (!this.#isOpen || !panel) return;

    const trigger = this.#getTrigger();
    assertConnected(panel, this.root);
    if (trigger) {
      assertConnected(trigger, this.root);
    }

    const win = this.ownerDocument.defaultView ?? window;
    const viewport = {
      width:
        win.innerWidth ||
        this.ownerDocument.documentElement?.clientWidth ||
        this.#defaultWidth,
      height: win.innerHeight,
    };
    const width = panel.offsetWidth || this.#defaultWidth;
    const centered = this.#align === "center";
    const rect = trigger?.getBoundingClientRect();
    // A zero rect means layout isn't available (jsdom/headless) or the trigger
    // is hidden. Centred panels then keep their CSS fallback position; end
    // panels fall back to the top-right corner.
    const measured = rect !== undefined && (rect.width > 0 || rect.height > 0);
    if (!measured && centered) return;
    const anchor = measured
      ? rect
      : {
          top: 40,
          bottom: 40,
          left: viewport.width - 44,
          right: viewport.width - 12,
          width: 32,
        };

    const placement = computeAnchoredPlacement(
      anchor,
      { width, height: panel.offsetHeight },
      viewport,
      {
        align: this.#align,
        side: "below",
        gap: 8,
        margin: 12,
        // Bounds: left >= radius + 6 (14px), right >= radius + 8 (16px) for --radius-lg (8px).
        caretInset: 16,
      }
    );

    if (!centered) panel.style.position = "fixed";
    panel.style.top = `${Math.round(placement.top)}px`;
    // Centred panels are positioned by their centre (`translateX(-50%)` in CSS).
    panel.style.left = `${Math.round(
      centered ? placement.left + width / 2 : placement.left
    )}px`;
    panel.style.setProperty(
      "--caret-left",
      `${Math.round(placement.caretLeft)}px`
    );
  }

  #sync(): void {
    const panel = this.#getPanel();
    const trigger = this.#getTrigger();
    const backdrop = this.#getBackdrop();
    if (panel) {
      assertConnected(panel, this.root);
      panel.hidden = !this.#isOpen;
      if (!this.#isOpen && this.#align === "center") {
        panel.style.removeProperty("top");
        panel.style.removeProperty("left");
        panel.style.removeProperty("--caret-left");
      }
    }
    if (backdrop) {
      assertConnected(backdrop, this.root);
      backdrop.hidden = !this.#isOpen;
    }
    if (trigger) {
      assertConnected(trigger, this.root);
      trigger.setAttribute("aria-expanded", String(this.#isOpen));
    }

    this.#openScope?.dispose();
    this.#openScope = null;
    if (!this.#isOpen || !panel) return;

    const doc = this.ownerDocument;
    const win = doc.defaultView ?? window;
    this.updatePosition();

    const scope = (this.#openScope = this.scope.createScope());
    scope.listen(win, "resize", () => this.updatePosition());
    scope.listen(win, "scroll", () => this.updatePosition(), {
      passive: true,
    });
    if (this.#group) {
      scope.listen<PopoverWillOpenDetail>(
        doc,
        "morcus:popover-will-open",
        (e) => {
          if (e.detail?.group === this.#group && e.detail?.source !== this) {
            this.close();
          }
        }
      );
    }

    scope.use(
      bindDismissable({
        container: panel,
        triggerEl: trigger,
        isOpen: () => this.#isOpen,
        ignore: (target) => Boolean(trigger?.contains(target)),
        onDismiss: () => this.close(),
      })
    );
    scope.use(trapFocus(panel, () => this.#getTrigger()));
  }
}
