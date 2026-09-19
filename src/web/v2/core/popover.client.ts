/**
 * Reusable Anchored Popover Controller & Keyboard Focus Trap
 *
 * Consolidates anchored popover positioning, focus trapping, Escape/outside-click
 * dismissal (via bindDismissable), clean DOM state reset on disconnect, and
 * grouped mutual exclusion via `morcus:popover-will-open`.
 */

import {
  BaseController,
  type CleanupFn,
  type LifetimeScope,
} from "@/web/v2/core/base_element.client";
import { bindDismissable } from "@/web/v2/core/dismissable.client";
import { assertConnected } from "@/web/v2/core/dom.client";

export interface PopoverWillOpenDetail {
  source: unknown;
  group?: string;
}

export type PopoverAlignment = "center" | "end";

export interface AnchoredPopoverOptions {
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
 * Returns an unbind cleanup function.
 */
export function trapFocus(panel: HTMLElement): CleanupFn {
  const doc = panel.ownerDocument ?? document;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab" || e.defaultPrevented) return;

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
    const active = doc.activeElement;

    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  doc.addEventListener("keydown", onKeyDown);

  return () => {
    doc.removeEventListener("keydown", onKeyDown);
  };
}

export class AnchoredPopoverController extends BaseController {
  private _isOpen = false;
  private openScope: LifetimeScope | null = null;
  private readonly options: AnchoredPopoverOptions;
  private readonly group?: string;
  private readonly align: PopoverAlignment;
  private readonly defaultWidth: number;

  constructor(options: AnchoredPopoverOptions) {
    super(options.root ?? document);
    this.options = options;
    this.group = options.group;
    this.align = options.align ?? "end";
    this.defaultWidth =
      options.defaultWidth ?? (this.align === "center" ? 360 : 320);
  }

  public get isOpen(): boolean {
    return this._isOpen;
  }

  private getPanel(): HTMLElement | null {
    return this.options.getPanel();
  }

  private getTrigger(): HTMLElement | null {
    return this.options.getTrigger();
  }

  private getBackdrop(): HTMLElement | null {
    return this.options.getBackdrop?.() ?? null;
  }

  private getCloseBtn(): HTMLElement | null {
    return this.options.getCloseBtn?.() ?? null;
  }

