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

import { BaseController } from "@/web/v2/core/base_element.client";
import { setHtml } from "@/web/v2/core/dom.client";
import { html } from "@/web/v2/core/html.common";
import { ICON_PATHS } from "@/web/v2/core/icons.common";
import { swapElementContent } from "@/web/v2/core/partial.client";

// TODO(reader-shortcuts): Unified companion panel keyboard shortcuts.
export type PanelTab = "dict" | "notes" | "translation" | "about";

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
  hasTranslation?: boolean | (() => boolean);
  onLoadTranslation?: () => Promise<string | null>;
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

export class ReaderPanelController extends BaseController {
  private _activeTab: PanelTab = "dict";
  public hasNotes: boolean = false;
  public hasTranslation: boolean = false;
  public hasAbout: boolean = false;
  public noteCount: number = 0;
  private isTranslationLoaded: boolean = false;
  private loadedTranslationHtml: string | null = null;
  private readonly hasTranslationOption?: boolean | (() => boolean);
  private readonly overrides?: ReaderPanelElements;
  private readonly onLoadTranslation?: () => Promise<string | null>;
  private readonly onTabChange?: (tab: PanelTab) => void;

  public dictPanel: HTMLElement | null = null;
  public iframeContainer: HTMLElement | null = null;
  public notesNode: HTMLElement | null = null;
  public aboutNode: HTMLElement | null = null;
  public tabsContainer: HTMLElement | null = null;
  public dictTab: HTMLButtonElement | null = null;
  public notesTab: HTMLButtonElement | null = null;
  public translationTab: HTMLButtonElement | null = null;
  public aboutTab: HTMLButtonElement | null = null;
  public viewsContainer: HTMLElement | null = null;
  public dictView: HTMLElement | null = null;
  public notesView: HTMLElement | null = null;
  public translationView: HTMLElement | null = null;
  public aboutView: HTMLElement | null = null;

  private iframeOriginalParent: Node | null = null;
  private iframeOriginalNextSibling: Node | null = null;
  private iframeOriginalId: string | null = null;

  constructor(options: ReaderPanelOptions = {}) {
    super(options.root ?? document);
    this.overrides = options.elements;
    this.onTabChange = options.onTabChange;
    this.hasTranslationOption = options.hasTranslation;
    this.hasTranslation = this.resolveHasTranslation();
    this.onLoadTranslation = options.onLoadTranslation;
  }

  private resolveHasTranslation(): boolean {
    if (typeof this.hasTranslationOption === "function") {
      return this.hasTranslationOption();
    }
    if (this.hasTranslationOption !== undefined) {
      return Boolean(this.hasTranslationOption);
    }
    return this.host?.getAttribute("data-has-translation") === "true";
  }

