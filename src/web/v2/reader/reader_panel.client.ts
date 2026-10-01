/**
 * UI V2 Reader Companion Panel Controller
 *
 * The server renders the companion panel in its final shape
 * (`renderReaderDictPanelHtml`): a tab bar of `<a href="#panel-view-*">` links
 * and one view per tab (Dictionary, Notes, Translation, About). Without JS the
 * links switch views through `:target` (reader_panel.css). This controller
 * only adds behaviour on top:
 * - Tab roles, the selected tab and view, and arrow-key roving
 * - Hash reveals (`#note-*`, `#reader-work-about`, `#panel-view-*`) switch tabs
 * - Notes are the `notes` page-turn slot; tab visibility follows each swap
 * - The Translation view is fetched on first open
 * - Strict arbitration: word lookups always force-switch back to Dictionary
 *
 * Nothing is built, moved or put back, so the dictionary iframe never reloads.
 */

import { BaseController } from "@/web/v2/core/base_element.client";
import { escapeId, setHtml } from "@/web/v2/core/dom.client";
import { html } from "@/web/v2/core/html.common";
import { swapElementContent } from "@/web/v2/core/partial.client";
import { registerRevealer } from "@/web/v2/core/reveal.client";
import { SLOT_ATTR } from "@/web/v2/core/slots.common";

