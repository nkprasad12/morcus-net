import {
  BaseElement,
  type QueryParamSync,
  DrawerController,
  DRAWER_DEFAULT_SVH,
  DRAWER_EXPANDED_SVH,
  DRAWER_FLOOR_SVH,
  bindBackToTop,
  closeActiveSectionUI,
  copyText,
  escapeId,
  isPlainLeftClick,
  measureSvh100,
  openSectionActionMenu,
  registerElement,
  setHtml,
  setPrepaint,
  settingsStore,
  showToast,
  swapSlots,
  syncIframeTheme,
  syncWordGroupHover,
  tokenizeTargets,
  WakeLockController,
  registerRevealer,
  wordGroupParts,
  queryUpgraded,
} from "@/web/v2/core/index.client";
import type { SafeHtml } from "@/web/v2/core/html.common";
import { removeMacrons } from "@/common/text_cleaning";
import { READER_PAGE_SLOTS } from "@/web/v2/reader/reader_slots.common";
import {
  DEFAULT_READER_PREFS,
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
  ReaderPageNavController,
  type PageDir,
} from "@/web/v2/reader/reader_page_nav.client";
import {
  ReaderPanelController,
  type PanelTab,
} from "@/web/v2/reader/reader_panel.client";
import {
  ReaderLayoutController,
  type ReaderLayoutElements,
  type ReaderLayoutOptions,
  MIN_SPLIT_WIDTH,
  SPLIT_CHROME_WIDTH,
  MIN_TEXT_PANEL_WIDTH,
  DEFAULT_SPLIT_WIDTH,
  READER_DICT_WIDTH_STORAGE_KEY,
  computeMaxSplitWidth,
} from "@/web/v2/reader/reader_layout.client";
import {
  isWordIndexHighlighted,
  parseTextHighlights,
} from "@/web/v2/reader/reader_highlight.common";

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
  SPLIT_CHROME_WIDTH,
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
  /**
   * Full navigation, used when an in-place page turn can't be done. Replaceable
   * in tests, where jsdom can't navigate.
   */
  public navigate: (url: string, opts: { replace: boolean }) => void = (
    url,
    { replace }
  ) => {
    if (replace) {
      window.location.replace(url);
    } else {
      window.location.assign(url);
    }
  };
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
  /** Keeps the screen awake while reading; released on idle or disconnect. */
  private readonly wakeLock = this.addController(
    new WakeLockController({ root: this })
  );
  private currentNoteId: string = "";
  private router: QueryParamSync | null = null;
  private currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };
  private readonly translationCache = new Map<string, string>();

  constructor() {
    super();
    // Swipe page turns on touch devices. Self-contained after connect, so no
    // reference is kept.
    this.addController(
      new ReaderPageNavController({
        root: this,
        canTurn: (dir) => this.pagerLink(dir) !== null,
        turn: (dir) => this.turnPage(dir),
      })
    );
  }

  public getLayoutController(): ReaderLayoutController | null {
    return this.layoutController.isConnected ? this.layoutController : null;
  }

  public getPanelController(): ReaderPanelController | null {
    return this.panelController.isConnected ? this.panelController : null;
  }

  public getSettingsElement() {
    return queryUpgraded(this, "morcus-reader-settings");
  }

  public getActiveNoteId(): string {
    return this.currentNoteId;
  }

  protected override onConnect() {
    if (typeof window !== "undefined" && window.history) {
      const original = window.history.scrollRestoration;
      try {
        // The reader restores scroll itself on page swaps and popstate
        // (hydratePage)
        window.history.scrollRestoration = "manual";
      } catch {
        // Ignored in test environments
      }
      // Through the scope, not onDisconnect: this also restores it as soon
      // as onConnect throws below, while the page falls back to No-JS.
      this.scope.use(() => {
        try {
          window.history.scrollRestoration = original;
        } catch {
          // Ignored
        }
      });
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
    // PH10: without a hash, the page loads at the top, so a non-zero scroll
    // means the reader scrolled before upgrade; leave them there. With a hash,
    // the browser's own anchor jump moved the page, so centring still applies.
    if (window.location.hash || window.scrollY === 0) {
      this.scrollToFirstMatch(window.location.hash);
    }
    this.scope.use(closeActiveSectionUI);

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
      if (el) this.setActiveWord(el);
    }

    this.scope.listen(this, "click", this.handleClick);
    this.scope.listen(this, "keydown", this.handlePassageKeydown);
    // A word split across inline markup is several `.lat-word` parts; hover
    // styles all of them, not just the one under the pointer.
    this.scope.listen(this, "pointerover", syncWordGroupHover);
    this.scope.listen(this, "pointerout", syncWordGroupHover);

    // PH7: the mobile sheet's open link is `<a href="#reader-dict">`, so
    // before upgrade the sheet expands via `:target`. Adopt that on connect
    // (and on later hash navigation) so the drawer's state agrees.
    const dictPanel = this.querySelector<HTMLElement>("#reader-dict");
    if (dictPanel) {
      this.scope.use(
        registerRevealer(dictPanel, () => this.restoreDrawer(), {
          ownsHash: true,
        })
      );
    }

    this.initBackToTop();
    this.resetDictScroll();
    this.initKeyboardShortcuts();
    this.initIframeThemeSync();

    const iframe = this.querySelector<HTMLIFrameElement>("#dict-frame");
    if (iframe) {
      this.scope.listen(iframe, "load", () => {
        this.applyDictScale(this.currentPrefs.dictScale);
        // Searches inside the dictionary iframe are activity too, but its
        // events never reach this document's listeners.
        this.wakeLock.extend();
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
      const explicitAttr = document.documentElement.getAttribute("data-theme");
      const savedDark = settingsStore.get().darkMode;
      const currentTheme =
        explicitAttr ||
        (typeof savedDark === "boolean"
          ? savedDark
            ? "dark"
            : "light"
          : null);
      syncIframeTheme(iframe, currentTheme);
    };

    this.scope.listen(iframe, "load", syncTheme);
    syncTheme();
  }

  private readonly handleClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;

    // Handle close button click (dismisses mobile drawer & clears word)
    const closeBtn = e.target.closest<HTMLAnchorElement>(
      "a.reader-sheet-close, a.drawer-close"
    );
    if (closeBtn) {
      // Its drawer close link closes the drawer in place
      e.preventDefault();
      this.closeDictionary(true);
      return;
    }

    // Handle open link or floating restore FAB click (expands drawer)
    const openLink = e.target.closest<HTMLAnchorElement>(
      "a.reader-sheet-open-link, a.reader-drawer-fab"
    );
    if (openLink) {
      // Its drawer open link / FAB restores the drawer in place
      e.preventDefault();
      this.restoreDrawer();
      return;
    }

    // Handle section anchor click (opens section action menu in library reader,
    // or copies canonical permalink directly on External Reader where data-work is absent)
    const secAnchor = e.target.closest<HTMLAnchorElement>("a.section-anchor");
    if (secAnchor) {
      // Its section anchors open the action menu / copy the permalink instead
      // of jumping
      e.preventDefault();
      const href = secAnchor.getAttribute("href") || "";
      const secId = href.replace(/^#sec-/, "");
      const fullUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#sec-${secId}`;
      const secEl =
        document.getElementById(`sec-${secId}`) ??
        secAnchor.closest<HTMLElement>(".reader-section");
      const copyPermalink = () => {
        void copyText(fullUrl);
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
      };

      if (!this.dataset.work) {
        copyPermalink();
        return;
      }

      openSectionActionMenu({
        anchor: secAnchor,
        sectionId: secId,
        label: `§ ${secId}`,
        reportUrl: fullUrl,
        onCopy: copyPermalink,
        getContentNodes: () => {
          const target =
            secEl?.querySelector<HTMLElement>(".reader-passage") ??
            secAnchor.nextElementSibling;
          return target ? [target] : [];
        },
      });
      return;
    }

    // Handle in-text note marker click (reveals critical apparatus in notes panel)
    const noteRef = e.target.closest<HTMLAnchorElement>("a.reader-note-ref");
    if (noteRef) {
      // Its note markers open the note in its panel
      e.preventDefault();
      const href = noteRef.getAttribute("href") || "";
      const bodyId = href.replace(/^#/, "");
      if (bodyId && this.panelController) {
        this.openNote(bodyId, noteRef);
      }
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
        // Its note backlinks scroll to and flash the marker
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
      // Its words look up the word instead of following links
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
      // Disabled links in its subtree stay inert
      e.preventDefault();
      return;
    }

    const rawHref = link.getAttribute("href");
    if (!rawHref || rawHref === "#" || rawHref.startsWith("javascript:")) {
      return;
    }

    if (rawHref.startsWith("#")) {
      if (rawHref.startsWith("#sec-")) {
        // scrollToHash scrolls to and highlights its own sections
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

    this.withCurrentQuery(targetUrl);

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
        // scrollToHash replaces the same-page jump; closes its TOC
        e.preventDefault();
        this.scrollToHash(targetUrl.hash);
        if (this.tocController?.isOpen()) {
          this.tocController.close();
        }
        return;
      }
      if (this.tocController?.isOpen()) {
        // A same-page link only closes its open TOC
        e.preventDefault();
        this.tocController.close();
        return;
      }
      return;
    }

    // swapPage replaces navigation within this work
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
      // Enter/Space on its words looks the word up
      e.preventDefault();
      const word = e.target.dataset.word || e.target.textContent?.trim() || "";
      if (word) {
        this.lookupWord(word, e.target, true);
      }
    } else {
      const noteRef = e.target.closest<HTMLAnchorElement>("a.reader-note-ref");
      if (noteRef) {
        // Enter/Space on its note markers opens the note
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
          // Enter/Space on its note backlinks jumps to the marker
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

  /**
   * Only the dictionary needs a label: with any companion tab (Notes,
   * Translation, About) the panel has `.has-companion-tabs`, which hides the
   * label at every width (reader_panel.css), and the tab chips stand in for
   * it. Every library work has an About tab, so in practice this label shows
   * only in the External Reader.
   */
  private updateSheetLabel(showExpandHint: boolean = false): void {
    if (this.panelController?.activeTab === "dict" && this.currentQuery) {
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
      // Clears its own #reader-dict-dismissed hash
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

    // Clear active word highlight if any
    this.setActiveWord(null);

    // Highlight marker in passage
    this.setActiveMarker(markerEl);

    // Show note in companion panel
    this.panelController?.showNote(bodyId, opts);

    // Ensure layout is active
    this.activatePanelLayout();

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
   * The `.reader-text-panel` scope is load-bearing: clearing passage highlights
   * must not reach outside into other panels (such as dictionary entries).
   *
   * A word split across inline markup is several parts (`wordGroupParts`),
   * all of which are highlighted.
   */
  private setActiveWord(el?: HTMLElement | null) {
    const active = this.querySelectorAll<HTMLElement>(
      ".reader-text-panel .word-active"
    );
    active.forEach((word) => word.classList.remove("word-active"));
    if (el) {
      for (const part of wordGroupParts(el)) {
        part.classList.add("word-active");
      }
    }
  }

  private dismissDictionary(updateHistory: boolean = true) {
    this.currentQuery = "";
    this.currentNoteId = "";

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

  /**
   * Replaces the passage with markup rendered on the client (e.g. a text
   * stored on this device) and enhances it exactly like a server-rendered
   * passage. The markup must use the library's section shape.
   */
  public adoptPassage(passageHtml: SafeHtml): void {
    const passage = this.querySelector<HTMLElement>("#reader-passage");
    if (!passage) return;
    setHtml(passage, passageHtml);
    delete passage.dataset.enhanced;
    this.enhancePassage();
    this.applyPreferences(this.currentPrefs);
    if (this.currentQuery) {
      this.setActiveWord(this.findWordElement(this.currentQuery));
    }
    this.refreshTitle();
    const hash = window.location.hash;
    if (!this.scrollToFirstMatch(hash) && hash) {
      this.scrollToHash(hash);
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

      const matchText =
        typeof window !== "undefined" && window.location
          ? new URLSearchParams(window.location.search).get("matchText") ??
            undefined
          : undefined;
      const highlights = parseTextHighlights(matchText);

      tokenizeTargets(passage, {
        targetSelector: "[data-tokenize-target='true']",
        fallbackSelector:
          ".reader-section p.reader-paragraph, " +
          ".reader-section .reader-line",
        enhancedDatasetKey: "wordsEnhanced",
        // Word boundaries must match the corpus's, which `matchText` offsets
        // come from (`extractRowText`, rule 1).
        joinAcrossInline: true,
        renderWord: (token, _cleanWord, wordIndex, targetRoot, part) => {
          const secEl = targetRoot.closest<HTMLElement>(".reader-section");
          const secId = secEl?.id.startsWith("sec-")
            ? secEl.id.slice(4)
            : undefined;
          const isMatch =
            secId !== undefined &&
            isWordIndexHighlighted(wordIndex, highlights?.get(secId));

          const span = document.createElement("span");
          span.className = isMatch ? "lat-word reader-match" : "lat-word";
          // A word split across inline markup (`<i>im</i>petu`) is one
          // control: its first part is the button, labelled with the whole
          // word, and the rest are hidden from assistive tech so the word is
          // not read twice. Every part looks up the whole word on click.
          if (part === undefined || part.index === 0) {
            span.setAttribute("role", "button");
            span.setAttribute("tabindex", "0");
          }
          if (part !== undefined) {
            if (part.index === 0) {
              span.setAttribute("aria-label", part.word);
            } else {
              span.setAttribute("aria-hidden", "true");
            }
          }
          span.setAttribute("data-word", part?.word ?? token);
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
    const btn = this.querySelector<HTMLButtonElement>(
      ".reader-dict-back-to-top"
    );
    const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
    if (!btn || !dictPanel) return;

    this.scope.use(bindBackToTop(btn, { container: dictPanel }));
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

  /**
   * Layout-affecting preferences live on <html>, recorded with `setPrepaint`
   * so the critical script applies them before first paint on the next load.
   * Called on every connect, which also heals a stale snapshot. Defaults are
   * removed, leaving the `var(--reader-*, default)` fallbacks in the CSS.
   */
  private applyPreferences(prefs: ReaderPreferences) {
    this.currentPrefs = prefs;
    setPrepaint("--reader-scale", (prefs.readerScale / 100).toFixed(2));

    this.applyDictScale(prefs.dictScale);

    setPrepaint(
      "--reader-line-height",
      prefs.lineHeight === "compact"
        ? "1.45"
        : prefs.lineHeight === "relaxed"
        ? "1.85"
        : null
    );
    setPrepaint(
      "--reader-font",
      prefs.fontFamily === "sans" ? "var(--font-sans)" : null
    );
    setPrepaint("data-reader-hide-gutter", prefs.showGutter ? null : "");
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

      if (e.key === "[" || e.key === "]") {
        const dir: PageDir = e.key === "[" ? "prev" : "next";
        if (this.pagerLink(dir)) {
          // Global shortcut; turnPage swaps the page itself. Skips modifiers
          // and input/textarea/select/contenteditable targets
          e.preventDefault();
          void this.turnPage(dir);
        }
      } else if (e.key === "t" || e.key === "T") {
        if (this.tocController) {
          // Global shortcut toggles its own TOC controller
          e.preventDefault();
          this.tocController.toggle();
        } else {
          const tocDrawer = this.scope.$<HTMLElement>("#reader-toc-drawer");
          if (tocDrawer) {
            // Global shortcut clicks its own TOC button (controller absent)
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
          // Global shortcut switches its own panel to notes
          e.preventDefault();
          const current = this.panelController.activeTab;
          const nextTab = current === "notes" ? "dict" : "notes";
          this.activatePanelTab(nextTab);
        }
      } else if (e.key === "i" || e.key === "I") {
        if (this.panelController?.hasAbout) {
          // Global shortcut switches its own panel to about
          e.preventDefault();
          const current = this.panelController.activeTab;
          const nextTab = current === "about" ? "dict" : "about";
          this.activatePanelTab(nextTab);
        }
      } else if (e.key === "a" || e.key === "A") {
        const settings = this.getSettingsElement();
        if (settings) {
          // Global shortcut toggles its settings popover (same chunk)
          e.preventDefault();
          settings.toggle();
        } else {
          const btn = this.scope.$<HTMLButtonElement>("#reader-settings-btn");
          if (btn) {
            // Global shortcut clicks its own settings button
            e.preventDefault();
            btn.click();
          }
        }
      }
    });
  }

  // --- In-Place Page Swapping & Partial Navigation ---

  /** The sticky-bar pager link toward `dir`, or null at that end of the work. */
  private pagerLink(dir: PageDir): HTMLAnchorElement | null {
    const link = this.scope.$<HTMLAnchorElement>(
      dir === "prev" ? "#pager-prev" : "#pager-next"
    );
    return link && !link.classList.contains("disabled") ? link : null;
  }

  /** Carries the active dictionary query (`?q=`) over to `url`. */
  private withCurrentQuery(url: URL): URL {
    if (this.currentQuery) {
      url.searchParams.set("q", this.currentQuery);
    } else {
      url.searchParams.delete("q");
    }
    return url;
  }

  /**
   * Turns to the adjacent page in place (keyboard shortcuts, swipe). Resolves
   * false if there is no page that way or the swap fails.
   */
  private turnPage(dir: PageDir): Promise<boolean> {
    const link = this.pagerLink(dir);
    if (!link) return Promise.resolve(false);
    if (this.tocController?.isOpen()) {
      this.tocController.close();
    }
    const url = this.withCurrentQuery(new URL(link.href, window.location.href));
    return this.swapPage(url.href, { push: true });
  }

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

  /**
   * Centres the first `matchText` word in the viewport. A hash only wins when
   * it points somewhere else: `#sec-<id>` of the match's own section (added by
   * the server's matchText redirect and `?jump=`) still centres on the match.
   */
  private scrollToFirstMatch(hash: string = ""): boolean {
    const firstMatch = this.querySelector<HTMLElement>(
      "#reader-passage .reader-match"
    );
    if (!firstMatch) return false;
    if (hash) {
      const section = firstMatch.closest<HTMLElement>(".reader-section");
      if (!section?.id || hash !== `#${section.id}`) return false;
    }
    if (typeof firstMatch.scrollIntoView === "function") {
      firstMatch.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
    }
    return true;
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
      if (el) this.setActiveWord(el);
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
    } else if (this.scrollToFirstMatch(options.hash)) {
      // Centred on the matchText range.
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
    // Back/forward gestures turn pages without any in-document input event.
    this.wakeLock.extend();
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
        // Saves scrollY into its own history entry for popstate
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
    // The URL is already current on popstate, so a fallback must not push it
    // again.
    const swapOptions = {
      signal,
      slots: READER_PAGE_SLOTS,
      fallback: (u: string) => this.navigate(u, { replace: isPopState }),
    };

    const isTransActive = this.panelController?.activeTab === "translation";
    let success = false;
    let transHtml: string | null = null;
    let transError = false;

    if (isTransActive) {
      const [passageSuccess, translationResult] = await Promise.all([
        swapSlots(this, url.href, swapOptions),
        this.fetchTranslation(url.pathname, signal).catch((err) => {
          console.error("fetchTranslation failed:", err);
          transError = true;
          return null;
        }),
      ]);
      success = passageSuccess;
      transHtml = translationResult;
    } else {
      success = await swapSlots(this, url.href, swapOptions);
    }

    if (!success) {
      return false;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const newPageId = pathParts.slice(4).join(".") || pathParts[4] || "";

    this.currentQuery = url.searchParams.get("q") ?? "";

    if (push) {
      // swapPage pushes the URL of the page it just swapped in
      window.history.pushState(
        { q: this.currentQuery, scrollY: 0 },
        "",
        url.pathname + url.search + url.hash
      );
      this.router?.updatePath(url.pathname + url.search);
    } else {
      this.router?.updatePath();
    }

    if (newPageId) {
      this.dataset.page = newPageId;
    }
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

declare module "@/web/v2/core/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-reader-view": MorcusReaderView;
  }
}