  protected override onConnect(): void {
    const overrides = this.overrides;
    this.hasTranslation = this.resolveHasTranslation();

    const dictPanel =
      overrides?.dictPanel !== undefined
        ? overrides.dictPanel
        : this.scope.$<HTMLElement>(".reader-dict-panel");

    const iframeContainer =
      overrides?.iframeContainer !== undefined
        ? overrides.iframeContainer
        : dictPanel?.querySelector<HTMLElement>(".dict-iframe-container") ??
          this.scope.$<HTMLElement>(".dict-iframe-container");

    const notesNode =
      overrides?.notesNode !== undefined
        ? overrides.notesNode
        : this.scope.$<HTMLElement>(".reader-notes");

    const aboutNode =
      overrides?.aboutNode !== undefined
        ? overrides.aboutNode
        : this.scope.$<HTMLElement>("#reader-work-about");

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

    this.iframeOriginalParent = iframeContainer.parentNode;
    this.iframeOriginalNextSibling = iframeContainer.nextSibling;
    this.iframeOriginalId = iframeContainer.getAttribute("id");

    const hasMultipleTabs =
      this.hasNotes || this.hasTranslation || this.hasAbout;

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

    const translationTab = document.createElement("button");
    translationTab.type = "button";
    translationTab.className = "reader-panel-tab tab-translation";
    translationTab.id = "panel-tab-translation";
    translationTab.setAttribute("role", "tab");
    translationTab.setAttribute("aria-selected", "false");
    translationTab.setAttribute("aria-controls", "panel-view-translation");
    translationTab.setAttribute("aria-label", "Translation");
    translationTab.tabIndex = -1;

    const translationLabel = document.createElement("span");
    translationLabel.className = "reader-tab-label";
    translationLabel.textContent = "Translation";
    translationTab.appendChild(createTabIcon(ICON_PATHS.translation));
    translationTab.appendChild(translationLabel);

    if (!this.hasTranslation) {
      translationTab.hidden = true;
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
    tabs.appendChild(translationTab);
    tabs.appendChild(aboutTab);
    this.tabsContainer = tabs;
    this.dictTab = dictTab;
    this.notesTab = notesTab;
    this.translationTab = translationTab;
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

    const translationView = document.createElement("div");
    translationView.id = "panel-view-translation";
    translationView.className = "reader-panel-translation reader-panel-view";
    translationView.setAttribute("role", "tabpanel");
    translationView.setAttribute("aria-labelledby", "panel-tab-translation");
    translationView.setAttribute("aria-live", "polite");
    views.appendChild(translationView);
    this.translationView = translationView;

    if (this.isTranslationLoaded && this.loadedTranslationHtml !== null) {
      swapElementContent(translationView, this.loadedTranslationHtml);
    }

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

    // Restore preserved _activeTab if still valid, else fall back to dict
    if (
      (this._activeTab === "notes" && !this.hasNotes) ||
      (this._activeTab === "translation" && !this.hasTranslation) ||
      (this._activeTab === "about" && !this.hasAbout)
    ) {
      this._activeTab = "dict";
    }
    this.syncTabDomState(this._activeTab);

    // 3. Register Event Listeners
    this.initTabEvents();
  }

  protected override onDisconnect(): void {
    const liveTextCard =
      this.overrides?.textCard ??
      this.scope.$<HTMLElement>(".reader-text-card") ??
      this.scope.$<HTMLElement>(".reader-text-panel");
    const liveFooter =
      liveTextCard?.querySelector<HTMLElement>(
        ".card-footer, .reader-passage-footer"
      ) ?? null;

    if (liveTextCard && this.notesNode) {
      if (liveFooter && liveFooter.parentNode === liveTextCard) {
        liveTextCard.insertBefore(this.notesNode, liveFooter);
      } else {
        liveTextCard.appendChild(this.notesNode);
      }
    }

    if (liveTextCard && this.aboutNode) {
      if (this.aboutNode instanceof HTMLDetailsElement) {
        this.aboutNode.open = false;
      } else {
        this.aboutNode.removeAttribute("open");
      }
      if (liveFooter && liveFooter.parentNode === liveTextCard) {
        liveTextCard.insertBefore(this.aboutNode, liveFooter);
      } else {
        liveTextCard.appendChild(this.aboutNode);
      }
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

  public override onContentSwap(swappedRoot: Element): void {
    super.onContentSwap(swappedRoot);
    if (!this.isConnected) return;
    const textPanel = swappedRoot.matches(
      ".reader-text-panel, .reader-text-card"
    )
      ? swappedRoot
      : swappedRoot.querySelector<HTMLElement>(
          ".reader-text-panel, .reader-text-card"
        );
    if (!textPanel) return;

    const newNotes = textPanel.querySelector<HTMLElement>(".reader-notes");
    this.adoptNotes(newNotes);

    const newAbout = textPanel.querySelector<HTMLElement>("#reader-work-about");
    this.adoptAbout(newAbout);
  }

  public getAvailableTabs(): { id: PanelTab; btn: HTMLButtonElement }[] {
    const tabs: { id: PanelTab; btn: HTMLButtonElement }[] = [];
    if (this.dictTab) tabs.push({ id: "dict", btn: this.dictTab });
    if (this.hasNotes && this.notesTab)
      tabs.push({ id: "notes", btn: this.notesTab });
    if (this.hasTranslation && this.translationTab)
      tabs.push({ id: "translation", btn: this.translationTab });
    if (this.hasAbout && this.aboutTab)
      tabs.push({ id: "about", btn: this.aboutTab });
    return tabs;
  }

  private initTabEvents(): void {
    if (
      !this.dictTab ||
      !this.notesTab ||
      !this.aboutTab ||
      !this.tabsContainer
    )
      return;

    this.scope.listen(this.dictTab, "click", (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("dict");
    });

    this.scope.listen(this.notesTab, "click", (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("notes");
    });

    this.scope.listen(this.translationTab, "click", (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("translation");
    });

    this.scope.listen(this.aboutTab, "click", (e: MouseEvent) => {
      e.preventDefault();
      this.setTab("about");
    });

    this.scope.listen(this.tabsContainer, "keydown", (e: KeyboardEvent) => {
      if (!this.dictTab) return;
      const activeTabs = this.getAvailableTabs();
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
    });

    this.scope.delegate(
      this.translationView,
      "click",
      "#btn-retry-translation",
      () => {
        this.isTranslationLoaded = false;
        this.loadedTranslationHtml = null;
        this.setTab("translation");
      }
    );
  }

  public get activeTab(): PanelTab {
    return this._activeTab;
  }

  private syncTabDomState(tab: PanelTab): void {
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

    if (this.translationTab && this.translationView) {
      const isTrans = tab === "translation";
      this.translationTab.setAttribute(
        "aria-selected",
        isTrans ? "true" : "false"
      );
      this.translationTab.tabIndex = isTrans ? 0 : -1;
      this.translationView.classList.toggle("active", isTrans);
    }

    if (this.aboutTab && this.aboutView) {
      const isAbout = tab === "about";
      this.aboutTab.setAttribute("aria-selected", isAbout ? "true" : "false");
      this.aboutTab.tabIndex = isAbout ? 0 : -1;
      this.aboutView.classList.toggle("active", isAbout);
    }
  }

  public setTab(tab: PanelTab): void {
    if (tab === "notes" && !this.hasNotes) return;
    if (tab === "translation" && !this.hasTranslation) return;
    if (tab === "about" && !this.hasAbout) return;
    this._activeTab = tab;

    this.syncTabDomState(tab);

    if (
      tab === "translation" &&
      this.translationView &&
      !this.isTranslationLoaded &&
      this.onLoadTranslation
    ) {
      setHtml(
        this.translationView,
        html`<div class="reader-translation-loading" style="min-height: 200px;">
          <span class="loading-spinner"></span>
        </div>`
      );
      this.onLoadTranslation()
        .then((transHtml) => {
          if (transHtml !== null && this.translationView) {
            swapElementContent(this.translationView, transHtml);
            this.isTranslationLoaded = true;
            this.loadedTranslationHtml = transHtml;
          }
        })
        .catch((err) => {
          console.error("Failed to load translation:", err);
          this.showTranslationError();
        });
    }

    this.onTabChange?.(tab);
  }

  public setActiveTab(tab: PanelTab): void {
    this.setTab(tab);
  }

  public showTranslationError(): void {
    if (!this.translationView) return;
    this.isTranslationLoaded = false;
    this.loadedTranslationHtml = null;
    setHtml(
      this.translationView,
      html`<div class="reader-translation-error" style="min-height: 200px;">
        <p>Failed to load translation.</p>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          id="btn-retry-translation">
          Retry
        </button>
      </div>`
    );
  }

  public setTranslationHtml(transHtml: string): void {
    if (!this.translationView) return;
    swapElementContent(this.translationView, transHtml);
    this.isTranslationLoaded = true;
    this.loadedTranslationHtml = transHtml;
    this.translationView.scrollTop = 0;
  }

  public resetTranslation(): void {
    if (!this.translationView) return;
    this.translationView.replaceChildren();
    this.isTranslationLoaded = false;
    this.loadedTranslationHtml = null;
    this.translationView.scrollTop = 0;
  }

  private clearActiveNotes(): void {
    this.notesView
      ?.querySelectorAll(".note-active")
      .forEach((el) => el.classList.remove("note-active"));
    this.translationView
      ?.querySelectorAll(".note-active")
      .forEach((el) => el.classList.remove("note-active"));
  }

  public showNote(bodyId: string, opts: { focus?: boolean } = {}): void {
    const transTarget = this.translationView?.querySelector<HTMLElement>(
      `#${escapeId(bodyId)}`
    );
    if (transTarget && this.translationView) {
      this.setTab("translation");
      this.clearActiveNotes();
      transTarget.classList.add("note-active");
      if (typeof transTarget.scrollIntoView === "function") {
        transTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      if (opts.focus) {
        const link = transTarget.querySelector<HTMLElement>("a") || transTarget;
        link.focus?.();
      }
      return;
    }

    if (!this.hasNotes || !this.notesView) return;

    this.setTab("notes");
    this.clearActiveNotes();

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
    if (oldNotes && oldNotes !== newNotes) {
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
      const hasMultipleTabs =
        this.hasNotes || this.hasTranslation || this.hasAbout;
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
    if (oldAbout && oldAbout !== newAbout) {
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
      const hasMultipleTabs =
        this.hasNotes || this.hasTranslation || this.hasAbout;
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
    this.clearActiveNotes();
  }
}
