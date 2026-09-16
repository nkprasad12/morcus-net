/**
 * UI V2 Reader Table of Contents (TOC) Controller
 *
 * Progressively enhances the reader's Table of Contents drawer.
 * Coordinates drawer open/close state, trigger buttons (including sticky header
 * and breadcrumb triggers), live section search/filtering, outside-click
 * dismissal, and keyboard accessibility (Escape to close).
 */

import { DisposableBag } from "@/web/v2/core/disposable.client";

export interface ReaderTocElements {
  /** The slide-in drawer element (#reader-toc-drawer) */
  drawer: HTMLElement | null;
  /** Full-viewport dismissal backdrop (#reader-toc-backdrop) */
  backdrop?: HTMLElement | null;
  /** Primary trigger button in sticky header (#reader-toc-btn) */
  triggerBtn?: HTMLElement | null;
  /** Optional breadcrumb button (#reader-breadcrumb-btn) */
  breadcrumbBtn?: HTMLElement | null;
  /** Close '×' button in drawer header (#reader-toc-close-btn) */
  closeBtn?: HTMLElement | null;
  /** '← Back' button in drawer header (#reader-toc-back-btn) */
  backBtn?: HTMLElement | null;
  /** Search/filter text input (#reader-toc-filter) */
  filterInput?: HTMLInputElement | null;
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

export class ReaderTocController {
  private readonly disposables = new DisposableBag();
  private readonly openDisposables = new DisposableBag();
  public readonly drawer: HTMLElement | null;
  public readonly backdrop: HTMLElement | null;
  public readonly triggerBtn: HTMLElement | null;
  public readonly breadcrumbBtn: HTMLElement | null;
  public readonly closeBtn: HTMLElement | null;
  public readonly backBtn: HTMLElement | null;
  public readonly filterInput: HTMLInputElement | null;
  public readonly listContainer: HTMLElement | null;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;

  constructor(options: ReaderTocOptions = {}) {
    const root = options.root ?? document;
    const overrides = options.elements;

    this.drawer =
      overrides?.drawer !== undefined
        ? overrides.drawer
        : root.querySelector<HTMLElement>("#reader-toc-drawer");

    this.backdrop =
      overrides?.backdrop !== undefined
        ? overrides.backdrop
        : root.querySelector<HTMLElement>("#reader-toc-backdrop") ??
          (root instanceof Element
            ? root.ownerDocument.querySelector<HTMLElement>(
                "#reader-toc-backdrop"
              )
            : document.querySelector<HTMLElement>("#reader-toc-backdrop"));

    this.triggerBtn =
      overrides?.triggerBtn !== undefined
        ? overrides.triggerBtn
        : root.querySelector<HTMLElement>("#reader-toc-btn");

    this.breadcrumbBtn =
      overrides?.breadcrumbBtn !== undefined
        ? overrides.breadcrumbBtn
        : root.querySelector<HTMLElement>("#reader-breadcrumb-btn");

    this.closeBtn =
      overrides?.closeBtn !== undefined
        ? overrides.closeBtn
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-close-btn") ??
          root.querySelector<HTMLElement>("#reader-toc-close-btn");

    this.backBtn =
      overrides?.backBtn !== undefined
        ? overrides.backBtn
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-back-btn") ??
          root.querySelector<HTMLElement>("#reader-toc-back-btn");

    this.filterInput =
      overrides?.filterInput !== undefined
        ? overrides.filterInput
        : this.drawer?.querySelector<HTMLInputElement>("#reader-toc-filter") ??
          root.querySelector<HTMLInputElement>("#reader-toc-filter");

    this.listContainer =
      overrides?.listContainer !== undefined
        ? overrides.listContainer
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-list") ??
          root.querySelector<HTMLElement>("#reader-toc-list");

    this.onOpen = options.onOpen;
    this.onClose = options.onClose;

    if (!this.drawer) {
      return;
    }

    this.initListeners();
  }

