import {
  BaseElement,
  type QueryParamSync,
  DrawerController,
  DRAWER_DEFAULT_SVH,
  DRAWER_EXPANDED_SVH,
  DRAWER_FLOOR_SVH,
  ICON_PATHS,
  copyText,
  escapeId,
  fetchAndSwapPartial,
  html,
  isPlainLeftClick,
  measureSvh100,
  registerElement,
  setHtml,
  settingsStore,
  showToast,
  syncIframeTheme,
  tokenizeTargets,
} from "@/web/v2/core/index.client";
import { removeMacrons } from "@/common/text_cleaning";
import {
  DEFAULT_READER_PREFS,
  MorcusReaderSettings,
  getWorkMacra,
  parseReaderPreferences,
  type ReaderFontFamily,
  type ReaderLineHeight,
  type ReaderPreferences,
  type ReaderSettingsChangeEventDetail,
  READER_SETTINGS_KEY,
  readerSettingsStore,
} from "@/web/v2/reader/reader_settings.client";
import { savedSpotsStore } from "@/web/v2/reader/saved_spots.client";
import { ReaderTocController } from "@/web/v2/reader/reader_toc.client";
import {
  ReaderPanelController,
  type PanelTab,
} from "@/web/v2/reader/reader_panel.client";
import {
  ReaderLayoutController,
  type ReaderLayoutElements,
  type ReaderLayoutOptions,
  MIN_SPLIT_WIDTH,
  MAX_SPLIT_WIDTH,
  MIN_TEXT_PANEL_WIDTH,
  DEFAULT_SPLIT_WIDTH,
  READER_DICT_WIDTH_STORAGE_KEY,
  computeMaxSplitWidth,
} from "@/web/v2/reader/reader_layout.client";

export const READER_DRAWER_MIN_HEIGHT = 40;

export {
  type ReaderFontFamily,
  type ReaderLineHeight,
  type ReaderPreferences,
  DEFAULT_READER_PREFS,
  READER_SETTINGS_KEY,
  parseReaderPreferences,
  readerSettingsStore,
  type ReaderSettingsChangeEventDetail,
  ReaderLayoutController,
  type ReaderLayoutElements,
  type ReaderLayoutOptions,
  MIN_SPLIT_WIDTH,
  MAX_SPLIT_WIDTH,
  MIN_TEXT_PANEL_WIDTH,
  DEFAULT_SPLIT_WIDTH,
  READER_DICT_WIDTH_STORAGE_KEY,
  computeMaxSplitWidth,
  ReaderPanelController,
  type PanelTab,
};

/**
 * Progressively enhanced Reader View with embedded dictionary lookup using Light DOM.
 *
 * Without JS:
 * - Clean semantic HTML prose/verse rendered without word anchor bloat.
 * - Dictionary panel embeds a self-contained iframe (/v2/dicts?embedded=1).
 * - Searching words in the iframe maintains the reader's scroll position 100% stationary.
 *
 * With JS:
 * - Tokenizes text nodes into clickable <span class="lat-word" role="button"> on mount (< 2ms).
 * - Clicking or pressing Enter on a word updates the dictionary iframe src and history state.
 * - Manages mobile bottom sheet expansion and desktop resizable panels.
 * - Performs seamless in-place partial page swaps without full reload or losing iframe state.
 * */
