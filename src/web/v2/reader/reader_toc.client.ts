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
  private readonly overrides?: Partial<ReaderTocElements>;
  private readonly onOpen?: () => void;
  private readonly onClose?: () => void;
  private readonly popover: AnchoredPopoverController;

  constructor(options: ReaderTocOptions = {}) {
    const root = options.root ?? document;
    super(root);
    this.overrides = options.elements;
    this.onOpen = options.onOpen;
    this.onClose = options.onClose;
    this.popover = this.addController(
      new AnchoredPopoverController({
        root,
        group: "reader-chrome",
        align: "center",
        defaultWidth: 360,
        getPanel: () => {
          this.resolveElements();
          return this.drawer;
        },
        getTrigger: () => this.triggerBtn,
        getBackdrop: () => this.backdrop,
        getCloseBtn: () => this.closeBtn,
        getInitialFocus: (drawer) => {
          const activeItem = drawer.querySelector<HTMLElement>(
            ".reader-toc-item.active"
          );
          if (activeItem) {
            if (typeof activeItem.scrollIntoView === "function") {
              activeItem.scrollIntoView({ block: "nearest" });
            }
            return activeItem;
          }
          return this.closeBtn;
        },
        onOpen: () => this.onOpen?.(),
        onClose: () => this.onClose?.(),
      })
    );
  }

  protected override onConnect(): void {
    this.resolveElements();
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
