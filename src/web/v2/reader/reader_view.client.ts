import {
  BaseElement,
  type QueryParamSync,
  DrawerController,
  DRAWER_DEFAULT_DVH,
  DRAWER_EXPANDED_DVH,
  DRAWER_FLOOR_DVH,
  DRAWER_MIN_HEIGHT,
  ICON_PATHS,
  html,
  registerElement,
  setHtml,
  settingsStore,
  setupModalDialog,
  storage,
  tokenizeTargets,
} from "@/web/v2/core/index.client";
import { removeMacrons } from "@/common/text_cleaning";
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
 * */
export class MorcusReaderView extends BaseElement {
  private currentQuery: string = "";
  private preferredDrawerDvh: number = DRAWER_DEFAULT_DVH;
  private drawerController?: DrawerController;
  private tocController: ReaderTocController | null = null;
  private layoutController: ReaderLayoutController | null = null;
  private panelController: ReaderPanelController | null = null;
  private currentNoteId: string = "";
  private currentNoteLabel: string = "";
  private router: QueryParamSync | null = null;
  private currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };

  public getTocController(): ReaderTocController | null {
    return this.tocController;
  }

  public getLayoutController(): ReaderLayoutController | null {
    return this.layoutController;
  }

  public getPanelController(): ReaderPanelController | null {
    return this.panelController;
  }

  public getActiveNoteId(): string {
    return this.currentNoteId;
  }

  public getActiveNoteLabel(): string {
    return this.currentNoteLabel;
  }

  protected override onConnect() {
    this.currentPrefs = readerSettingsStore.get();
    const workId = this.dataset.work;
    if (workId) {
      this.currentPrefs.showMacra = getWorkMacra(workId);
    }
    this.saveCurrentSpot();
    this.enhancePassage();
    this.applyPreferences(this.currentPrefs);

    this.listen<ReaderSettingsChangeEventDetail>(
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
          this.closeDictionary(false);
          return;
        }
        this.lookupWord(q, this.findWordElement(q), false);
      },
      title: (q) =>
        q
          ? `${q} - Latin Reader - Morcus Latin Tools`
          : "Latin Reader - Morcus Latin Tools",
    });

    this.currentQuery = this.router.get();
    if (this.currentQuery) {
      const el = this.findWordElement(this.currentQuery);
      if (el) el.classList.add("word-active");
    }

    this.listen(this, "click", this.handleClick);

    this.layoutController = new ReaderLayoutController({ root: this });
    this.addDisposable(() => {
      this.layoutController?.destroy();
      this.layoutController = null;
    });
    this.initMobileDrawer();
    this.initBackToTop();
    this.tocController = new ReaderTocController({ root: this });
    this.addDisposable(() => {
      this.tocController?.destroy();
      this.tocController = null;
    });
    this.panelController = new ReaderPanelController({
      root: this,
      onTabChange: () => {
        this.activatePanelLayout();
        this.updateSheetLabel(false);
      },
    });
    this.addDisposable(() => {
      this.panelController?.destroy();
      this.panelController = null;
    });
    this.resetDictScroll();
    this.initBiblioModal();
    this.initStickyExpand();
    this.initKeyboardShortcuts();
    this.initIframeThemeSync();

    const iframe = this.querySelector<HTMLIFrameElement>("#dict-frame");
    if (iframe) {
      this.listen(iframe, "load", () => {
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
      try {
        if (iframe.contentDocument?.documentElement) {
          iframe.contentDocument.documentElement.setAttribute(
            "data-theme",
            currentTheme
          );
        }
      } catch {
        // Cross-origin fallback
      }
    };

    this.listen(iframe, "load", syncTheme);
    syncTheme();
  }

  protected override onDisconnect() {
    // cleanup
  }

  private readonly handleClick = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;

    // Handle close button click (collapses sheet/clears word)
    const closeBtn = e.target.closest<HTMLAnchorElement>(
      "a.reader-sheet-close, a.drawer-close"
    );
    if (closeBtn) {
      e.preventDefault();
      this.closeDictionary(true);
      return;
    }

    // Handle open link click (expands drawer from teaser)
    const openLink = e.target.closest<HTMLAnchorElement>(
      "a.reader-sheet-open-link"
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
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(fullUrl).catch(() => {});
      }
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
        setTimeout(() => secEl.classList.remove("target-highlight"), 3000);
      }
      this.saveCurrentSpot(secId);
      this.showToast(`Copied permalink: § ${secId}`);
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
    if (!wordEl) return;

    e.preventDefault();
    const word = wordEl.dataset.word || wordEl.textContent?.trim() || "";
    if (!word) return;

    this.lookupWord(word, wordEl, true);
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

  private updateSheetLabel(showExpandHint: boolean = false): void {
    if (this.panelController?.activeTab === "notes") {
      if (this.currentNoteLabel) {
        this.setSheetNoteLabel(this.currentNoteLabel, showExpandHint);
      } else {
        this.setSheetNotesListLabel(showExpandHint);
      }
    } else if (this.currentQuery) {
      this.setSheetLabel(this.currentQuery, showExpandHint);
    }
  }

  public minimizeDrawer(): void {
    if (this.drawerController) {
      this.drawerController.minimize();
    } else {
      const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
      const sheetBar = this.querySelector<HTMLElement>(".reader-sheet-bar");
      if (dictPanel) {
        dictPanel.classList.add("drawer-minimized");
        dictPanel.style.setProperty("--drawer-height", "54px");
        sheetBar?.setAttribute("aria-valuenow", "0");
      }
      document.documentElement.style.setProperty("--drawer-height", "54px");
      this.updateSheetLabel(true);
    }
  }

  public restoreDrawer(targetDvh?: number): void {
    if (this.drawerController) {
      this.drawerController.restore(targetDvh);
    } else {
      const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
      const sheetBar = this.querySelector<HTMLElement>(".reader-sheet-bar");
      const dvh = Math.min(
        DRAWER_EXPANDED_DVH,
        Math.max(
          DRAWER_FLOOR_DVH,
          targetDvh ?? this.preferredDrawerDvh ?? DRAWER_DEFAULT_DVH
        )
      );
      this.preferredDrawerDvh = dvh;

      if (dictPanel) {
        dictPanel.classList.remove("drawer-minimized");
        dictPanel.style.setProperty("--drawer-height", `${dvh}dvh`);
        sheetBar?.setAttribute("aria-valuenow", String(dvh));
      }
      document.documentElement.style.setProperty(
        "--drawer-height",
        `${dvh}dvh`
      );
      this.updateSheetLabel(false);
      this.resetDictScroll();
    }
  }

  public activatePanelLayout(): void {
    if (this.layoutController) {
      this.layoutController.setActive(true);
    } else {
      const splitLayout = this.querySelector<HTMLElement>(
        ".reader-split-layout"
      );
      if (splitLayout) {
        splitLayout.classList.remove("reader-layout-empty");
        splitLayout.classList.add("reader-layout-active");
      }
    }
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

    // Update mobile teaser label
    this.setSheetNoteLabel(label);

    // Mobile scroll guard: Ensure tapped marker is not occluded by the newly opened/restored drawer
    if (window.innerWidth <= 640) {
      requestAnimationFrame(() => {
        const rect = markerEl.getBoundingClientRect();
        const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
        const drawerTop =
          dictPanel?.getBoundingClientRect().top ??
          window.innerHeight *
            (1 - (this.preferredDrawerDvh ?? DRAWER_DEFAULT_DVH) / 100);
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

  private setActiveMarker(el?: HTMLElement | null): void {
    const active = this.querySelectorAll<HTMLElement>(
      ".reader-text-panel a.reader-note-ref.marker-active"
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
    const splitLayout =
      this.layoutController?.splitLayout ??
      this.querySelector<HTMLElement>(".reader-split-layout");
    if (this.layoutController) {
      this.layoutController.setActive(false);
    } else if (splitLayout) {
      splitLayout.classList.remove("reader-layout-active");
      splitLayout.classList.add("reader-layout-empty");
    }

    // Reset drawer height and ARIA on mobile
    const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
    const sheetBar = this.querySelector<HTMLElement>(".reader-sheet-bar");
    if (dictPanel) {
      dictPanel.classList.remove("drawer-minimized");
      dictPanel.style.removeProperty("--drawer-height");
      sheetBar?.setAttribute("aria-valuenow", "54");
    }
    splitLayout?.style.removeProperty("--drawer-height");

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
    if (this.layoutController) {
      this.layoutController.setActive(true);
    } else {
      const splitLayout = this.querySelector<HTMLElement>(
        ".reader-split-layout"
      );
      if (splitLayout) {
        splitLayout.classList.remove("reader-layout-empty");
        splitLayout.classList.add("reader-layout-active");
      }
    }

    // Ensure drawer is open and restored to preferred dvh
    this.restoreDrawer();

    // Mobile scroll guard: Ensure tapped word is not occluded by the newly opened/restored drawer
    if (window.innerWidth <= 640) {
      const targetEl = activeAnchor || this.findWordElement(word);
      if (targetEl) {
        requestAnimationFrame(() => {
          const rect = targetEl.getBoundingClientRect();
          const drawerTop =
            dictPanel?.getBoundingClientRect().top ??
            window.innerHeight *
              (1 - (this.preferredDrawerDvh ?? DRAWER_DEFAULT_DVH) / 100);
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

    // Update mobile teaser bar label
    this.setSheetLabel(word);

    // Synchronize browser history and page title
    if (updateHistory) {
      this.router?.push(word);
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
          ".reader-section:not(.section-parallel) p.reader-paragraph, " +
          ".reader-section:not(.section-parallel) .reader-line, " +
          ".passage-latin p.reader-paragraph, " +
          ".passage-latin .reader-line",
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

    // Outside the guard: `BaseElement` disposes this on disconnect, and the
    // marker above would otherwise stop it ever being registered again.
    this.listen(passage, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        if (
          e.target instanceof HTMLElement &&
          e.target.classList.contains("lat-word")
        ) {
          e.preventDefault();
          const word =
            e.target.dataset.word || e.target.textContent?.trim() || "";
          if (word) {
            this.lookupWord(word, e.target, true);
          }
        } else if (
          e.target instanceof HTMLElement &&
          e.target.closest("a.reader-note-ref")
        ) {
          const noteRef =
            e.target.closest<HTMLAnchorElement>("a.reader-note-ref");
          if (noteRef) {
            e.preventDefault();
            const href = noteRef.getAttribute("href") || "";
            const bodyId = href.replace(/^#/, "");
            if (bodyId && this.panelController) {
              this.openNote(bodyId, noteRef, { focus: true });
            }
          }
        }
      }
    });
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
    const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
    if (typeof dictPanel?.scrollTo === "function") {
      dictPanel.scrollTo({ top: 0, behavior: "instant" });
    } else if (dictPanel) {
      dictPanel.scrollTop = 0;
    }
    const notesView = this.querySelector<HTMLElement>(".reader-panel-notes");
    if (typeof notesView?.scrollTo === "function") {
      notesView.scrollTo({ top: 0, behavior: "instant" });
    } else if (notesView) {
      notesView.scrollTop = 0;
    }
  }

  // --- Mobile Bottom Drawer Resizer ---
  private initMobileDrawer() {
    const sheetBar = this.querySelector<HTMLElement>(".reader-sheet-bar");
    const dictPanel = this.querySelector<HTMLElement>(".reader-dict-panel");
    if (!sheetBar || !dictPanel) return;

    this.drawerController = new DrawerController({
      drawer: dictPanel,
      handle: sheetBar,
      layoutElement: document.documentElement,
      minHeight: DRAWER_MIN_HEIGHT,
      defaultDvh: DRAWER_DEFAULT_DVH,
      floorDvh: DRAWER_FLOOR_DVH,
      expandedDvh: DRAWER_EXPANDED_DVH,
      preferredDvh: this.preferredDrawerDvh,
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
      onMinimize: () => {
        this.updateSheetLabel(true);
        this.resetDictScroll();
      },
      onRestore: (dvh) => {
        this.preferredDrawerDvh = dvh;
        this.updateSheetLabel(false);
        this.resetDictScroll();
      },
      onEscape: () => {
        this.dismissDictionary(true);
      },
    });

    this.addDisposable(() => {
      this.drawerController?.destroy();
      this.drawerController = undefined;
    });
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
    setHtml(
      btn,
      html`<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="${ICON_PATHS.chevronUp}"></path>
      </svg>`
    );

    dictPanel.appendChild(btn);

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
        window.requestAnimationFrame(updateVisibility);
        ticking = true;
      }
    };

    // Listen on both possible scroll containers
    const mobileSticky = this.querySelector<HTMLElement>(".reader-dict-sticky");
    dictPanel.addEventListener("scroll", onScroll, { passive: true });
    mobileSticky?.addEventListener("scroll", onScroll, { passive: true });

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

    btn.addEventListener("click", onClick);

    this.addDisposable(() => {
      dictPanel.removeEventListener("scroll", onScroll);
      mobileSticky?.removeEventListener("scroll", onScroll);
      btn.removeEventListener("click", onClick);
      btn.remove();
    });
  }

  // --- Reader Confirmation Toast ---
  private showToast(msg: string) {
    const toast = this.$<HTMLElement>("#reader-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("visible");
    setTimeout(() => {
      toast.classList.remove("visible");
    }, 2200);
  }

  // --- Bibliographical Metadata Modal Dialog ---
  private initBiblioModal() {
    const dialog = this.$<HTMLDialogElement>("#reader-biblio-dialog");
    const infoBtn = this.$<HTMLButtonElement>("#reader-info-btn");
    if (!dialog) return;

    this.addDisposable(
      setupModalDialog(dialog, {
        trigger: infoBtn,
      })
    );
  }

  // --- Reader Preferences & Canvas Styling ---
  private applyMacra(show: boolean) {
    if (this.dataset.hasMacra === "false") return;
    const words = this.$$<HTMLElement>(".reader-passage .lat-word");
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
    const iframe = this.$<HTMLIFrameElement>("#dict-frame");
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
    const readerRem = `${((1.25 * prefs.readerScale) / 100).toFixed(3)}rem`;
    this.style.setProperty("--reader-font-size", readerRem);
    this.applyDictScale(prefs.dictScale);

    const lhVal =
      prefs.lineHeight === "compact"
        ? "1.6"
        : prefs.lineHeight === "relaxed"
        ? "2.3"
        : "1.95";
    this.style.setProperty("--reader-line-height", lhVal);

    const fontVal =
      prefs.fontFamily === "sans" ? "var(--font-sans)" : "var(--font-serif)";
    this.style.setProperty("--reader-font", fontVal);

    this.classList.toggle("hide-gutter", !prefs.showGutter);
    this.applyMacra(prefs.showMacra);
  }

  // --- Keyboard Shortcuts ([ Prev, ] Next, T TOC) ---
  private initKeyboardShortcuts() {
    this.listen(window, "keydown", (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
      }

      if (e.key === "[") {
        const prevBtn = this.$<HTMLAnchorElement>("#pager-prev");
        if (prevBtn && !prevBtn.classList.contains("disabled")) {
          e.preventDefault();
          prevBtn.click();
        }
      } else if (e.key === "]") {
        const nextBtn = this.$<HTMLAnchorElement>("#pager-next");
        if (nextBtn && !nextBtn.classList.contains("disabled")) {
          e.preventDefault();
          nextBtn.click();
        }
      } else if (e.key === "t" || e.key === "T") {
        if (this.tocController) {
          e.preventDefault();
          this.tocController.toggle();
        } else {
          const tocDrawer = this.$<HTMLElement>("#reader-toc-drawer");
          if (tocDrawer) {
            e.preventDefault();
            if (tocDrawer.hasAttribute("hidden")) {
              this.$<HTMLButtonElement>("#reader-toc-btn")?.click();
            } else {
              this.$<HTMLButtonElement>("#reader-toc-close-btn")?.click();
            }
          }
        }
      } else if (e.key === "m" || e.key === "M") {
        const expandBtn = this.$<HTMLButtonElement>("#sticky-expand-btn");
        if (expandBtn) {
          e.preventDefault();
          expandBtn.click();
        }
      } else if (e.key === "n" || e.key === "N") {
        if (this.panelController?.hasNotes) {
          e.preventDefault();
          const current = this.panelController.activeTab;
          const nextTab = current === "notes" ? "dict" : "notes";
          this.activatePanelTab(nextTab);
        }
      }
    });
  }

  // --- Sticky Navigation Bar Expand / Collapse ---
  private initStickyExpand() {
    const expandBtn = this.$<HTMLButtonElement>("#sticky-expand-btn");
    const expandedRow = this.$<HTMLElement>("#sticky-expanded-row");
    if (!expandBtn || !expandedRow) return;

    const setExpanded = (expanded: boolean) => {
      expandBtn.setAttribute("aria-expanded", String(expanded));
      expandedRow.hidden = !expanded;
      storage.setBoolean("morcus_sticky_expanded", expanded);
    };

    // Restore preference if saved
    if (storage.getBoolean("morcus_sticky_expanded", false)) {
      setExpanded(true);
    }

    this.listen(expandBtn, "click", () => {
      const isExpanded = expandBtn.getAttribute("aria-expanded") === "true";
      setExpanded(!isExpanded);
    });
  }
}

registerElement("morcus-reader-view", MorcusReaderView);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-reader-view": MorcusReaderView;
  }
}
