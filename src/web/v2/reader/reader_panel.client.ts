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
import { ICON_PATHS } from "@/web/v2/core/icons.common";

export type PanelTab = "dict" | "notes" | "about";

export interface ReaderPanelElements {
  dictPanel?: HTMLElement | null;
  iframeContainer?: HTMLElement | null;
  notesNode?: HTMLElement | null;
  aboutNode?: HTMLElement | null;
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

function createTabIcon(pathD: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "reader-tab-icon";
  span.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  span.appendChild(svg);
  return span;
}

export class ReaderPanelController {
  private readonly disposables = new DisposableBag();
  private _activeTab: PanelTab = "dict";
  public hasNotes: boolean = false;
  public hasAbout: boolean = false;
  public noteCount: number = 0;

  public readonly dictPanel: HTMLElement | null = null;
  public readonly iframeContainer: HTMLElement | null = null;
  public notesNode: HTMLElement | null = null;
  public aboutNode: HTMLElement | null = null;
  public tabsContainer: HTMLElement | null = null;
  public dictTab: HTMLButtonElement | null = null;
  public notesTab: HTMLButtonElement | null = null;
  public aboutTab: HTMLButtonElement | null = null;
  public viewsContainer: HTMLElement | null = null;
  public dictView: HTMLElement | null = null;
  public notesView: HTMLElement | null = null;
  public aboutView: HTMLElement | null = null;

  private readonly notesOriginalParent: Node | null = null;
  private readonly notesOriginalNextSibling: Node | null = null;
  private readonly aboutOriginalParent: Node | null = null;
  private readonly aboutOriginalNextSibling: Node | null = null;
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

    const aboutNode =
      overrides?.aboutNode !== undefined
        ? overrides.aboutNode
        : root.querySelector<HTMLElement>("#reader-work-about");

    this.dictPanel = dictPanel;
    this.iframeContainer = iframeContainer;
    this.notesNode = notesNode;
    this.aboutNode = aboutNode;

    if (!dictPanel || !iframeContainer) {
      this.hasNotes = false;
      this.hasAbout = false;
      this.noteCount = 0;
      return;
    }

    const noteItems = notesNode
      ? notesNode.querySelectorAll(".reader-note")
      : [];
    this.noteCount = noteItems.length;
    this.hasNotes = this.noteCount > 0;
    this.hasAbout = !!aboutNode;

    // Capture original DOM positions for clean teardown / symmetry
    if (notesNode) {
      this.notesOriginalParent = notesNode.parentNode;
      this.notesOriginalNextSibling = notesNode.nextSibling;
    }
    if (aboutNode) {
      this.aboutOriginalParent = aboutNode.parentNode;
      this.aboutOriginalNextSibling = aboutNode.nextSibling;
    }
    this.iframeOriginalParent = iframeContainer.parentNode;
    this.iframeOriginalNextSibling = iframeContainer.nextSibling;
    this.iframeOriginalId = iframeContainer.getAttribute("id");

    const hasMultipleTabs = this.hasNotes || this.hasAbout;

    // 1. Build Tab List
    const tabs = document.createElement("div");
    tabs.className = "reader-panel-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Companion panel");
    if (!hasMultipleTabs) {
      tabs.hidden = true;
    }

    const dictTab = document.createElement("button");
    dictTab.type = "button";
    dictTab.className = "reader-panel-tab";
    dictTab.id = "panel-tab-dict";
    dictTab.setAttribute("role", "tab");
    dictTab.setAttribute("aria-selected", "true");
    dictTab.setAttribute("aria-controls", "panel-view-dict");
    dictTab.setAttribute("aria-label", "Dictionary");
    dictTab.tabIndex = 0;

    const dictLabel = document.createElement("span");
    dictLabel.className = "reader-tab-label";
    dictLabel.textContent = "Dictionary";
    dictTab.appendChild(createTabIcon(ICON_PATHS.book));
    dictTab.appendChild(dictLabel);

    const notesTab = document.createElement("button");
    notesTab.type = "button";
    notesTab.className = "reader-panel-tab";
    notesTab.id = "panel-tab-notes";
    notesTab.setAttribute("role", "tab");
    notesTab.setAttribute("aria-selected", "false");
    notesTab.setAttribute("aria-controls", "panel-view-notes");
    notesTab.setAttribute("aria-label", "Notes");
    notesTab.tabIndex = -1;

    const notesLabel = document.createElement("span");
    notesLabel.className = "reader-tab-label";
    notesLabel.textContent = "Notes";
    notesTab.appendChild(createTabIcon(ICON_PATHS.notes));
    notesTab.appendChild(notesLabel);

    if (!this.hasNotes) {
      notesTab.hidden = true;
    }

