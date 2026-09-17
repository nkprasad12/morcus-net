/**
 * UI V2 Reader Companion Panel Controller
 *
 * Coordinates the companion sidebar / mobile drawer tabs between Dictionary
 * and Notes (Critical Apparatus):
 * - Conditionally constructs the tab bar when a page contains critical notes
 * - Relocates the server-rendered footnote list into the companion notes panel
 * - Synchronizes active note state and auto-scrolls the panel without shifting page scroll
 * - Implements strict arbitration: word lookups always force-switch back to Dictionary
 * - Preserves zero-JS markup on the server and ensures clean teardown on destroy
 */

import { DisposableBag } from "@/web/v2/core/disposable.client";

export type PanelTab = "dict" | "notes";

export interface ReaderPanelElements {
  dictPanel?: HTMLElement | null;
  iframeContainer?: HTMLElement | null;
  notesNode?: HTMLElement | null;
  textCard?: HTMLElement | null;
}

export interface ReaderPanelOptions {
  root?: ParentNode;
  elements?: ReaderPanelElements;
  onTabChange?: (tab: PanelTab) => void;
}

function escapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/([ #;&,.+*~':"!^$[\]()=>|/@])/g, "\\$1");
}

export class ReaderPanelController {
  private readonly disposables = new DisposableBag();
  private _activeTab: PanelTab = "dict";
  public readonly hasNotes: boolean;
  public readonly noteCount: number;

  public readonly dictPanel: HTMLElement | null = null;
  public readonly iframeContainer: HTMLElement | null = null;
  public readonly notesNode: HTMLElement | null = null;
  public readonly tabsContainer: HTMLElement | null = null;
  public readonly dictTab: HTMLButtonElement | null = null;
  public readonly notesTab: HTMLButtonElement | null = null;
  public readonly viewsContainer: HTMLElement | null = null;
  public readonly dictView: HTMLElement | null = null;
  public readonly notesView: HTMLElement | null = null;

  private readonly notesOriginalParent: Node | null = null;
  private readonly notesOriginalNextSibling: Node | null = null;
  private readonly iframeOriginalParent: Node | null = null;
  private readonly iframeOriginalNextSibling: Node | null = null;
  private readonly iframeOriginalId: string | null = null;
  private readonly onTabChange?: (tab: PanelTab) => void;

  constructor(options: ReaderPanelOptions = {}) {
    const root = options.root ?? document;
    const overrides = options.elements;
    this.onTabChange = options.onTabChange;

    const dictPanel =
      overrides?.dictPanel !== undefined
        ? overrides.dictPanel
        : root.querySelector<HTMLElement>(".reader-dict-panel");

    const iframeContainer =
      overrides?.iframeContainer !== undefined
        ? overrides.iframeContainer
        : dictPanel?.querySelector<HTMLElement>(".dict-iframe-container") ??
          root.querySelector<HTMLElement>(".dict-iframe-container");

    const notesNode =
      overrides?.notesNode !== undefined
        ? overrides.notesNode
        : root.querySelector<HTMLElement>(".reader-notes");

    this.dictPanel = dictPanel;
    this.iframeContainer = iframeContainer;
    this.notesNode = notesNode;

    if (!dictPanel || !iframeContainer || !notesNode) {
      this.hasNotes = false;
      this.noteCount = 0;
      return;
    }

    const noteItems = notesNode.querySelectorAll(".reader-note");
    this.noteCount = noteItems.length;
    this.hasNotes = this.noteCount > 0;

    if (!this.hasNotes) {
      return;
    }

    // Capture original DOM positions for clean teardown / symmetry
    this.notesOriginalParent = notesNode.parentNode;
    this.notesOriginalNextSibling = notesNode.nextSibling;
    this.iframeOriginalParent = iframeContainer.parentNode;
    this.iframeOriginalNextSibling = iframeContainer.nextSibling;
    this.iframeOriginalId = iframeContainer.getAttribute("id");

    // 1. Build Tab List
    const tabs = document.createElement("div");
    tabs.className = "reader-panel-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Companion panel");

    const dictTab = document.createElement("button");
    dictTab.type = "button";
    dictTab.className = "reader-panel-tab";
    dictTab.id = "panel-tab-dict";
    dictTab.setAttribute("role", "tab");
    dictTab.setAttribute("aria-selected", "true");
    dictTab.setAttribute("aria-controls", "panel-view-dict");
    dictTab.tabIndex = 0;
    dictTab.textContent = "Dictionary";

    const notesTab = document.createElement("button");
    notesTab.type = "button";
    notesTab.className = "reader-panel-tab";
    notesTab.id = "panel-tab-notes";
    notesTab.setAttribute("role", "tab");
    notesTab.setAttribute("aria-selected", "false");
    notesTab.setAttribute("aria-controls", "panel-view-notes");
    notesTab.tabIndex = -1;
    notesTab.textContent = "Notes";

    tabs.appendChild(dictTab);
    tabs.appendChild(notesTab);
    this.tabsContainer = tabs;
    this.dictTab = dictTab;
    this.notesTab = notesTab;

    // 2. Build Views Container and Relocate Notes Subtree
    const views = document.createElement("div");
    views.className = "reader-panel-views";

    iframeContainer.id = "panel-view-dict";
    iframeContainer.setAttribute("role", "tabpanel");
    iframeContainer.setAttribute("aria-labelledby", "panel-tab-dict");
    iframeContainer.classList.add("reader-panel-view", "active");
    views.appendChild(iframeContainer);
    this.dictView = iframeContainer;

    const notesView = document.createElement("div");
    notesView.id = "panel-view-notes";
    notesView.className = "reader-panel-notes reader-panel-view";
    notesView.setAttribute("role", "tabpanel");
    notesView.setAttribute("aria-labelledby", "panel-tab-notes");
    notesView.setAttribute("aria-live", "polite");

    // Eagerly relocate notes into panel
    notesView.appendChild(notesNode);
    views.appendChild(notesView);
    this.notesView = notesView;
    this.viewsContainer = views;

    // Insert tabs into sheet teaser bar (or dict panel) and views container
    const sheetBar = dictPanel.querySelector(".reader-sheet-bar");
    const teaser = sheetBar?.querySelector(".reader-sheet-teaser");
    if (sheetBar && teaser) {
      dictPanel.classList.add("has-companion-tabs");
      const closeBtn = teaser.querySelector(".reader-sheet-close");
      if (closeBtn) {
        teaser.insertBefore(tabs, closeBtn);
      } else {
        teaser.appendChild(tabs);
      }
      dictPanel.insertBefore(views, sheetBar.nextSibling);
    } else if (sheetBar && sheetBar.nextSibling) {
      dictPanel.insertBefore(tabs, sheetBar.nextSibling);
      dictPanel.insertBefore(views, tabs.nextSibling);
    } else {
      dictPanel.appendChild(tabs);
      dictPanel.appendChild(views);
    }

    // 3. Register Event Listeners
    this.initTabEvents();
  }

  private initTabEvents(): void {
    if (!this.dictTab || !this.notesTab || !this.tabsContainer) return;

    const onDictClick = (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("dict");
    };

    const onNotesClick = (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("notes");
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const nextTab: PanelTab = this._activeTab === "dict" ? "notes" : "dict";
        this.setTab(nextTab);
        if (nextTab === "dict") {
          this.dictTab?.focus();
        } else {
          this.notesTab?.focus();
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        this.setTab("dict");
        this.dictTab?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        this.setTab("notes");
        this.notesTab?.focus();
      }
    };

    this.dictTab.addEventListener("click", onDictClick);
    this.notesTab.addEventListener("click", onNotesClick);
    this.tabsContainer.addEventListener("keydown", onKeydown);

    this.disposables.add(() => {
      this.dictTab?.removeEventListener("click", onDictClick);
      this.notesTab?.removeEventListener("click", onNotesClick);
      this.tabsContainer?.removeEventListener("keydown", onKeydown);
    });
  }

  public get activeTab(): PanelTab {
    return this._activeTab;
  }

  public setTab(tab: PanelTab): void {
    if (tab === "notes" && !this.hasNotes) return;
    this._activeTab = tab;

    if (this.dictTab && this.notesTab && this.dictView && this.notesView) {
      const isDict = tab === "dict";

      this.dictTab.setAttribute("aria-selected", isDict ? "true" : "false");
      this.dictTab.tabIndex = isDict ? 0 : -1;

      this.notesTab.setAttribute("aria-selected", isDict ? "false" : "true");
      this.notesTab.tabIndex = isDict ? -1 : 0;

      this.dictView.classList.toggle("active", isDict);
      this.notesView.classList.toggle("active", !isDict);
    }

    this.onTabChange?.(tab);
  }

  public showNote(bodyId: string, opts: { focus?: boolean } = {}): void {
    if (!this.hasNotes || !this.notesView) return;

    this.setTab("notes");

    const prevActive = this.notesView.querySelectorAll(".note-active");
    prevActive.forEach((el) => el.classList.remove("note-active"));

    const target =
      this.notesView.querySelector<HTMLElement>(`#${escapeId(bodyId)}`) ??
      document.getElementById(bodyId);

    if (target) {
      target.classList.add("note-active");
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      if (opts.focus) {
        const link = target.querySelector<HTMLElement>("a") || target;
        link.focus?.();
      }
    }
  }

  public reset(): void {
    this.setTab("dict");
    if (this.notesView) {
      const active = this.notesView.querySelectorAll(".note-active");
      active.forEach((el) => el.classList.remove("note-active"));
    }
  }

  public destroy(): void {
    this.disposables.dispose();

    if (this.notesOriginalParent && this.notesNode) {
      this.notesOriginalParent.insertBefore(
        this.notesNode,
        this.notesOriginalNextSibling
      );
    }

    if (this.iframeOriginalParent && this.iframeContainer) {
      this.iframeContainer.classList.remove("reader-panel-view", "active");
      if (this.iframeOriginalId) {
        this.iframeContainer.id = this.iframeOriginalId;
      } else {
        this.iframeContainer.removeAttribute("id");
      }
      this.iframeContainer.removeAttribute("role");
      this.iframeContainer.removeAttribute("aria-labelledby");
      this.iframeOriginalParent.insertBefore(
        this.iframeContainer,
        this.iframeOriginalNextSibling
      );
    }

    this.dictPanel?.classList.remove("has-companion-tabs");
    this.tabsContainer?.remove();
    this.viewsContainer?.remove();
  }
}