  protected override onConnect(): void {
    const panel = this.getPanel();
    if (!panel) return;

    const trigger = this.getTrigger();
    const closeBtn = this.getCloseBtn();
    const backdrop = this.getBackdrop();

    this.scope.listen(trigger, "click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });

    this.scope.listen(closeBtn, "click", (e: MouseEvent) => {
      e.preventDefault();
      this.close();
      this.getTrigger()?.focus();
    });

    this.scope.listen(backdrop, "click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });
  }

  protected override onDisconnect(): void {
    this.close();
  }

  public open(): void {
    const panel = this.getPanel();
    if (this._isOpen || !panel) return;

    const doc = this.ownerDocument;
    if (this.group) {
      doc.dispatchEvent(
        new CustomEvent<PopoverWillOpenDetail>("morcus:popover-will-open", {
          detail: { source: this, group: this.group },
        })
      );
    }

    this._isOpen = true;
    this.sync();

    const initialFocus = this.options.getInitialFocus
      ? this.options.getInitialFocus(panel)
      : this.getCloseBtn();
    initialFocus?.focus();

    this.options.onOpen?.();
  }

  public close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.sync();
    this.options.onClose?.();
  }

  public toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public updatePosition(): void {
    const panel = this.getPanel();
    if (!this._isOpen || !panel) return;

    const trigger = this.getTrigger();
    assertConnected(panel, this.root);
    if (trigger) {
      assertConnected(trigger, this.root);
    }

    if (this.align === "center") {
      if (trigger && typeof trigger.getBoundingClientRect === "function") {
        const rect = trigger.getBoundingClientRect();
        if (rect.bottom > 0) {
          panel.style.top = `${Math.round(rect.bottom + 8)}px`;
        }

        const btnCenter = rect.left + rect.width / 2;
        const win = panel.ownerDocument?.defaultView ?? window;
        const viewportWidth =
          win.innerWidth ||
          panel.ownerDocument?.documentElement?.clientWidth ||
          this.defaultWidth;
        const drawerWidth = panel.offsetWidth || this.defaultWidth;
        const halfWidth = drawerWidth / 2;
        const minCenter = halfWidth + 12;
        const maxCenter = Math.max(minCenter, viewportWidth - halfWidth - 12);
        const clampedCenter = Math.max(
          minCenter,
          Math.min(btnCenter, maxCenter)
        );

        panel.style.left = `${Math.round(clampedCenter)}px`;

        const caretLeft = btnCenter - (clampedCenter - halfWidth);
        const clampedCaret = Math.max(
          16,
          Math.min(caretLeft, drawerWidth - 16)
        );
        panel.style.setProperty(
          "--caret-left",
          `${Math.round(clampedCaret)}px`
        );
      }
      return;
    }

    const docEl = this.ownerDocument.documentElement;
    const win = this.ownerDocument.defaultView ?? window;
    const viewportWidth = win.innerWidth || docEl?.clientWidth || 1024;
    const margin = 12;
    const popoverWidth = panel.offsetWidth || this.defaultWidth;

    let top = 48;
    let btnCenterX = viewportWidth - 28;
    let targetLeft = viewportWidth - popoverWidth - margin;

    if (trigger && typeof trigger.getBoundingClientRect === "function") {
      const btnRect = trigger.getBoundingClientRect();
      if (btnRect.bottom || btnRect.top) {
        top = btnRect.bottom + 8;
      }
      if (btnRect.width || btnRect.height) {
        btnCenterX = btnRect.left + btnRect.width / 2;
        targetLeft = btnRect.right - popoverWidth;
      }
    }

    const maxLeft = Math.max(margin, viewportWidth - popoverWidth - margin);
    const left = Math.max(margin, Math.min(targetLeft, maxLeft));

    const caretLeft = btnCenterX - left;
    const clampedCaretLeft = Math.max(
      16,
      Math.min(caretLeft, popoverWidth - 16)
    );

    panel.style.position = "fixed";
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.setProperty(
      "--caret-left",
      `${Math.round(clampedCaretLeft)}px`
    );
  }

  private sync(): void {
    const panel = this.getPanel();
    const trigger = this.getTrigger();
    const backdrop = this.getBackdrop();
    if (panel) {
      assertConnected(panel, this.root);
      panel.hidden = !this._isOpen;
      if (!this._isOpen && this.align === "center") {
        panel.style.removeProperty("top");
        panel.style.removeProperty("left");
        panel.style.removeProperty("--caret-left");
      }
    }
    if (backdrop) {
      assertConnected(backdrop, this.root);
      backdrop.hidden = !this._isOpen;
    }
    if (trigger) {
      assertConnected(trigger, this.root);
      trigger.setAttribute("aria-expanded", String(this._isOpen));
    }

    this.openScope?.dispose();
    this.openScope = null;
    if (!this._isOpen || !panel) return;

    const doc = this.ownerDocument;
    const win = doc.defaultView ?? window;
    this.updatePosition();

    const scope = (this.openScope = this.scope.createScope());
    scope.listen(win, "resize", () => this.updatePosition());
    scope.listen(win, "scroll", () => this.updatePosition(), {
      passive: true,
    });
    if (this.group) {
      scope.listen<PopoverWillOpenDetail>(
        doc,
        "morcus:popover-will-open",
        (e) => {
          if (e.detail?.group === this.group && e.detail?.source !== this) {
            this.close();
          }
        }
      );
    }

    scope.use(
      bindDismissable({
        container: panel,
        triggerEl: trigger,
        isOpen: () => this._isOpen,
        ignore: (target) => Boolean(trigger?.contains(target)),
        onDismiss: () => this.close(),
      })
    );
    scope.use(trapFocus(panel));
  }
}
