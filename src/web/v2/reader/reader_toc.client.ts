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
  /** The slide-in drawer element (#v2-reader-toc-drawer) */
  drawer: HTMLElement | null;
  /** Primary trigger button in sticky header (#v2-reader-toc-btn) */
  triggerBtn?: HTMLButtonElement | null;
  /** Optional breadcrumb button (#v2-reader-breadcrumb-btn) */
  breadcrumbBtn?: HTMLButtonElement | null;
  /** Close '×' button in drawer header (#v2-reader-toc-close-btn) */
  closeBtn?: HTMLButtonElement | null;
  /** '← Back' button in drawer header (#v2-reader-toc-back-btn) */
  backBtn?: HTMLButtonElement | null;
  /** Search/filter text input (#v2-reader-toc-filter) */
  filterInput?: HTMLInputElement | null;
  /** Container holding the list of TOC items (#v2-reader-toc-list) */
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
  public readonly drawer: HTMLElement | null;
  public readonly triggerBtn: HTMLButtonElement | null;
  public readonly breadcrumbBtn: HTMLButtonElement | null;
  public readonly closeBtn: HTMLButtonElement | null;
  public readonly backBtn: HTMLButtonElement | null;
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
        : root.querySelector<HTMLElement>("#v2-reader-toc-drawer");

    this.triggerBtn =
      overrides?.triggerBtn !== undefined
        ? overrides.triggerBtn
        : root.querySelector<HTMLButtonElement>("#v2-reader-toc-btn");

    this.breadcrumbBtn =
      overrides?.breadcrumbBtn !== undefined
        ? overrides.breadcrumbBtn
        : root.querySelector<HTMLButtonElement>("#v2-reader-breadcrumb-btn");

    this.closeBtn =
      overrides?.closeBtn !== undefined
        ? overrides.closeBtn
        : this.drawer?.querySelector<HTMLButtonElement>(
            "#v2-reader-toc-close-btn"
          ) ??
          root.querySelector<HTMLButtonElement>("#v2-reader-toc-close-btn");

    this.backBtn =
      overrides?.backBtn !== undefined
        ? overrides.backBtn
        : this.drawer?.querySelector<HTMLButtonElement>(
            "#v2-reader-toc-back-btn"
          ) ?? root.querySelector<HTMLButtonElement>("#v2-reader-toc-back-btn");

    this.filterInput =
      overrides?.filterInput !== undefined
        ? overrides.filterInput
        : this.drawer?.querySelector<HTMLInputElement>(
            "#v2-reader-toc-filter"
          ) ?? root.querySelector<HTMLInputElement>("#v2-reader-toc-filter");

    this.listContainer =
      overrides?.listContainer !== undefined
        ? overrides.listContainer
        : this.drawer?.querySelector<HTMLElement>("#v2-reader-toc-list") ??
          root.querySelector<HTMLElement>("#v2-reader-toc-list");

    this.onOpen = options.onOpen;
    this.onClose = options.onClose;

    if (!this.drawer) {
      return;
    }

    this.initListeners();
  }

  private initListeners(): void {
    const onOpen = () => this.open();
    const onClose = () => this.close();
    const onToggle = () => this.toggle();

    // Trigger button toggles drawer
    if (this.triggerBtn) {
      const btn = this.triggerBtn;
      btn.addEventListener("click", onToggle);
      this.disposables.add(() => btn.removeEventListener("click", onToggle));
    }

    // Breadcrumb trigger opens drawer
    if (this.breadcrumbBtn) {
      const btn = this.breadcrumbBtn;
      btn.addEventListener("click", onOpen);
      this.disposables.add(() => btn.removeEventListener("click", onOpen));
    }

    // Close & Back buttons inside drawer
    if (this.closeBtn) {
      const btn = this.closeBtn;
      btn.addEventListener("click", onClose);
      this.disposables.add(() => btn.removeEventListener("click", onClose));
    }

    if (this.backBtn) {
      const btn = this.backBtn;
      btn.addEventListener("click", onClose);
      this.disposables.add(() => btn.removeEventListener("click", onClose));
    }

    // Live search filter
    if (this.filterInput) {
      const input = this.filterInput;
      const onInput = () => this.filter(input.value);
      input.addEventListener("input", onInput);
      this.disposables.add(() => input.removeEventListener("input", onInput));
    }

    // Dismiss on outside click
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

    // Keyboard navigation (Escape key dismissal)
    const win = doc.defaultView ?? window;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.isOpen()) {
        e.preventDefault();
        this.close();
        this.triggerBtn?.focus();
      }
    };
    win.addEventListener("keydown", onKeyDown);
    this.disposables.add(() => win.removeEventListener("keydown", onKeyDown));
  }

  public open(): void {
    if (!this.drawer) return;
    this.drawer.removeAttribute("hidden");
    this.triggerBtn?.setAttribute("aria-expanded", "true");
    this.breadcrumbBtn?.setAttribute("aria-expanded", "true");
    this.filterInput?.focus();
    this.onOpen?.();
  }

  public close(): void {
    if (!this.drawer) return;
    this.drawer.setAttribute("hidden", "");
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
    return Array.from(
      scope.querySelectorAll<HTMLElement>(".v2-reader-toc-item")
    );
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
    this.disposables.dispose();
  }

  public dispose(): void {
    this.destroy();
  }
}