    const aboutTab = document.createElement("button");
    aboutTab.type = "button";
    aboutTab.className = "reader-panel-tab";
    aboutTab.id = "panel-tab-about";
    aboutTab.setAttribute("role", "tab");
    aboutTab.setAttribute("aria-selected", "false");
    aboutTab.setAttribute("aria-controls", "panel-view-about");
    aboutTab.setAttribute("aria-label", "About");
    aboutTab.tabIndex = -1;

    const aboutLabel = document.createElement("span");
    aboutLabel.className = "reader-tab-label";
    aboutLabel.textContent = "About";
    aboutTab.appendChild(createTabIcon(ICON_PATHS.info));
    aboutTab.appendChild(aboutLabel);

    if (!this.hasAbout) {
      aboutTab.hidden = true;
    }

    tabs.appendChild(dictTab);
    tabs.appendChild(notesTab);
    tabs.appendChild(aboutTab);
    this.tabsContainer = tabs;
    this.dictTab = dictTab;
    this.notesTab = notesTab;
    this.aboutTab = aboutTab;

    // 2. Build Views Container and Relocate Subtrees
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

    if (notesNode && this.hasNotes) {
      notesView.appendChild(notesNode);
    }
    views.appendChild(notesView);
    this.notesView = notesView;

    const aboutView = document.createElement("div");
    aboutView.id = "panel-view-about";
    aboutView.className = "reader-panel-about reader-panel-view";
    aboutView.setAttribute("role", "tabpanel");
    aboutView.setAttribute("aria-labelledby", "panel-tab-about");

    if (aboutNode && this.hasAbout) {
      if (aboutNode instanceof HTMLDetailsElement) {
        aboutNode.open = true;
      } else {
        aboutNode.setAttribute("open", "");
      }
      aboutView.appendChild(aboutNode);
    }
    views.appendChild(aboutView);
    this.aboutView = aboutView;
    this.viewsContainer = views;

    // Insert tabs into sheet teaser bar (or dict panel) and views container
    const sheetBar = dictPanel.querySelector(".reader-sheet-bar");
    const teaser = sheetBar?.querySelector(".reader-sheet-teaser");
    if (sheetBar && teaser) {
      if (hasMultipleTabs) {
        dictPanel.classList.add("has-companion-tabs");
      }
      const closeBtn = teaser.querySelector(".reader-sheet-close");
      if (closeBtn) {
        teaser.insertBefore(tabs, closeBtn);
      } else {
        teaser.appendChild(tabs);
      }
      dictPanel.insertBefore(views, sheetBar.nextSibling);
    } else if (sheetBar && sheetBar.nextSibling) {
      if (hasMultipleTabs) {
        dictPanel.classList.add("has-companion-tabs");
      }
      dictPanel.insertBefore(tabs, sheetBar.nextSibling);
      dictPanel.insertBefore(views, tabs.nextSibling);
    } else {
      if (hasMultipleTabs) {
        dictPanel.classList.add("has-companion-tabs");
      }
      dictPanel.appendChild(tabs);
      dictPanel.appendChild(views);
    }

