/**
 * UI V2 Reader Table of Contents (TOC) Controller
 *
 * Progressively enhances the reader's Table of Contents drawer.
 * Coordinates drawer open/close state, trigger buttons (including sticky header
 * and breadcrumb triggers), live section search/filtering, outside-click
 * dismissal, and keyboard accessibility (Escape to close).
 */

import {
  BaseController,
  type LifetimeScope,
} from "@/web/v2/core/base_element.client";

export interface ReaderTocElements {
  /** The slide-in drawer element (#reader-toc-drawer) */
  drawer: HTMLElement | null;
  /** Full-viewport dismissal backdrop (#reader-toc-backdrop) */
  backdrop?: HTMLElement | null;
  /** Primary trigger button in sticky header (#reader-toc-btn) */
  triggerBtn?: HTMLElement | null;
  /** Close '×' button in drawer header (#reader-toc-close-btn) */
  closeBtn?: HTMLElement | null;
  /** Container holding the list of TOC items (#reader-toc-list) */
  listContainer?: HTMLElement | null;
}

export interface ReaderTocOptions {
  /** Root container (defaults to document) used to query elements */
  root?: ParentNode;
  /** Explicit element overrides */
  elements?: Partial<ReaderTocElements>;
  /** Optional callback fired when the drawer opens */
  onOpen?: () => void;
  /** Optional callback fired when the drawer closes */
  onClose?: () => void;
}

export class ReaderTocController extends BaseController {
  private openScope: LifetimeScope | null = null;
  public drawer: HTMLElement | null = null;
  public backdrop: HTMLElement | null = null;
  public triggerBtn: HTMLElement | null = null;
  public closeBtn: HTMLElement | null = null;
  public listContainer: HTMLElement | null = null;
  private readonly overrides?: Partial<ReaderTocElements>;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;

  constructor(options: ReaderTocOptions = {}) {
    super(options.root ?? document);
    this.overrides = options.elements;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
  }

  protected override onConnect(): void {
    this.resolveElements();
    if (!this.drawer) {
      return;
    }
    this.initListeners();
  }

  protected override onDisconnect(): void {
    this.close();
  }

  private resolveElements(): void {
    const overrides = this.overrides;

    this.drawer =
      overrides?.drawer !== undefined
        ? overrides.drawer
        : this.$("#reader-toc-drawer");

    this.backdrop =
      overrides?.backdrop !== undefined
        ? overrides.backdrop
        : this.$("#reader-toc-backdrop") ??
          this.ownerDocument.querySelector<HTMLElement>("#reader-toc-backdrop");

    this.triggerBtn =
      overrides?.triggerBtn !== undefined
        ? overrides.triggerBtn
        : this.$("#reader-toc-btn");

    this.closeBtn =
      overrides?.closeBtn !== undefined
        ? overrides.closeBtn
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-close-btn") ??
          this.$("#reader-toc-close-btn");

    this.listContainer =
      overrides?.listContainer !== undefined
        ? overrides.listContainer
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-list") ??
          this.$("#reader-toc-list");
  }

