/**
 * UI V2 Reader Table of Contents (TOC) Controller
 *
 * Progressively enhances the reader's Table of Contents drawer.
 * Coordinates drawer open/close state, trigger buttons (including sticky header
 * and breadcrumb triggers), live section search/filtering, outside-click
 * dismissal, and keyboard accessibility (Escape to close).
 */

import { BaseController } from "@/web/v2/core/base_element.client";
import { AnchoredPopoverController } from "@/web/v2/core/popover.client";

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
  /** Auto-focused section filter/jump input (#reader-toc-search-input) */
  searchInput?: HTMLInputElement | null;
  /** Empty state message (#reader-toc-empty) */
  emptyState?: HTMLElement | null;
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
  public drawer: HTMLElement | null = null;
  public backdrop: HTMLElement | null = null;
  public triggerBtn: HTMLElement | null = null;
  public closeBtn: HTMLElement | null = null;
  public listContainer: HTMLElement | null = null;
  public searchInput: HTMLInputElement | null = null;
  public emptyState: HTMLElement | null = null;
  private selectedItem: HTMLAnchorElement | null = null;
  private readonly opts: ReaderTocOptions;
  private readonly popover: AnchoredPopoverController;

  constructor(options: ReaderTocOptions = {}) {
    const root = options.root ?? document;
    super(root);
    this.opts = options;
    this.popover = this.addController(
      new AnchoredPopoverController({
        root,
        group: "reader-chrome",
        align: "center",
        defaultWidth: 360,
        getPanel: () => this.drawer,
        getTrigger: () => this.triggerBtn,
        getBackdrop: () => this.backdrop,
        getCloseBtn: () => this.closeBtn,
        getInitialFocus: (drawer) => {
          const active = drawer.querySelector<HTMLElement>(
            ".reader-toc-item.active"
          );
          active?.scrollIntoView?.({ block: "nearest" });
          const isCoarsePointer =
            typeof window !== "undefined" &&
            window.matchMedia?.("(pointer: coarse)").matches;
          return (
            (!isCoarsePointer && this.searchInput) || active || this.closeBtn
          );
        },
        onOpen: () => {
          this.resetFilter();
          this.opts.onOpen?.();
        },
        onClose: () => {
          this.resetFilter();
          this.opts.onClose?.();
        },
      })
    );
  }

  protected override onConnect(): void {
    this.resolveElements();
    this.bindFilterEvents();
  }

  private resolveElements(): void {
    const overrides = this.opts.elements;
    this.drawer =
      overrides?.drawer !== undefined
        ? overrides.drawer
        : this.scope.$("#reader-toc-drawer");
    this.backdrop =
      overrides?.backdrop !== undefined
        ? overrides.backdrop
        : this.scope.$("#reader-toc-backdrop") ??
          this.ownerDocument.querySelector<HTMLElement>("#reader-toc-backdrop");
    this.triggerBtn =
      overrides?.triggerBtn !== undefined
        ? overrides.triggerBtn
        : this.scope.$("#reader-toc-btn");
    this.closeBtn =
      overrides?.closeBtn !== undefined
        ? overrides.closeBtn
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-close-btn") ??
          this.scope.$("#reader-toc-close-btn");
    this.listContainer =
      overrides?.listContainer !== undefined
        ? overrides.listContainer
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-list") ??
          this.scope.$("#reader-toc-list");
    this.searchInput =
      overrides?.searchInput !== undefined
        ? overrides.searchInput
        : this.drawer?.querySelector<HTMLInputElement>(
            "#reader-toc-search-input"
          ) ?? this.scope.$<HTMLInputElement>("#reader-toc-search-input");
    this.emptyState =
      overrides?.emptyState !== undefined
        ? overrides.emptyState
        : this.drawer?.querySelector<HTMLElement>("#reader-toc-empty") ??
          this.scope.$("#reader-toc-empty");
  }

  private bindFilterEvents(): void {
    if (!this.searchInput) return;

    this.scope.listen(this.searchInput, "input", () => {
      this.applyFilter(this.searchInput?.value ?? "");
    });

    this.scope.listen(this.searchInput, "keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSelection(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.executeSelectedOrJump();
      }
    });
  }

  public resetFilter(): void {
    if (this.searchInput) {
      this.searchInput.value = "";
    }
    this.applyFilter("");
  }

  private normalizeCitationInput(raw: string): string {
    const cleaned = raw
      .replace(/^[§\s]+/, "")
      .trim()
      .replace(/:+/g, ".");
    if (!cleaned) return "";

    if (cleaned.startsWith(".")) {
      const activeItem = this.listContainer?.querySelector<HTMLElement>(
        ".reader-toc-item.active"
      );
      const activePageId = activeItem?.dataset.pageId ?? "";
      if (activePageId) {
        return `${activePageId}${cleaned}`;
      }
    }
    return cleaned;
  }

  public applyFilter(rawQuery: string): void {
    if (!this.listContainer) return;

    const query = this.normalizeCitationInput(rawQuery);
    const queryLower = query.toLowerCase();
    const isAlphaQuery = /^[a-z]+$/.test(queryLower);

    const items = Array.from(
      this.listContainer.querySelectorAll<HTMLAnchorElement>(".reader-toc-item")
    );
    const groups = Array.from(
      this.listContainer.querySelectorAll<HTMLDetailsElement>(
        ".reader-toc-group"
      )
    );
    const activeItem = this.listContainer.querySelector<HTMLElement>(
      ".reader-toc-item.active"
    );

    const matchesPageId = (pageIdLower: string): boolean =>
      !queryLower ||
      pageIdLower.startsWith(queryLower) ||
      (isAlphaQuery &&
        pageIdLower
          .split(".")
          .some((segment) => segment.startsWith(queryLower)));

    // If no TOC item directly matches, check if query is a deep sub-page
    // citation (e.g. "1.2.3" belonging to page "1.2").
    let deepParentId = "";
    if (
      queryLower &&
      !items.some((item) =>
        matchesPageId((item.dataset.pageId ?? "").toLowerCase())
      )
    ) {
      for (const item of items) {
        const pageId = item.dataset.pageId ?? "";
        if (
          pageId &&
          queryLower.startsWith(pageId.toLowerCase() + ".") &&
          pageId.length > deepParentId.length
        ) {
          deepParentId = pageId;
        }
      }
    }

    let exactMatch: HTMLAnchorElement | null = null;
    let firstVisible: HTMLAnchorElement | null = null;
    let visibleCount = 0;

    for (const item of items) {
      const pageId = item.dataset.pageId ?? "";
      const pageIdLower = pageId.toLowerCase();
      const isVisible =
        matchesPageId(pageIdLower) ||
        Boolean(deepParentId && pageId === deepParentId);

      item.hidden = !isVisible;
      if (isVisible) {
        visibleCount++;
        if (!firstVisible) firstVisible = item;
        if (pageIdLower === queryLower && !exactMatch) {
          exactMatch = item;
        }
      }
    }

    for (const group of groups) {
      if (!queryLower) {
        group.hidden = false;
        group.open = Boolean(activeItem && group.contains(activeItem));
      } else {
        const hasVisibleChild = Array.from(
          group.querySelectorAll<HTMLElement>(".reader-toc-item")
        ).some((child) => !child.hidden);
        group.hidden = !hasVisibleChild;
        if (hasVisibleChild) group.open = true;
      }
    }

    this.setSelectedItem(queryLower ? exactMatch ?? firstVisible : null);
    if (this.emptyState) {
      this.emptyState.hidden = !queryLower || visibleCount > 0;
    }
  }

  private getVisibleItems(): HTMLAnchorElement[] {
    if (!this.listContainer) return [];
    return Array.from(
      this.listContainer.querySelectorAll<HTMLAnchorElement>(".reader-toc-item")
    ).filter(
      (item) =>
        !item.hidden &&
        !item.closest<HTMLDetailsElement>(".reader-toc-group")?.hidden
    );
  }

  private setSelectedItem(target: HTMLAnchorElement | null): void {
    if (this.selectedItem) {
      this.selectedItem.classList.remove("is-filter-selected");
      this.selectedItem.removeAttribute("aria-selected");
    }
    this.selectedItem = target;
    if (target) {
      target.classList.add("is-filter-selected");
      target.setAttribute("aria-selected", "true");
      target.scrollIntoView?.({ block: "nearest" });
    }
  }

  private moveSelection(delta: number): void {
    const visibleItems = this.getVisibleItems();
    if (!visibleItems.length) return;

    const currentIndex = this.selectedItem
      ? visibleItems.indexOf(this.selectedItem)
      : -1;
    const activeIndex = visibleItems.findIndex((el) =>
      el.classList.contains("active")
    );
    const baseIndex =
      currentIndex !== -1
        ? currentIndex
        : activeIndex !== -1
        ? activeIndex
        : delta > 0
        ? -1
        : visibleItems.length;

    const nextIndex = Math.max(
      0,
      Math.min(visibleItems.length - 1, baseIndex + delta)
    );
    const nextItem = visibleItems[nextIndex];
    const parentGroup =
      nextItem.closest<HTMLDetailsElement>(".reader-toc-group");
    if (parentGroup) parentGroup.open = true;
    this.setSelectedItem(nextItem);
  }

  private executeSelectedOrJump(): void {
    if (!this.listContainer) return;

    const query = this.normalizeCitationInput(this.searchInput?.value ?? "");
    const targetItem =
      (this.selectedItem && !this.selectedItem.hidden
        ? this.selectedItem
        : null) ??
      (query
        ? this.getVisibleItems()[0] ?? null
        : this.listContainer.querySelector<HTMLAnchorElement>(
            ".reader-toc-item.active"
          ));

    if (targetItem) {
      const pageId = targetItem.dataset.pageId ?? "";
      const baseHref = (targetItem.getAttribute("href") ?? "#").split("#")[0];
      const isSubPageJump =
        Boolean(pageId) &&
        query.toLowerCase().startsWith(pageId.toLowerCase() + ".");
      targetItem.setAttribute(
        "href",
        isSubPageJump ? `${baseHref}#sec-${query}` : baseHref
      );
      targetItem.click();
      return;
    }

    if (query && this.searchInput?.form) {
      this.searchInput.value = query;
      this.searchInput.form.submit();
    }
  }

  public updatePosition(): void {
    this.popover.updatePosition();
  }

  public open(): void {
    this.popover.open();
  }

  public close(): void {
    this.popover.close();
  }

  public toggle(): void {
    this.popover.toggle();
  }

  public isOpen(): boolean {
    return this.popover.isOpen;
  }
}