  private initListeners(): void {
    // Trigger button toggles drawer (preventDefault suppresses hash navigation in JS mode)
    if (this.triggerBtn) {
      const btn = this.triggerBtn;
      const onToggle = (e: MouseEvent) => {
        e.preventDefault();
        this.toggle();
      };
      btn.addEventListener("click", onToggle);
      this.disposables.add(() => btn.removeEventListener("click", onToggle));
    }

    // Breadcrumb trigger opens drawer
    if (this.breadcrumbBtn) {
      const btn = this.breadcrumbBtn;
      const onOpen = (e: MouseEvent) => {
        e.preventDefault();
        this.open();
      };
      btn.addEventListener("click", onOpen);
      this.disposables.add(() => btn.removeEventListener("click", onOpen));
    }

    // Close & Back buttons inside drawer
    if (this.closeBtn) {
      const btn = this.closeBtn;
      const onClose = (e: MouseEvent) => {
        e.preventDefault();
        this.close();
        this.triggerBtn?.focus();
      };
      btn.addEventListener("click", onClose);
      this.disposables.add(() => btn.removeEventListener("click", onClose));
    }

    if (this.backBtn) {
      const btn = this.backBtn;
      const onBack = (e: MouseEvent) => {
        e.preventDefault();
        this.close();
        this.triggerBtn?.focus();
      };
      btn.addEventListener("click", onBack);
      this.disposables.add(() => btn.removeEventListener("click", onBack));
    }

    // Live search filter
    if (this.filterInput) {
      const input = this.filterInput;
      const onInput = () => this.filter(input.value);
      input.addEventListener("input", onInput);
      this.disposables.add(() => input.removeEventListener("input", onInput));
    }

    // Dismiss on backdrop click: stopPropagation prevents bubbling to doc click listener
    if (this.backdrop) {
      const onBackdropClick = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        this.close();
      };
      this.backdrop.addEventListener("click", onBackdropClick);
      this.disposables.add(() =>
        this.backdrop?.removeEventListener("click", onBackdropClick)
      );
    }

    // Dismiss on outside click (fallback when clicking outside drawer or buttons)
    const doc = this.drawer?.ownerDocument ?? document;
    const onDocClick = (e: MouseEvent) => {
      if (this.isOpen() && e.target instanceof Node) {
        if (
          !this.drawer?.contains(e.target) &&
          !this.triggerBtn?.contains(e.target) &&
          !this.breadcrumbBtn?.contains(e.target)
        ) {
          this.close();
        }
      }
    };
    doc.addEventListener("click", onDocClick);
    this.disposables.add(() => doc.removeEventListener("click", onDocClick));

    // Keyboard navigation (Escape key dismissal & Tab focus cycling within dropdown)
    const win = doc.defaultView ?? window;
    const onKeyDown = (e: KeyboardEvent) => {
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
    };
    win.addEventListener("keydown", onKeyDown);
    this.disposables.add(() => win.removeEventListener("keydown", onKeyDown));
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
    if (!this.drawer) return;
    this.drawer.removeAttribute("hidden");
    this.backdrop?.removeAttribute("hidden");

    this.updatePosition();

    // Dynamically update position on resize or scroll while open
    const win = this.drawer.ownerDocument?.defaultView ?? window;
    const onReposition = () => this.updatePosition();
    win.addEventListener("resize", onReposition);
    win.addEventListener("scroll", onReposition, { passive: true });
    this.openDisposables.add(() => {
      win.removeEventListener("resize", onReposition);
      win.removeEventListener("scroll", onReposition);
    });

    this.triggerBtn?.setAttribute("aria-expanded", "true");
    this.breadcrumbBtn?.setAttribute("aria-expanded", "true");

    // Focus landing spot: prioritize active section, then search input, then close button
    const activeItem = this.drawer.querySelector<HTMLElement>(
      ".reader-toc-item.active"
    );
    if (activeItem) {
      activeItem.focus();
      if (typeof activeItem.scrollIntoView === "function") {
        activeItem.scrollIntoView({ block: "nearest" });
      }
    } else if (this.filterInput) {
      this.filterInput.focus();
    } else {
      this.closeBtn?.focus();
    }

    this.onOpen?.();
  }

  public close(): void {
    if (!this.drawer) return;
    this.openDisposables.dispose();
    this.drawer.setAttribute("hidden", "");
    this.backdrop?.setAttribute("hidden", "");
    this.drawer.style.removeProperty("top");
    this.drawer.style.removeProperty("left");
    this.drawer.style.removeProperty("--caret-left");
    this.triggerBtn?.setAttribute("aria-expanded", "false");
    this.breadcrumbBtn?.setAttribute("aria-expanded", "false");
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

  public getItems(): HTMLElement[] {
    const scope = this.listContainer ?? this.drawer;
    if (!scope) return [];
    return Array.from(scope.querySelectorAll<HTMLElement>(".reader-toc-item"));
  }

  public filter(rawTerm: string): void {
    const term = rawTerm.trim().toLowerCase();
    const items = this.getItems();
    for (const item of items) {
      const text = item.textContent?.toLowerCase() || "";
      item.style.display = term && !text.includes(term) ? "none" : "";
    }
  }

  public destroy(): void {
    this.openDisposables.dispose();
    this.disposables.dispose();
  }

  public dispose(): void {
    this.destroy();
  }
}