    // 3. Register Event Listeners
    this.initTabEvents();
  }

  private initTabEvents(): void {
    if (
      !this.dictTab ||
      !this.notesTab ||
      !this.aboutTab ||
      !this.tabsContainer
    )
      return;

    const onDictClick = (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("dict");
    };

    const onNotesClick = (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("notes");
    };

    const onAboutClick = (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("about");
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (!this.dictTab) return;
      const activeTabs: { id: PanelTab; btn: HTMLButtonElement }[] = [
        { id: "dict", btn: this.dictTab },
      ];
      if (this.hasNotes && this.notesTab) {
        activeTabs.push({ id: "notes", btn: this.notesTab });
      }
      if (this.hasAbout && this.aboutTab) {
        activeTabs.push({ id: "about", btn: this.aboutTab });
      }
      const currentIndex = activeTabs.findIndex(
        (t) => t.id === this._activeTab
      );
      if (currentIndex === -1) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % activeTabs.length;
        const nextTab = activeTabs[nextIndex];
        this.setTab(nextTab.id);
        nextTab.btn.focus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevIndex =
          (currentIndex - 1 + activeTabs.length) % activeTabs.length;
        const prevTab = activeTabs[prevIndex];
        this.setTab(prevTab.id);
        prevTab.btn.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        const firstTab = activeTabs[0];
        this.setTab(firstTab.id);
        firstTab.btn.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        const lastTab = activeTabs[activeTabs.length - 1];
        this.setTab(lastTab.id);
        lastTab.btn.focus();
      }
    };

    this.dictTab.addEventListener("click", onDictClick);
    this.notesTab.addEventListener("click", onNotesClick);
    this.aboutTab.addEventListener("click", onAboutClick);
    this.tabsContainer.addEventListener("keydown", onKeydown);

    this.disposables.add(() => {
      this.dictTab?.removeEventListener("click", onDictClick);
      this.notesTab?.removeEventListener("click", onNotesClick);
      this.aboutTab?.removeEventListener("click", onAboutClick);
      this.tabsContainer?.removeEventListener("keydown", onKeydown);
    });
  }

  public get activeTab(): PanelTab {
    return this._activeTab;
  }

  public setTab(tab: PanelTab): void {
    if (tab === "notes" && !this.hasNotes) return;
    if (tab === "about" && !this.hasAbout) return;
    this._activeTab = tab;

    if (this.dictTab && this.dictView) {
      const isDict = tab === "dict";
      this.dictTab.setAttribute("aria-selected", isDict ? "true" : "false");
      this.dictTab.tabIndex = isDict ? 0 : -1;
      this.dictView.classList.toggle("active", isDict);
    }

    if (this.notesTab && this.notesView) {
      const isNotes = tab === "notes";
      this.notesTab.setAttribute("aria-selected", isNotes ? "true" : "false");
      this.notesTab.tabIndex = isNotes ? 0 : -1;
      this.notesView.classList.toggle("active", isNotes);
    }

    if (this.aboutTab && this.aboutView) {
      const isAbout = tab === "about";
      this.aboutTab.setAttribute("aria-selected", isAbout ? "true" : "false");
      this.aboutTab.tabIndex = isAbout ? 0 : -1;
      this.aboutView.classList.toggle("active", isAbout);
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

  public adoptNotes(newNotes: HTMLElement | null): void {
    if (!this.notesView) return;

    // 1. Remove previous notes from notesView
    const oldNotes = this.notesView.querySelector(".reader-notes");
    if (oldNotes) {
      oldNotes.remove();
    }

    this.notesNode = newNotes;

    // 2. Count new notes
    const noteItems = newNotes ? newNotes.querySelectorAll(".reader-note") : [];
    this.noteCount = noteItems.length;
    this.hasNotes = this.noteCount > 0;

    // 3. If new notes exist, append to notesView
    if (newNotes && this.hasNotes) {
      this.notesView.appendChild(newNotes);
    }

    // 4. Update tab visibility and container state
    if (this.tabsContainer && this.notesTab && this.dictPanel) {
      const hasMultipleTabs = this.hasNotes || this.hasAbout;
      this.tabsContainer.hidden = !hasMultipleTabs;
      this.notesTab.hidden = !this.hasNotes;
      this.dictPanel.classList.toggle("has-companion-tabs", hasMultipleTabs);
    }

    // 5. If active tab was notes, but new page has no notes, fall back to dict
    if (this._activeTab === "notes" && !this.hasNotes) {
      this.setTab("dict");
    }
  }

  public adoptAbout(newAbout: HTMLElement | null): void {
    if (!this.aboutView) return;

    // 1. Remove previous about from aboutView
    const oldAbout = this.aboutView.querySelector(".reader-work-about");
    if (oldAbout) {
      oldAbout.remove();
    }

    this.aboutNode = newAbout;
    this.hasAbout = !!newAbout;

    // 2. If new about exists, append to aboutView
    if (newAbout && this.hasAbout) {
      if (newAbout instanceof HTMLDetailsElement) {
        newAbout.open = true;
      } else {
        newAbout.setAttribute("open", "");
      }
      this.aboutView.appendChild(newAbout);
    }

    // 3. Update tab visibility and container state
    if (this.tabsContainer && this.aboutTab && this.dictPanel) {
      const hasMultipleTabs = this.hasNotes || this.hasAbout;
      this.tabsContainer.hidden = !hasMultipleTabs;
      this.aboutTab.hidden = !this.hasAbout;
      this.dictPanel.classList.toggle("has-companion-tabs", hasMultipleTabs);
    }

    // 4. If active tab was about, but new page has no about, fall back to dict
    if (this._activeTab === "about" && !this.hasAbout) {
      this.setTab("dict");
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

    if (
      this.notesOriginalParent &&
      this.notesOriginalParent.isConnected &&
      this.notesNode
    ) {
      this.notesOriginalParent.insertBefore(
        this.notesNode,
        this.notesOriginalNextSibling
      );
    }

    if (
      this.aboutOriginalParent &&
      this.aboutOriginalParent.isConnected &&
      this.aboutNode
    ) {
      if (this.aboutNode instanceof HTMLDetailsElement) {
        this.aboutNode.open = false;
      } else {
        this.aboutNode.removeAttribute("open");
      }
      this.aboutOriginalParent.insertBefore(
        this.aboutNode,
        this.aboutOriginalNextSibling
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