export class MorcusReaderView extends BaseElement<"page" | "translation"> {
  private currentQuery: string = "";
  private preferredDrawerSvh: number = DRAWER_DEFAULT_SVH;
  private readonly tocController = this.addController(
    new ReaderTocController({ root: this })
  );
  private readonly layoutController = this.addController(
    new ReaderLayoutController({ root: this })
  );
  private readonly drawerController = this.addController(
    new DrawerController({
      root: this,
      drawerSelector: ".reader-dict-panel",
      handleSelector: ".reader-sheet-bar",
      layoutElement: () => document.documentElement,
      minHeight: READER_DRAWER_MIN_HEIGHT,
      defaultSvh: DRAWER_DEFAULT_SVH,
      floorSvh: DRAWER_FLOOR_SVH,
      expandedSvh: DRAWER_EXPANDED_SVH,
      preferredSvh: DRAWER_DEFAULT_SVH,
      filter: (e) => {
        if (
          e.target instanceof Element &&
          e.target.closest(
            "a.reader-sheet-close, a.drawer-close, .reader-panel-tab, [role='tab']"
          )
        ) {
          return false;
        }
        return true;
      },
      onDragStart: () => {
        this.undismissDrawer();
        this.layoutController.setActive(true);
      },
      onMinimize: () => {
        this.updateSheetLabel(true);
        this.resetDictScroll();
      },
      onRestore: (svh) => {
        this.undismissDrawer();
        this.layoutController.setActive(true);
        this.preferredDrawerSvh = svh;
        this.updateSheetLabel(false);
        this.resetDictScroll();
      },
      onEscape: () => {
        this.dismissDictionary(true);
      },
    })
  );
  private readonly panelController = this.addController(
    new ReaderPanelController({
      root: this,
      hasTranslation: () =>
        this.getAttribute("data-has-translation") === "true",
      onLoadTranslation: () =>
        this.fetchTranslation(
          this.currentPageUrl,
          this.scope.latest("translation")
        ),
      onTabChange: () => {
        this.activatePanelLayout();
        this.updateSheetLabel(false);
      },
    })
  );
  private currentNoteId: string = "";
  private currentNoteLabel: string = "";
  private router: QueryParamSync | null = null;
  private currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };
  private originalScrollRestoration: ScrollRestoration = "auto";
  private readonly translationCache = new Map<string, string>();

  public getLayoutController(): ReaderLayoutController | null {
    return this.layoutController.isConnected ? this.layoutController : null;
  }

  public getPanelController(): ReaderPanelController | null {
    return this.panelController.isConnected ? this.panelController : null;
  }

  public getSettingsElement(): MorcusReaderSettings | null {
    return this.querySelector<MorcusReaderSettings>("morcus-reader-settings");
  }

  public getActiveNoteId(): string {
    return this.currentNoteId;
  }

  public getActiveNoteLabel(): string {
    return this.currentNoteLabel;
  }

  protected override onConnect() {
    if (typeof window !== "undefined" && window.history) {
      this.originalScrollRestoration = window.history.scrollRestoration;
      try {
        window.history.scrollRestoration = "manual";
      } catch {
        // Ignored in test environments
      }
    }

    this.preferredDrawerSvh = this.drawerController.getPreferredSvh();
    this.currentPrefs = readerSettingsStore.get();
    const workId = this.dataset.work;
    if (workId) {
      this.currentPrefs.showMacra = getWorkMacra(workId);
    }
    this.saveCurrentSpot();
    this.enhancePassage();
    this.applyPreferences(this.currentPrefs);

    this.scope.listen<ReaderSettingsChangeEventDetail>(
      this,
      "reader-settings-change",
      (e) => {
        if (e.detail?.prefs) {
          this.applyPreferences(e.detail.prefs);
        }
      }
    );

    this.router = this.syncQueryParam("q", {
      onChange: (q) => {
        if (!q) {
          this.dismissDictionary(false);
          return;
        }
        this.lookupWord(q, this.findWordElement(q), false);
        this.refreshTitle();
      },
      onNavigate: (event) => {
        const prevUrl = new URL(event.prevPath, window.location.origin);
        const newUrl = new URL(event.newPath, window.location.origin);

        const isPathChange = newUrl.pathname !== prevUrl.pathname;

        if (isPathChange) {
          void this.swapPage(window.location.href, {
            push: false,
            isPopState: true,
          });
        } else {
          if (!event.value) {
            this.dismissDictionary(false);
          } else {
            this.lookupWord(
              event.value,
              this.findWordElement(event.value),
              false
            );
          }
          this.refreshTitle();
        }
      },
    });

    this.currentQuery = this.router.get();
    if (this.currentQuery) {
      const el = this.findWordElement(this.currentQuery);
      if (el) el.classList.add("word-active");
    }

    this.scope.listen(this, "click", this.handleClick);
    this.scope.listen(this, "keydown", this.handlePassageKeydown);

    this.initBackToTop();
    this.resetDictScroll();
    this.initKeyboardShortcuts();
    this.initIframeThemeSync();

    const iframe = this.querySelector<HTMLIFrameElement>("#dict-frame");
    if (iframe) {
      this.scope.listen(iframe, "load", () => {
        this.applyDictScale(this.currentPrefs.dictScale);
      });
      if (this.currentPrefs.dictScale !== 100) {
        const src = iframe.getAttribute("src");
        if (src && !src.includes("scale=")) {
          iframe.src = `${src}${src.includes("?") ? "&" : "?"}scale=${
            this.currentPrefs.dictScale
          }`;
        }
      }
    }
  }

  private initIframeThemeSync() {
    const iframe = this.querySelector<HTMLIFrameElement>("#dict-frame");
    if (!iframe) return;

    const syncTheme = () => {
      const currentTheme =
        document.documentElement.getAttribute("data-theme") ||
        (settingsStore.get().darkMode ? "dark" : "light");
      syncIframeTheme(iframe, currentTheme);
    };

    this.scope.listen(iframe, "load", syncTheme);
    syncTheme();
  }

  protected override onDisconnect() {
    if (typeof window !== "undefined" && window.history) {
      try {
        window.history.scrollRestoration = this.originalScrollRestoration;
      } catch {
        // Ignored
      }
    }
  }

  private readonly handleClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;

    // Handle close button click (dismisses mobile drawer & clears word)
    const closeBtn = e.target.closest<HTMLAnchorElement>(
      "a.reader-sheet-close, a.drawer-close"
    );
    if (closeBtn) {
      e.preventDefault();
      this.closeDictionary(true);
      return;
    }

    // Handle open link or floating restore FAB click (expands drawer)
    const openLink = e.target.closest<HTMLAnchorElement>(
      "a.reader-sheet-open-link, a.reader-drawer-fab"
    );
    if (openLink) {
      e.preventDefault();
      this.restoreDrawer();
      return;
    }

    // Handle section anchor click (copies canonical permalink with toast confirmation)
    const secAnchor = e.target.closest<HTMLAnchorElement>("a.section-anchor");
    if (secAnchor) {
      e.preventDefault();
      const href = secAnchor.getAttribute("href") || "";
      const secId = href.replace(/^#sec-/, "");
      const fullUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#sec-${secId}`;
      void copyText(fullUrl);
      const secEl = document.getElementById(`sec-${secId}`);
      if (secEl) {
        if (typeof secEl.scrollIntoView === "function") {
          secEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
        secEl.classList.add("target-highlight");
        this.scope.timeout(
          () => secEl.classList.remove("target-highlight"),
          3000
        );
      }
      this.saveCurrentSpot(secId);
      showToast(`Copied permalink: § ${secId}`);
      return;
    }

    // Handle in-text note marker click (reveals critical apparatus in notes panel)
    const noteRef = e.target.closest<HTMLAnchorElement>("a.reader-note-ref");
    if (noteRef) {
      e.preventDefault();
      const href = noteRef.getAttribute("href") || "";
      const bodyId = href.replace(/^#/, "");
      if (bodyId && this.panelController) {
        this.openNote(bodyId, noteRef);
      }
      return;
    }

    // Handle edition/about link click (reveals scholarly attribution in companion panel)
    const aboutLink = e.target.closest<HTMLAnchorElement>(
      "a.reader-about-link"
    );
    if (aboutLink) {
      e.preventDefault();
      this.activatePanelTab("about");
      this.panelController?.aboutTab?.focus();
      return;
    }

    // Handle note backlink click (jumps passage to the marker and flashes it)
    const backref = e.target.closest<HTMLAnchorElement>(
      "a.reader-note-backref"
    );
    if (backref) {
      const href = backref.getAttribute("href") || "";
      const refId = href.replace(/^#/, "");
      const markerEl = document.getElementById(refId);
      if (markerEl) {
        e.preventDefault();
        if (typeof markerEl.scrollIntoView === "function") {
          markerEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
        this.setActiveMarker(markerEl);
      }
      return;
    }

    const wordEl = e.target.closest<HTMLElement>(".lat-word");
    if (wordEl) {
      e.preventDefault();
      const word = wordEl.dataset.word || wordEl.textContent?.trim() || "";
      if (word) {
        this.lookupWord(word, wordEl, true);
      }
      return;
    }

    // Intercept in-work navigation links (pager arrows, continuation cards, TOC links, view toggles)
    const link = e.target.closest<HTMLAnchorElement>("a[href]");
    if (
      !link ||
      e.defaultPrevented ||
      !isPlainLeftClick(e) ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download")
    ) {
      return;
    }

    if (
      link.classList.contains("disabled") ||
      link.getAttribute("aria-disabled") === "true"
    ) {
      e.preventDefault();
      return;
    }

    const rawHref = link.getAttribute("href");
    if (!rawHref || rawHref === "#" || rawHref.startsWith("javascript:")) {
      return;
    }

    if (rawHref.startsWith("#")) {
      if (rawHref.startsWith("#sec-")) {
        e.preventDefault();
        this.scrollToHash(rawHref);
      }
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(link.href, window.location.href);
    } catch {
      return;
    }

    if (this.currentQuery) {
      targetUrl.searchParams.set("q", this.currentQuery);
    } else {
      targetUrl.searchParams.delete("q");
    }

    if (targetUrl.origin !== window.location.origin) {
      return;
    }

    const author = this.dataset.author;
    const name = this.dataset.name;
    if (!author || !name) {
      return;
    }

    const workPrefix = `/v2/reader/${author}/${name}`;
    if (
      targetUrl.pathname !== workPrefix &&
      !targetUrl.pathname.startsWith(`${workPrefix}/`)
    ) {
      return;
    }

    const currentView = this.dataset.view ?? "single";
    const targetView =
      targetUrl.searchParams.get("view") === "parallel" ? "parallel" : "single";
    const isSamePath = targetUrl.pathname === window.location.pathname;
    const isSameView = targetView === currentView;

    if (isSamePath && isSameView) {
      if (targetUrl.hash) {
        e.preventDefault();
        this.scrollToHash(targetUrl.hash);
        if (this.tocController?.isOpen()) {
          this.tocController.close();
        }
        return;
      }
      if (this.tocController?.isOpen()) {
        e.preventDefault();
        this.tocController.close();
        return;
      }
      return;
    }

    e.preventDefault();
    if (this.tocController?.isOpen()) {
      this.tocController.close();
    }
    void this.swapPage(targetUrl.href, { push: true });
  };

  private readonly handlePassageKeydown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (!(e.target instanceof HTMLElement)) return;
    if (
      !e.target.closest("#reader-passage") &&
      !e.target.closest(".reader-panel-translation") &&
      !e.target.closest(".reader-panel-notes")
    ) {
      return;
    }

    if (e.target.classList.contains("lat-word")) {
      e.preventDefault();
      const word = e.target.dataset.word || e.target.textContent?.trim() || "";
      if (word) {
        this.lookupWord(word, e.target, true);
      }
    } else {
      const noteRef = e.target.closest<HTMLAnchorElement>("a.reader-note-ref");
      if (noteRef) {
        e.preventDefault();
        const href = noteRef.getAttribute("href") || "";
        const bodyId = href.replace(/^#/, "");
        if (bodyId && this.panelController) {
          this.openNote(bodyId, noteRef, { focus: true });
        }
        return;
      }

      const backref = e.target.closest<HTMLAnchorElement>(
        "a.reader-note-backref"
      );
      if (backref) {
        const href = backref.getAttribute("href") || "";
        const refId = href.replace(/^#/, "");
        const markerEl = document.getElementById(refId);
        if (markerEl) {
          e.preventDefault();
          if (typeof markerEl.scrollIntoView === "function") {
            markerEl.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            });
          }
          this.setActiveMarker(markerEl);
          markerEl.focus?.();
        }
      }
    }
  };

  private saveCurrentSpot(explicitSecId?: string): void {
    const workId = this.dataset.work;
    if (!workId) return;

    let secId = explicitSecId;
    if (!secId) {
      const hash = window.location.hash;
      if (hash.startsWith("#sec-")) {
        const parsed = hash.slice(5).trim();
        if (parsed) {
          secId = parsed;
        }
      }
    }
    if (!secId) {
      secId = this.dataset.page;
    }

    if (secId) {
      savedSpotsStore.set(workId, secId);
    }
  }

  private closeDictionary(updateHistory: boolean = true) {
    this.dismissDictionary(updateHistory);
    this.dismissDrawer();
  }

  /**
   * Renders the mobile drawer teaser label ("Definitions for <strong>word</strong>").
   *
   * The query originates from user-controlled input (the `?q=` URL parameter and word
   * text content), so it is bound via `textContent` rather than interpolated into an
   * HTML string. The `<strong>` wrapper is load-bearing: `.reader-sheet-label strong`
   * in core/drawer.css supplies its color and weight.
   *
   * Mirrors the server-rendered markup in reader.server.ts.
   */
  private renderSheetTeaser(
    contentNodes: (Node | string)[],
    showExpandHint: boolean = false
  ): void {
    const sheetLabel = this.querySelector<HTMLElement>(".reader-sheet-label");
    if (!sheetLabel) return;

    const nodes: (Node | string)[] = [...contentNodes];
    if (showExpandHint) {
      const hint = document.createElement("span");
      hint.style.opacity = "0.8";
      hint.style.fontWeight = "400";
      hint.textContent = "tap to expand";
      nodes.push(" \u00b7 ", hint);
    }

    sheetLabel.replaceChildren(...nodes);
  }

  private setSheetLabel(query: string, showExpandHint: boolean = false): void {
    if (!query) return;
    const strong = document.createElement("strong");
    strong.textContent = query;
    this.renderSheetTeaser(["Definitions for ", strong], showExpandHint);
  }

  private setSheetNoteLabel(
    label: string,
    showExpandHint: boolean = false
  ): void {
    const strong = document.createElement("strong");
    strong.textContent = `Note ${label}`;
    this.renderSheetTeaser([strong], showExpandHint);
  }

  private setSheetNotesListLabel(showExpandHint: boolean = false): void {
    const count = this.panelController?.noteCount ?? 0;
    const strong = document.createElement("strong");
    strong.textContent = `Notes (${count})`;
    this.renderSheetTeaser([strong], showExpandHint);
  }

  private setSheetTranslationLabel(showExpandHint: boolean = false): void {
    const strong = document.createElement("strong");
    strong.textContent = "Translation";
    this.renderSheetTeaser([strong], showExpandHint);
  }

  private setSheetAboutLabel(showExpandHint: boolean = false): void {
    const strong = document.createElement("strong");
    strong.textContent = "About this text";
    this.renderSheetTeaser([strong], showExpandHint);
  }

  private updateSheetLabel(showExpandHint: boolean = false): void {
    if (this.panelController?.activeTab === "notes") {
      if (this.currentNoteLabel) {
        this.setSheetNoteLabel(this.currentNoteLabel, showExpandHint);
      } else {
        this.setSheetNotesListLabel(showExpandHint);
      }
    } else if (this.panelController?.activeTab === "translation") {
      this.setSheetTranslationLabel(showExpandHint);
    } else if (this.panelController?.activeTab === "about") {
      this.setSheetAboutLabel(showExpandHint);
    } else if (this.currentQuery) {
      this.setSheetLabel(this.currentQuery, showExpandHint);
    }
  }

  public dismissDrawer(): void {
    const splitLayout =
      this.layoutController.splitLayout ??
      this.querySelector<HTMLElement>(".reader-split-layout");
    splitLayout?.classList.add("drawer-dismissed");
  }

  public undismissDrawer(): void {
    const splitLayout =
      this.layoutController.splitLayout ??
      this.querySelector<HTMLElement>(".reader-split-layout");
    splitLayout?.classList.remove("drawer-dismissed");
    if (window.location.hash === "#reader-dict-dismissed") {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search
      );
    }
  }

  public minimizeDrawer(): void {
    this.drawerController.minimize();
  }

  public restoreDrawer(targetSvh?: number): void {
    this.undismissDrawer();
    this.layoutController.setActive(true);
    this.drawerController.restore(targetSvh);
  }

  public activatePanelLayout(): void {
    this.restoreDrawer();
  }

  public activatePanelTab(tab: PanelTab): void {
    this.panelController?.setTab(tab);
    this.activatePanelLayout();
  }

  public openNote(
    bodyId: string,
    markerEl: HTMLElement,
    opts: { focus?: boolean } = {}
  ): void {
    this.currentNoteId = bodyId;
    const label = markerEl.textContent?.replace(/[[\]]/g, "").trim() || "";
    this.currentNoteLabel = label;

    // Clear active word highlight if any
    this.setActiveWord(null);

    // Highlight marker in passage
    this.setActiveMarker(markerEl);

    // Show note in companion panel
    this.panelController?.showNote(bodyId, opts);

    // Ensure layout is active
    this.activatePanelLayout();

    // Update mobile teaser label if on notes tab
    if (this.panelController?.activeTab === "notes") {
      this.setSheetNoteLabel(label);
    }

    // Mobile scroll guard: Ensure tapped marker in passage is not occluded by the newly opened/restored drawer
    this.scrollTargetAboveDrawer(markerEl);
  }

  private setActiveMarker(el?: HTMLElement | null): void {
    const active = this.querySelectorAll<HTMLElement>(
      "a.reader-note-ref.marker-active"
    );
    active.forEach((m) => m.classList.remove("marker-active"));
    el?.classList.add("marker-active");
  }

  /**
   * Makes `el` the only highlighted word in the passage, or clears the highlight
   * entirely when given nothing.
   *
   * Queries the active word rather than every word: the highlight is on at most one
   * element, but a chapter holds thousands, and this runs synchronously in the click
   * handler before the new highlight is painted.
   *
   * The `.reader-text-panel` scope is load-bearing. `linkifyText` also emits
   * `word-active` on dictionary-entry markup, which must not be cleared from here.
   */
  private setActiveWord(el?: HTMLElement | null) {
    const active = this.querySelectorAll<HTMLElement>(
      ".reader-text-panel .word-active"
    );
    active.forEach((word) => word.classList.remove("word-active"));
    el?.classList.add("word-active");
  }

  private dismissDictionary(updateHistory: boolean = true) {
    this.currentQuery = "";
    this.currentNoteId = "";
    this.currentNoteLabel = "";

    // Remove active highlights
    this.setActiveWord(null);
    this.setActiveMarker(null);

    // Arbitration Rule A4: Reset companion panel to Dictionary tab
    this.panelController?.reset();

    // Reset iframe to default embedded state
    const iframe = this.querySelector<HTMLIFrameElement>("#dict-frame");
    if (iframe) {
      iframe.src = "/v2/dicts?embedded=1";
    }

    // Update split layout class to empty
    this.layoutController.setActive(false);

    // Reset drawer height and ARIA on mobile
    this.drawerController.reset();

    // Update mobile teaser label
    const sheetLabel = this.querySelector<HTMLElement>(".reader-sheet-label");
    if (sheetLabel) {
      sheetLabel.textContent = "Tap any word to view definitions";
    }

    if (updateHistory) {
      this.router?.replace("");
    }
  }

  private lookupWord(
    word: string,
    activeAnchor?: HTMLElement,
    updateHistory: boolean = true
  ) {
    if (!word) return;

    const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
    if (
      word === this.currentQuery &&
      dictPanel?.classList.contains("drawer-minimized")
    ) {
      this.restoreDrawer();
      return;
    }

    this.currentQuery = word;

    // Arbitration Rule A1: Force switch to Dictionary tab if Notes tab was open
    this.setActiveMarker(null);
    this.currentNoteId = "";
    this.currentNoteLabel = "";
    this.panelController?.setTab("dict");

    // Update active highlight in the text
    this.setActiveWord(activeAnchor ?? this.findWordElement(word));

    // Update dictionary iframe (filtering by lang=La and forcing inflected search o=1 for Latin text word lookups)
    const iframe = this.querySelector<HTMLIFrameElement>("#dict-frame");
    if (iframe) {
      const targetSrc = `/v2/dicts?q=${encodeURIComponent(
        word
      )}&lang=La&o=1&embedded=1&scale=${this.currentPrefs.dictScale}`;
      if (iframe.getAttribute("src") !== targetSrc) {
        iframe.src = targetSrc;
      }
    }

    // Update split layout class to active (expands mobile sheet)
    this.layoutController.setActive(true);

    // Ensure drawer is open and restored to preferred dvh
    this.restoreDrawer();

    // Mobile scroll guard: Ensure tapped word is not occluded by the newly opened/restored drawer
    const targetEl = activeAnchor || this.findWordElement(word);
    if (targetEl) {
      this.scrollTargetAboveDrawer(targetEl);
    }

    // Update mobile teaser bar label
    this.setSheetLabel(word);

    // Synchronize browser history and page title
    if (updateHistory) {
      this.router?.push(word);
    }
  }

  private scrollTargetAboveDrawer(targetEl: HTMLElement): void {
    if (window.innerWidth <= 640 && !targetEl.closest(".reader-dict-panel")) {
      this.scope.rAF(() => {
        const rect = targetEl.getBoundingClientRect();
        const svh = this.preferredDrawerSvh || DRAWER_DEFAULT_SVH;
        const svh100 = measureSvh100();
        const winHeight = window.innerHeight || svh100;
        const drawerTop = winHeight - svh100 * (svh / 100);
        if (rect.bottom > drawerTop - 24) {
          const scrollNeeded = rect.bottom - (drawerTop - 24);
          window.scrollBy({
            top: scrollNeeded,
            left: 0,
            behavior: "smooth",
          });
        }
      });
    }
  }

  private enhancePassage() {
    const passage = this.querySelector<HTMLElement>("#reader-passage");
    if (!passage) return;

    // Tokenizing rewrites the passage into `.lat-word` spans, so it must
    // happen exactly once. The marker lives in the DOM and therefore survives a
    // disconnect, which is why the listener below cannot be guarded by it.
    if (passage.dataset.enhanced !== "true") {
      passage.dataset.enhanced = "true";

      tokenizeTargets(passage, {
        targetSelector: "[data-tokenize-target='true']",
        fallbackSelector:
          ".reader-section p.reader-paragraph, " +
          ".reader-section .reader-line",
        enhancedDatasetKey: "wordsEnhanced",
        renderWord: (token) => {
          const span = document.createElement("span");
          span.className = "lat-word";
          span.setAttribute("role", "button");
          span.setAttribute("tabindex", "0");
          span.setAttribute("data-word", token);
          span.textContent = token;
          return span;
        },
      });
    }
  }

  private findWordElement(word: string): HTMLElement | undefined {
    const rawWord = word.trim().toLowerCase();
    const nfcWord = rawWord.normalize("NFC");
    const strippedWord = removeMacrons(rawWord);
    const allWords = this.querySelectorAll<HTMLElement>(
      ".reader-text-panel .lat-word"
    );

    // 1. Exact or NFC-normalized match (e.g. Mūsa NFC matching Mūsa NFD)
    for (const w of allWords) {
      const val = (w.dataset.word || w.textContent || "").trim().toLowerCase();
      if (val === rawWord || val.normalize("NFC") === nfcWord) {
        return w;
      }
    }

    // 2. Diacritic-stripped fallback (e.g. searching "musa" matches "Mūsa")
    for (const w of allWords) {
      const val = (w.dataset.word || w.textContent || "").trim().toLowerCase();
      if (removeMacrons(val) === strippedWord) {
        return w;
      }
    }

    return undefined;
  }

  private resetDictScroll() {
    for (const sel of [
      ".reader-dict-panel",
      ".reader-panel-notes",
      ".reader-panel-about",
    ]) {
      const el = this.querySelector<HTMLElement>(sel);
      if (typeof el?.scrollTo === "function") {
        el.scrollTo({ top: 0, behavior: "instant" });
      } else if (el) {
        el.scrollTop = 0;
      }
    }
  }

  // --- Embedded Dictionary "Jump to top" Button ---
  private initBackToTop() {
    // 1. Guard against duplicate elements
    if (this.querySelector(".reader-dict-back-to-top")) return;

    const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
    if (!dictPanel) return;

    // 2. Create button dynamically (ensures 0 elements in No-JS)
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reader-dict-back-to-top";
    btn.setAttribute("aria-label", "Scroll dictionary to top");
    btn.title = "Jump to top";
    dictPanel.appendChild(btn);
    setHtml(
      btn,
      html`<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="${ICON_PATHS.chevronUp}"></path>
      </svg>`
    );

    const getScroller = () => {
      if (window.innerWidth > 640) {
        return dictPanel;
      }
      return this.querySelector<HTMLElement>(".reader-dict-sticky");
    };

    let ticking = false;
    const updateVisibility = () => {
      const scroller = getScroller();
      const shouldShow = (scroller?.scrollTop ?? 0) > 300;
      btn.classList.toggle("visible", shouldShow);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        this.scope.rAF(updateVisibility);
        ticking = true;
      }
    };

    // Listen on both possible scroll containers
    const mobileSticky = this.querySelector<HTMLElement>(".reader-dict-sticky");
    this.scope.listen(dictPanel, "scroll", onScroll, { passive: true });
    this.scope.listen(mobileSticky, "scroll", onScroll, { passive: true });

    // Click handler: Instant scroll straight to top (no smooth animation)
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      const scroller = getScroller();
      if (!scroller) return;

      if (window.innerWidth > 640) {
        scroller.scrollTo({ top: 0, behavior: "instant" });
      } else {
        const contentEl = this.querySelector<HTMLElement>(
          ".reader-dict-content"
        );
        const targetTop = contentEl ? contentEl.offsetTop : 0;
        scroller.scrollTo({ top: targetTop, behavior: "instant" });
      }
      btn.classList.remove("visible");
    };

    this.scope.listen(btn, "click", onClick);

    this.scope.use(() => {
      btn.remove();
    });
  }

  // --- Reader Preferences & Canvas Styling ---
  private applyMacra(show: boolean) {
    if (this.dataset.hasMacra === "false") return;
    const words = this.scope.$$<HTMLElement>(".reader-passage .lat-word");
    for (const w of words) {
      if (!w.hasAttribute("data-original-text")) {
        w.setAttribute("data-original-text", w.textContent || "");
      }
      const orig = w.getAttribute("data-original-text") || "";
      w.textContent = show ? orig : removeMacrons(orig);
    }
  }

  private applyDictScale(scalePercent: number) {
    const scale = (scalePercent / 100).toFixed(2);
    const iframe = this.scope.$<HTMLIFrameElement>("#dict-frame");
    try {
      if (iframe?.contentDocument?.documentElement) {
        iframe.contentDocument.documentElement.style.setProperty(
          "--dict-scale",
          scale
        );
      }
    } catch {
      // Cross-origin fallback
    }
  }

  private applyPreferences(prefs: ReaderPreferences) {
    this.currentPrefs = prefs;
    const scale = (prefs.readerScale / 100).toFixed(2);
    this.style.setProperty("--reader-scale", scale);
    const readerRem = `${((1.25 * prefs.readerScale) / 100).toFixed(3)}rem`;
    this.style.setProperty("--reader-font-size", readerRem);

    this.applyDictScale(prefs.dictScale);

    if (prefs.lineHeight === "compact") {
      this.style.setProperty("--reader-line-height", "1.45");
    } else if (prefs.lineHeight === "relaxed") {
      this.style.setProperty("--reader-line-height", "1.85");
    } else {
      this.style.removeProperty("--reader-line-height");
    }

    const fontVal =
      prefs.fontFamily === "sans" ? "var(--font-sans)" : "var(--font-serif)";
    this.style.setProperty("--reader-font", fontVal);

    this.classList.toggle("hide-gutter", !prefs.showGutter);
    this.applyMacra(prefs.showMacra);
  }

  // --- Keyboard Shortcuts ([ Prev, ] Next, T TOC, N Notes, I About, A Appearance) ---
  private initKeyboardShortcuts() {
    this.scope.listen(window, "keydown", (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement) {
        if (e.target.isContentEditable) return;
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
      }

      if (e.key === "[") {
        const prevBtn = this.scope.$<HTMLAnchorElement>("#pager-prev");
        if (prevBtn && !prevBtn.classList.contains("disabled")) {
          e.preventDefault();
          prevBtn.click();
        }
      } else if (e.key === "]") {
        const nextBtn = this.scope.$<HTMLAnchorElement>("#pager-next");
        if (nextBtn && !nextBtn.classList.contains("disabled")) {
          e.preventDefault();
          nextBtn.click();
        }
      } else if (e.key === "t" || e.key === "T") {
        if (this.tocController) {
          e.preventDefault();
          this.tocController.toggle();
        } else {
          const tocDrawer = this.scope.$<HTMLElement>("#reader-toc-drawer");
          if (tocDrawer) {
            e.preventDefault();
            if (tocDrawer.hasAttribute("hidden")) {
              this.scope.$<HTMLButtonElement>("#reader-toc-btn")?.click();
            } else {
              this.scope.$<HTMLButtonElement>("#reader-toc-close-btn")?.click();
            }
          }
        }
      } else if (e.key === "n" || e.key === "N") {
        if (this.panelController?.hasNotes) {
          e.preventDefault();
          const current = this.panelController.activeTab;
          const nextTab = current === "notes" ? "dict" : "notes";
          this.activatePanelTab(nextTab);
        }
      } else if (e.key === "i" || e.key === "I") {
        if (this.panelController?.hasAbout) {
          e.preventDefault();
          const current = this.panelController.activeTab;
          const nextTab = current === "about" ? "dict" : "about";
          this.activatePanelTab(nextTab);
        }
      } else if (e.key === "a" || e.key === "A") {
        const settings = this.getSettingsElement();
        if (settings) {
          e.preventDefault();
          settings.toggle();
        } else {
          const btn = this.scope.$<HTMLButtonElement>("#reader-settings-btn");
          if (btn) {
            e.preventDefault();
            btn.click();
          }
        }
      }
    });
  }

  // --- In-Place Page Swapping & Partial Navigation ---

  private scrollToHash(hash: string): void {
    if (!hash) return;
    const targetId = hash.replace(/^#/, "");
    if (!targetId) return;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      if (typeof targetEl.scrollIntoView === "function") {
        targetEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }
      if (targetId.startsWith("sec-")) {
        targetEl.classList.add("target-highlight");
        this.scope.timeout(
          () => targetEl.classList.remove("target-highlight"),
          3000
        );
      }
    }
  }

  public get currentPageUrl(): string {
    const author = this.getAttribute("data-author");
    const name = this.getAttribute("data-name");
    const page = this.dataset.page || this.getAttribute("data-page");
    if (author && name && page) {
      return `/v2/reader/${author}/${name}/${page}`;
    }
    return typeof window !== "undefined" && window.location
      ? window.location.pathname.replace(/\/$/, "")
      : "";
  }

  private getTranslationKey(pageUrl: string): string {
    try {
      const origin =
        typeof window !== "undefined" && window.location
          ? window.location.origin
          : "http://localhost";
      const u = new URL(pageUrl, origin);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 4 && parts[0] === "v2" && parts[1] === "reader") {
        const author = parts[2];
        const name = parts[3];
        const pageId = parts.slice(4).join(".") || this.dataset.page || "1";
        return `${author}/${name}/${pageId}`;
      }
      return u.pathname;
    } catch {
      return pageUrl.split("?")[0].split("#")[0].replace(/\/$/, "");
    }
  }

  public async fetchTranslation(
    pageUrl: string,
    signal: AbortSignal
  ): Promise<string | null> {
    if (signal.aborted) {
      return null;
    }
    const key = this.getTranslationKey(pageUrl);
    const cached = this.translationCache.get(key);
    if (cached !== undefined) {
      await Promise.resolve();
      return signal.aborted ? null : cached;
    }

    try {
      let cleanUrl = pageUrl.split("?")[0].split("#")[0].replace(/\/$/, "");
      const parts = cleanUrl.split("/").filter(Boolean);
      if (parts.length === 3 && parts[0] === "v2" && parts[1] === "reader") {
        cleanUrl = `${cleanUrl}/${this.dataset.page || "1"}`;
      }
      const res = await fetch(`${cleanUrl}/translation`, {
        headers: { "X-Requested-With": "fetch" },
        signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const html = await res.text();
      this.translationCache.set(key, html);
      return signal.aborted ? null : html;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }
      throw err;
    }
  }

  private patchStickyBar(textPanel: HTMLElement, newPageId: string): void {
    if (newPageId) {
      this.dataset.page = newPageId;
    }

    const jumpVal = this.querySelector<HTMLElement>(
      "#reader-toc-btn .jump-val"
    );
    if (jumpVal && newPageId) {
      jumpVal.textContent = newPageId;
    }

    const syncUrlQuery = (rawHref: string): string => {
      if (!rawHref || rawHref === "#") return rawHref;
      try {
        const u = new URL(rawHref, window.location.href);
        if (this.currentQuery) {
          u.searchParams.set("q", this.currentQuery);
        } else {
          u.searchParams.delete("q");
        }
        return u.pathname + u.search + u.hash;
      } catch {
        return rawHref;
      }
    };

    const prevCard = textPanel.querySelector<HTMLAnchorElement>(
      ".reader-continuation-card.prev-card"
    );
    const pagerPrev = this.querySelector<HTMLAnchorElement>("#pager-prev");
    if (pagerPrev) {
      const prevHref = prevCard?.getAttribute("href");
      const prevTitle =
        prevCard
          ?.querySelector<HTMLElement>(".continuation-title")
          ?.textContent?.trim() || "Previous";
      const prevLabelEl = pagerPrev.querySelector<HTMLElement>(".pager-label");
      if (prevLabelEl) {
        prevLabelEl.textContent = prevTitle;
      }
      if (prevHref) {
        const href = syncUrlQuery(prevHref);
        pagerPrev.setAttribute("href", href);
        pagerPrev.classList.remove("disabled");
        pagerPrev.removeAttribute("aria-disabled");
        pagerPrev.removeAttribute("tabindex");
      } else {
        pagerPrev.setAttribute("href", "#");
        pagerPrev.classList.add("disabled");
        pagerPrev.setAttribute("aria-disabled", "true");
        pagerPrev.setAttribute("tabindex", "-1");
      }
    }

    const nextCard = textPanel.querySelector<HTMLAnchorElement>(
      ".reader-continuation-card.next-card"
    );
    const pagerNext = this.querySelector<HTMLAnchorElement>("#pager-next");
    if (pagerNext) {
      const nextHref = nextCard?.getAttribute("href");
      const nextTitle =
        nextCard
          ?.querySelector<HTMLElement>(".continuation-title")
          ?.textContent?.trim() || "Next";
      const nextLabelEl = pagerNext.querySelector<HTMLElement>(".pager-label");
      if (nextLabelEl) {
        nextLabelEl.textContent = nextTitle;
      }
      if (nextHref) {
        const href = syncUrlQuery(nextHref);
        pagerNext.setAttribute("href", href);
        pagerNext.classList.remove("disabled");
        pagerNext.removeAttribute("aria-disabled");
        pagerNext.removeAttribute("tabindex");
      } else {
        pagerNext.setAttribute("href", "#");
        pagerNext.classList.add("disabled");
        pagerNext.setAttribute("aria-disabled", "true");
        pagerNext.setAttribute("tabindex", "-1");
      }
    }
  }

  private patchToc(newPageId: string): void {
    if (!newPageId) return;

    const prevActive = this.querySelectorAll<HTMLElement>(
      ".reader-toc-drawer .reader-toc-item.active, .reader-toc-drawer [aria-current='page']"
    );
    prevActive.forEach((el) => {
      el.classList.remove("active");
      el.removeAttribute("aria-current");
    });

    const target = this.querySelector<HTMLElement>(
      `.reader-toc-drawer .reader-toc-item[data-page-id="${escapeId(
        newPageId
      )}"]`
    );
    if (target) {
      target.classList.add("active");
      target.setAttribute("aria-current", "page");

      let parent = target.parentElement;
      while (parent && !parent.classList.contains("reader-toc-drawer")) {
        if (parent instanceof HTMLDetailsElement) {
          parent.open = true;
        }
        parent = parent.parentElement;
      }
    }
  }

  private refreshTitle(): void {
    const workTag = this.querySelector(".reader-work-tag")?.textContent?.trim();
    const heading = this.querySelector(
      ".reader-passage-heading"
    )?.textContent?.trim();
    if (this.currentQuery) {
      document.title = `${this.currentQuery} - Latin Reader - Morcus Latin Tools`;
    } else if (heading && workTag) {
      document.title = `${workTag}: ${heading} - Latin Reader - Morcus Latin Tools`;
    } else if (workTag) {
      document.title = `${workTag} - Latin Reader - Morcus Latin Tools`;
    }
  }

  private hydratePage(
    options: {
      isPopState?: boolean;
      hash?: string;
    } = {}
  ): void {
    this.saveCurrentSpot();
    this.enhancePassage();
    this.applyPreferences(this.currentPrefs);

    if (this.currentQuery) {
      const el = this.findWordElement(this.currentQuery);
      if (el) el.classList.add("word-active");
    } else {
      this.setActiveWord(null);
      const iframe = this.querySelector<HTMLIFrameElement>("#dict-frame");
      if (iframe && iframe.getAttribute("src") !== "/v2/dicts?embedded=1") {
        iframe.src = "/v2/dicts?embedded=1";
      }
    }

    this.refreshTitle();

    if (options.isPopState) {
      let targetY = 0;
      if (
        typeof window.history.state === "object" &&
        window.history.state !== null &&
        "scrollY" in window.history.state
      ) {
        const val: unknown = Reflect.get(window.history.state, "scrollY");
        if (typeof val === "number") {
          targetY = val;
        }
      }
      window.scrollTo({ top: targetY, left: 0, behavior: "instant" });
    } else if (options.hash) {
      this.scrollToHash(options.hash);
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }

  public async swapPage(
    targetUrl: string,
    options: { push?: boolean; isPopState?: boolean } = {}
  ): Promise<boolean> {
    const textPanel = this.querySelector<HTMLElement>(".reader-text-panel");
    if (!textPanel) {
      window.location.href = targetUrl;
      return false;
    }

    const url = new URL(targetUrl, window.location.href);
    const push = options.push ?? true;
    const isPopState = options.isPopState ?? false;

    if (push && typeof window !== "undefined" && window.history) {
      try {
        const scrollState: Record<string, unknown> = {
          scrollY: window.scrollY,
        };
        if (
          typeof window.history.state === "object" &&
          window.history.state !== null
        ) {
          Object.assign(scrollState, window.history.state);
          scrollState.scrollY = window.scrollY;
        }
        window.history.replaceState(scrollState, "", window.location.href);
      } catch {
        // Ignored
      }
    }

    const isPageTurn = url.pathname !== window.location.pathname;
    if (isPageTurn) {
      this.minimizeDrawer();
    }

    const signal = this.scope.latest("page");
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const isTransActive = this.panelController?.activeTab === "translation";
    let success = false;
    let transHtml: string | null = null;
    let transError = false;

    if (isTransActive) {
      const [passageSuccess, translationResult] = await Promise.all([
        fetchAndSwapPartial(textPanel, url.href, {
          signal,
          loadingOpacity: prefersReducedMotion ? 1 : 0.5,
          errorMessage: "Unable to load passage. Please try refreshing.",
        }),
        this.fetchTranslation(url.pathname, signal).catch((err) => {
          console.error("fetchTranslation failed:", err);
          transError = true;
          return null;
        }),
      ]);
      success = passageSuccess;
      transHtml = translationResult;
    } else {
      success = await fetchAndSwapPartial(textPanel, url.href, {
        signal,
        loadingOpacity: prefersReducedMotion ? 1 : 0.5,
        errorMessage: "Unable to load passage. Please try refreshing.",
      });
    }

    if (!success) {
      return false;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const newPageId = pathParts.slice(4).join(".") || pathParts[4] || "";

    this.currentQuery = url.searchParams.get("q") ?? "";

    if (push) {
      window.history.pushState(
        { q: this.currentQuery, scrollY: 0 },
        "",
        url.pathname + url.search + url.hash
      );
      this.router?.updatePath(url.pathname + url.search);
    } else {
      this.router?.updatePath();
    }

    this.patchStickyBar(textPanel, newPageId);
    this.patchToc(newPageId);
    this.hydratePage({ isPopState, hash: url.hash });

    if (isTransActive) {
      if (transHtml !== null && this.panelController) {
        this.panelController.setTranslationHtml(transHtml);
      } else if (transError && this.panelController) {
        this.panelController.showTranslationError();
      }
    } else {
      this.panelController?.resetTranslation();
    }

    return true;
  }
}

registerElement("morcus-reader-view", MorcusReaderView);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-reader-view": MorcusReaderView;
  }
}