// TODO(reader-shortcuts): Unified companion panel keyboard shortcuts.
export const PANEL_TABS = ["dict", "notes", "translation", "about"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export interface ReaderPanelOptions {
  root?: ParentNode;
  hasTranslation?: boolean | (() => boolean);
  onLoadTranslation?: () => Promise<string | null>;
  onTabChange?: (tab: PanelTab) => void;
}

function isPanelTab(value: string): value is PanelTab {
  return PANEL_TABS.some((tab) => tab === value);
}

export class ReaderPanelController extends BaseController {
  private _activeTab: PanelTab = "dict";
  public hasNotes: boolean = false;
  public hasTranslation: boolean = false;
  public hasAbout: boolean = false;
  public noteCount: number = 0;
  private isTranslationLoaded: boolean = false;
  private readonly hasTranslationOption?: boolean | (() => boolean);
  private readonly onLoadTranslation?: () => Promise<string | null>;
  private readonly onTabChange?: (tab: PanelTab) => void;

  public dictPanel: HTMLElement | null = null;
  public tabsContainer: HTMLElement | null = null;
  public viewsContainer: HTMLElement | null = null;
  private readonly tabs = new Map<PanelTab, HTMLElement>();
  private readonly views = new Map<PanelTab, HTMLElement>();

  constructor(options: ReaderPanelOptions = {}) {
    super(options.root ?? document);
    this.onTabChange = options.onTabChange;
    this.hasTranslationOption = options.hasTranslation;
    this.hasTranslation = this.resolveHasTranslation();
    this.onLoadTranslation = options.onLoadTranslation;
  }

  public get dictTab(): HTMLElement | null {
    return this.tabs.get("dict") ?? null;
  }
  public get notesTab(): HTMLElement | null {
    return this.tabs.get("notes") ?? null;
  }
  public get translationTab(): HTMLElement | null {
    return this.tabs.get("translation") ?? null;
  }
  public get aboutTab(): HTMLElement | null {
    return this.tabs.get("about") ?? null;
  }
  public get dictView(): HTMLElement | null {
    return this.views.get("dict") ?? null;
  }
  public get notesView(): HTMLElement | null {
    return this.views.get("notes") ?? null;
  }
  public get translationView(): HTMLElement | null {
    return this.views.get("translation") ?? null;
  }
  public get aboutView(): HTMLElement | null {
    return this.views.get("about") ?? null;
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
    // Through the scope, not onDisconnect: BaseController skips onDisconnect
    // after a failed connect, which is exactly when the panel most needs to
    // go back to its No-JS fallback.
    this.scope.use(() => this.restoreNoJsState());
    this.hasTranslation = this.resolveHasTranslation();
    this.dictPanel = this.scope.$<HTMLElement>(".reader-dict-panel");
    this.tabsContainer =
      this.dictPanel?.querySelector<HTMLElement>(".reader-panel-tabs") ?? null;
    this.viewsContainer =
      this.dictPanel?.querySelector<HTMLElement>(".reader-panel-views") ?? null;
    this.tabs.clear();
    this.views.clear();
    for (const id of PANEL_TABS) {
      const tab = this.dictPanel?.querySelector<HTMLElement>(
        `#panel-tab-${id}`
      );
      const view = this.dictPanel?.querySelector<HTMLElement>(
        `#panel-view-${id}`
      );
      if (tab && view) {
        this.tabs.set(id, tab);
        this.views.set(id, view);
      }
    }
    if (!this.tabsContainer || !this.dictTab || !this.dictView) {
      this.hasNotes = false;
      this.hasAbout = false;
      this.noteCount = 0;
      return;
    }

    this.tabsContainer.setAttribute("role", "tablist");
    for (const [id, tab] of this.tabs) {
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", `panel-view-${id}`);
      const view = this.views.get(id);
      view?.setAttribute("role", "tabpanel");
      view?.setAttribute("aria-labelledby", tab.id);
    }
    this.hasAbout = !!this.aboutView?.querySelector(".reader-work-about");
    this.syncNotes();
    this.syncTabVisibility();

    if (!this.isAvailable(this._activeTab)) {
      this._activeTab = "dict";
    }
    this.syncTabDomState(this._activeTab);

    this.initTabEvents();
    this.initRevealers();
  }

  /**
   * Hands the panel back to the No-JS `:target` rules: they apply while no
   * view is `.active` and no tab has `aria-selected`. Runs on disconnect
   * and on a failed connect.
   */
  private restoreNoJsState(): void {
    this.tabsContainer?.removeAttribute("role");
    for (const tab of this.tabs.values()) {
      for (const attr of [
        "role",
        "aria-selected",
        "aria-controls",
        "tabindex",
      ]) {
        tab.removeAttribute(attr);
      }
    }
    for (const view of this.views.values()) {
      view.classList.remove("active");
      view.removeAttribute("role");
      view.removeAttribute("aria-labelledby");
    }
  }

  public override onContentSwap(swappedRoot: Element): void {
    super.onContentSwap(swappedRoot);
    if (!this.isConnected) return;
    const notesSlot = `[${SLOT_ATTR}="notes"]`;
    if (
      swappedRoot.matches(notesSlot) ||
      swappedRoot.querySelector(notesSlot)
    ) {
      this.syncNotes();
      this.syncTabVisibility();
      if (this._activeTab === "notes" && !this.hasNotes) {
        this.setTab("dict");
      }
    }
  }

  /** Counts the current page's notes, which live in the `notes` slot. */
  private syncNotes(): void {
    this.noteCount =
      this.notesView?.querySelectorAll(".reader-note").length ?? 0;
    this.hasNotes = this.noteCount > 0;
  }

  private isAvailable(tab: PanelTab): boolean {
    if (!this.tabs.has(tab)) return false;
    switch (tab) {
      case "dict":
        return true;
      case "notes":
        return this.hasNotes;
      case "translation":
        return this.hasTranslation;
      case "about":
        return this.hasAbout;
    }
  }

  private syncTabVisibility(): void {
    for (const [id, tab] of this.tabs) {
      tab.hidden = !this.isAvailable(id);
    }
    const hasMultipleTabs =
      this.hasNotes || this.hasTranslation || this.hasAbout;
    if (this.tabsContainer) this.tabsContainer.hidden = !hasMultipleTabs;
    this.dictPanel?.classList.toggle("has-companion-tabs", hasMultipleTabs);
  }

  private getAvailableTabs(): { id: PanelTab; tab: HTMLElement }[] {
    return PANEL_TABS.filter((id) => this.isAvailable(id)).flatMap((id) => {
      const tab = this.tabs.get(id);
      return tab ? [{ id, tab }] : [];
    });
  }

  private tabIdOf(tab: Element): PanelTab | null {
    const id = tab.id.replace(/^panel-tab-/, "");
    return isPanelTab(id) ? id : null;
  }

  private initTabEvents(): void {
    this.scope.delegate(
      this.tabsContainer,
      "click",
      ".reader-panel-tab",
      (e, tab) => {
        // Its own tab links switch tabs in place
        e.preventDefault();
        const id = this.tabIdOf(tab);
        if (id) this.setTab(id);
      }
    );

    this.scope.listen(this.tabsContainer, "keydown", (e: KeyboardEvent) => {
      const available = this.getAvailableTabs();
      const current = available.findIndex((t) => t.id === this._activeTab);
      if (current === -1) return;
      let next: number;
      if (e.key === "ArrowRight") {
        next = (current + 1) % available.length;
      } else if (e.key === "ArrowLeft") {
        next = (current - 1 + available.length) % available.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = available.length - 1;
      } else if (e.key === " ") {
        // Links don't activate on Space the way the tab role implies.
        next = current;
      } else {
        return;
      }
      // Roving arrow/Home/End/Space in its own tablist
      e.preventDefault();
      this.setTab(available[next].id);
      available[next].tab.focus();
    });

    this.scope.delegate(
      this.translationView,
      "click",
      "#btn-retry-translation",
      () => {
        this.isTranslationLoaded = false;
        this.setTab("translation");
      }
    );
  }

  /**
   * Hash targets inside a view switch to its tab: the initial URL hash,
   * `hashchange`, and in-page links (see core/reveal.client.ts). The tabs are
   * links to the views, so a view owns its own id's hash.
   */
  private initRevealers(): void {
    for (const [id, view] of this.views) {
      this.scope.use(
        registerRevealer(
          view,
          (target) => {
            const note =
              id === "notes"
                ? target.closest<HTMLElement>(".reader-note")
                : null;
            if (note) {
              this.showNote(note.id);
            } else {
              this.setTab(id);
            }
          },
          { ownsHash: true }
        )
      );
    }
  }

  public get activeTab(): PanelTab {
    return this._activeTab;
  }

  private syncTabDomState(active: PanelTab): void {
    for (const [id, tab] of this.tabs) {
      const selected = id === active;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      this.views.get(id)?.classList.toggle("active", selected);
    }
  }

  public setTab(tab: PanelTab): void {
    if (!this.isAvailable(tab)) return;
    this._activeTab = tab;
    this.syncTabDomState(tab);

    const view = this.translationView;
    if (
      tab === "translation" &&
      view &&
      !this.isTranslationLoaded &&
      this.onLoadTranslation
    ) {
      setHtml(
        view,
        html`<div class="reader-translation-loading">
          <span class="loading-spinner"></span>
        </div>`
      );
      this.onLoadTranslation()
        .then((transHtml) => {
          if (transHtml !== null && this.isConnected) {
            swapElementContent(view, transHtml);
            this.isTranslationLoaded = true;
          }
        })
        .catch((err) => {
          if (!this.isConnected) return;
          console.error("Failed to load translation:", err);
          this.showTranslationError();
        });
    }

    this.onTabChange?.(tab);
  }

  public showTranslationError(): void {
    if (!this.translationView) return;
    this.isTranslationLoaded = false;
    setHtml(
      this.translationView,
      html`<div class="reader-translation-error">
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
    this.translationView.scrollTop = 0;
  }

  public resetTranslation(): void {
    if (!this.translationView) return;
    this.translationView.replaceChildren();
    this.isTranslationLoaded = false;
    this.translationView.scrollTop = 0;
  }

  private clearActiveNotes(): void {
    for (const view of [this.notesView, this.translationView]) {
      view
        ?.querySelectorAll(".note-active")
        .forEach((el) => el.classList.remove("note-active"));
    }
  }

  private highlightNote(target: HTMLElement, opts: { focus?: boolean }): void {
    this.clearActiveNotes();
    target.classList.add("note-active");
    if (typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (opts.focus) {
      const link = target.querySelector<HTMLElement>("a") || target;
      link.focus?.();
    }
  }

  public showNote(bodyId: string, opts: { focus?: boolean } = {}): void {
    const selector = `#${escapeId(bodyId)}`;
    const transTarget =
      this.translationView?.querySelector<HTMLElement>(selector);
    if (transTarget) {
      this.setTab("translation");
      this.highlightNote(transTarget, opts);
      return;
    }

    const target = this.notesView?.querySelector<HTMLElement>(selector);
    if (!this.hasNotes || !target) return;
    this.setTab("notes");
    this.highlightNote(target, opts);
  }

  public reset(): void {
    this.setTab("dict");
    this.clearActiveNotes();
  }
}