  private initListeners(): void {
    // Trigger button toggles drawer (preventDefault suppresses hash navigation in JS mode)
    this.listen(this.triggerBtn, "click", (e: MouseEvent) => {
      e.preventDefault();
      this.toggle();
    });

    // Close button inside drawer
    this.listen(this.closeBtn, "click", (e: MouseEvent) => {
      e.preventDefault();
      this.close();
      this.triggerBtn?.focus();
    });

    // Dismiss on backdrop click: stopPropagation prevents bubbling to doc click listener
    this.listen(this.backdrop, "click", (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      this.close();
    });

    // Dismiss on outside click (fallback when clicking outside drawer or trigger button)
    const doc = this.drawer?.ownerDocument ?? this.ownerDocument;
    this.listen(doc, "click", (e: MouseEvent) => {
      if (this.isOpen() && e.target instanceof Node) {
        if (
          !this.drawer?.contains(e.target) &&
          !this.triggerBtn?.contains(e.target)
        ) {
          this.close();
        }
      }
    });

    // Keyboard navigation (Escape key dismissal & Tab focus cycling within dropdown)
    const win = doc.defaultView ?? window;
    this.listen(win, "keydown", (e: KeyboardEvent) => {
      if (!this.isOpen()) return;

      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
        this.triggerBtn?.focus();
        return;
      }

      if (e.key === "Tab" && this.drawer) {
        const focusables = Array.from(
          this.drawer.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          (el) => el.offsetParent !== null || el.getClientRects().length > 0
        );

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = doc.activeElement;

        if (e.shiftKey) {
          if (active === first || !this.drawer.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !this.drawer.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    });
  }

  /**
   * Recomputes and updates the dropdown's position anchored beneath the trigger button.
   */
  public updatePosition(): void {
    if (!this.drawer || !this.isOpen()) return;

    if (
      this.triggerBtn &&
      typeof this.triggerBtn.getBoundingClientRect === "function"
    ) {
      const rect = this.triggerBtn.getBoundingClientRect();
      if (rect.bottom > 0) {
        this.drawer.style.top = `${Math.round(rect.bottom + 8)}px`;
      }

      const btnCenter = rect.left + rect.width / 2;
      const win = this.drawer.ownerDocument?.defaultView ?? window;
      const viewportWidth =
        win.innerWidth ||
        this.drawer.ownerDocument?.documentElement?.clientWidth ||
        360;
      const drawerWidth = this.drawer.offsetWidth || 360;
      const halfWidth = drawerWidth / 2;
      const minCenter = halfWidth + 12;
      const maxCenter = Math.max(minCenter, viewportWidth - halfWidth - 12);
      const clampedCenter = Math.max(minCenter, Math.min(btnCenter, maxCenter));

      this.drawer.style.left = `${Math.round(clampedCenter)}px`;

      const caretLeft = btnCenter - (clampedCenter - halfWidth);
      const clampedCaret = Math.max(16, Math.min(caretLeft, drawerWidth - 16));
      this.drawer.style.setProperty(
        "--caret-left",
        `${Math.round(clampedCaret)}px`
      );
    }
  }

  public open(): void {
    if (!this.drawer || this.isOpen()) return;
    this.drawer.removeAttribute("hidden");
    this.backdrop?.removeAttribute("hidden");

    this.updatePosition();

    // Dynamically update position on resize or scroll while open
    this.openScope?.dispose();
    const scope = (this.openScope = this.createScope());
    const win = this.drawer.ownerDocument?.defaultView ?? window;
    const onReposition = () => this.updatePosition();
    scope.listen(win, "resize", onReposition);
    scope.listen(win, "scroll", onReposition, { passive: true });

    this.triggerBtn?.setAttribute("aria-expanded", "true");

    // Focus landing spot: prioritize active section, then close button
    const activeItem = this.drawer.querySelector<HTMLElement>(
      ".reader-toc-item.active"
    );
    if (activeItem) {
      activeItem.focus();
      if (typeof activeItem.scrollIntoView === "function") {
        activeItem.scrollIntoView({ block: "nearest" });
      }
    } else {
      this.closeBtn?.focus();
    }

    this.onOpen?.();
  }

  public close(): void {
    if (!this.drawer) return;
    this.openScope?.dispose();
    this.openScope = null;
    this.drawer.setAttribute("hidden", "");
    this.backdrop?.setAttribute("hidden", "");
    this.drawer.style.removeProperty("top");
    this.drawer.style.removeProperty("left");
    this.drawer.style.removeProperty("--caret-left");
    this.triggerBtn?.setAttribute("aria-expanded", "false");
    this.onClose?.();
  }

  public toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  public isOpen(): boolean {
    return Boolean(this.drawer && !this.drawer.hasAttribute("hidden"));
  }
}
