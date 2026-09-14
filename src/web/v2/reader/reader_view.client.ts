import {
  BaseElement,
  type QueryParamSync,
  DrawerController,
  ICON_PATHS,
  html,
  registerElement,
  setHtml,
  settingsStore,
  setupModalDialog,
  trackPointerDrag,
} from "@/web/v2/core/index.client";
import {
  processTokens,
  removeDiacritics,
  removeMacrons,
} from "@/common/text_cleaning";
import {
  DEFAULT_READER_PREFS,
  parseReaderPreferences,
  type ReaderFontFamily,
  type ReaderLineHeight,
  type ReaderPreferences,
  type ReaderSettingsChangeEventDetail,
  READER_SETTINGS_KEY,
  readerSettingsStore,
} from "@/web/v2/reader/reader_settings.client";
import { ReaderTocController } from "@/web/v2/reader/reader_toc.client";

export {
  type ReaderFontFamily,
  type ReaderLineHeight,
  type ReaderPreferences,
  DEFAULT_READER_PREFS,
  READER_SETTINGS_KEY,
  parseReaderPreferences,
  readerSettingsStore,
  type ReaderSettingsChangeEventDetail,
};

/**
 * Bounds for the desktop dictionary panel, in px. `MIN_TEXT_PANEL_WIDTH` is the
 * slice reserved for the passage, so the dictionary may grow to the container
 * width less that much, capped at `MAX_SPLIT_WIDTH`.
 */
const MIN_SPLIT_WIDTH = 300;
const MAX_SPLIT_WIDTH = 800;
const MIN_TEXT_PANEL_WIDTH = 320;
const DEFAULT_SPLIT_WIDTH = 420;

function computeMaxSplitWidth(containerWidth: number): number {
  return Math.max(
    MIN_SPLIT_WIDTH,
    Math.min(MAX_SPLIT_WIDTH, containerWidth - MIN_TEXT_PANEL_WIDTH)
  );
}

/**
 * Progressively enhanced Reader View with embedded dictionary lookup using Light DOM.
 *
 * Without JS:
 * - Clean semantic HTML prose/verse rendered without word anchor bloat.
 * - Dictionary panel embeds a self-contained iframe (/v2/dicts?embedded=1).
 * - Searching words in the iframe maintains the reader's scroll position 100% stationary.
 *
 * With JS:
 * - Tokenizes text nodes into clickable <span class="v2-lat-word" role="button"> on mount (< 2ms).
 * - Clicking or pressing Enter on a word updates the dictionary iframe src and history state.
 * - Manages mobile bottom sheet expansion and desktop resizable panels.
 * */
export class MorcusReaderView extends BaseElement {
  private currentQuery: string = "";
  private preferredDrawerDvh: number = 48;
  private drawerController?: DrawerController;
  private tocController: ReaderTocController | null = null;
  private router: QueryParamSync | null = null;
  private currentPrefs: ReaderPreferences = { ...DEFAULT_READER_PREFS };

  public getTocController(): ReaderTocController | null {
    return this.tocController;
  }

  protected override onConnect() {
    this.currentPrefs = readerSettingsStore.get();
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
      if (el) el.classList.add("v2-word-active");
    }

    this.listen(this, "click", this.handleClick);

    this.initDesktopSplitter();
    this.initMobileDrawer();
    this.initBackToTop();
    this.tocController = new ReaderTocController({ root: this });
    this.addDisposable(() => {
      this.tocController?.destroy();
      this.tocController = null;
    });
    this.initBiblioModal();
    this.initStickyExpand();
    this.initQuickJump();
    this.initKeyboardShortcuts();
    this.initIframeThemeSync();

    const iframe = this.querySelector<HTMLIFrameElement>("#v2-dict-frame");
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
    const iframe = this.querySelector<HTMLIFrameElement>("#v2-dict-frame");
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
      "a.v2-reader-sheet-close"
    );
    if (closeBtn) {
      e.preventDefault();
      this.closeDictionary(true);
      return;
    }

    // Handle section anchor click (copies canonical permalink with toast confirmation)
    const secAnchor = e.target.closest<HTMLAnchorElement>(
      "a.v2-section-anchor"
    );
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
        secEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        secEl.classList.add("target-highlight");
        setTimeout(() => secEl.classList.remove("target-highlight"), 3000);
      }
      this.showToast(`Copied permalink: § ${secId}`);
      return;
    }

    const wordEl = e.target.closest<HTMLElement>(".v2-lat-word");
    if (!wordEl) return;

    e.preventDefault();
    const word = wordEl.dataset.word || wordEl.textContent?.trim() || "";
    if (!word) return;

    this.lookupWord(word, wordEl, true);
  };

  private closeDictionary(updateHistory: boolean = true) {
    this.dismissDictionary(updateHistory);
  }

  /**
   * Renders the mobile drawer teaser label ("Definitions for <strong>word</strong>").
   *
   * The query originates from user-controlled input (the `?q=` URL parameter and word
   * text content), so it is bound via `textContent` rather than interpolated into an
   * HTML string. The `<strong>` wrapper is load-bearing: `.v2-reader-sheet-label strong`
   * in core/drawer.css supplies its color and weight.
   *
   * Mirrors the server-rendered markup in reader.server.ts.
   */
  private setSheetLabel(query: string, showExpandHint: boolean = false): void {
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
    if (!sheetLabel || !query) return;

    const strong = document.createElement("strong");
    strong.textContent = query;

    const nodes: (Node | string)[] = ["Definitions for ", strong];
    if (showExpandHint) {
      const hint = document.createElement("span");
      hint.style.opacity = "0.8";
      hint.style.fontWeight = "400";
      hint.textContent = "tap to expand";
      nodes.push(" \u00b7 ", hint);
    }

    sheetLabel.replaceChildren(...nodes);
  }

  public minimizeDrawer(): void {
    if (this.drawerController) {
      this.drawerController.minimize();
    } else {
      const dictPanel = this.querySelector<HTMLElement>(
        ".v2-reader-dict-panel"
      );
      const sheetBar = this.querySelector<HTMLElement>(".v2-reader-sheet-bar");
      const splitLayout = this.querySelector<HTMLElement>(
        ".v2-reader-split-layout"
      );
      if (dictPanel) {
        dictPanel.classList.add("v2-drawer-minimized");
        dictPanel.style.setProperty("--v2-drawer-height", "54px");
        sheetBar?.setAttribute("aria-valuenow", "0");
      }
      splitLayout?.style.setProperty("--v2-drawer-height", "54px");
      this.setSheetLabel(this.currentQuery, true);
    }
  }

  public restoreDrawer(targetDvh?: number): void {
    if (this.drawerController) {
      this.drawerController.restore(targetDvh);
    } else {
      const dictPanel = this.querySelector<HTMLElement>(
        ".v2-reader-dict-panel"
      );
      const sheetBar = this.querySelector<HTMLElement>(".v2-reader-sheet-bar");
      const splitLayout = this.querySelector<HTMLElement>(
        ".v2-reader-split-layout"
      );
      const dvh = Math.min(
        88,
        Math.max(18, targetDvh ?? this.preferredDrawerDvh ?? 48)
      );
      this.preferredDrawerDvh = dvh;

      if (dictPanel) {
        dictPanel.classList.remove("v2-drawer-minimized");
        dictPanel.style.setProperty("--v2-drawer-height", `${dvh}dvh`);
        sheetBar?.setAttribute("aria-valuenow", String(dvh));
      }
      splitLayout?.style.setProperty("--v2-drawer-height", `${dvh}dvh`);
      this.setSheetLabel(this.currentQuery);
      this.resetDictScroll();
    }
  }

  /**
   * Makes `el` the only highlighted word in the passage, or clears the highlight
   * entirely when given nothing.
   *
   * Queries the active word rather than every word: the highlight is on at most one
   * element, but a chapter holds thousands, and this runs synchronously in the click
   * handler before the new highlight is painted.
   *
   * The `.v2-reader-text-panel` scope is load-bearing. `linkifyText` also emits
   * `v2-word-active` on dictionary-entry markup, which must not be cleared from here.
   */
  private setActiveWord(el?: HTMLElement | null) {
    const active = this.querySelectorAll<HTMLElement>(
      ".v2-reader-text-panel .v2-word-active"
    );
    active.forEach((word) => word.classList.remove("v2-word-active"));
    el?.classList.add("v2-word-active");
  }

  private dismissDictionary(updateHistory: boolean = true) {
    this.currentQuery = "";

    // Remove active highlights
    this.setActiveWord(null);

    // Reset iframe to default embedded state
    const iframe = this.querySelector<HTMLIFrameElement>("#v2-dict-frame");
    if (iframe) {
      iframe.src = "/v2/dicts?embedded=1";
    }

    // Update split layout class to empty
    const splitLayout = this.querySelector<HTMLElement>(
      ".v2-reader-split-layout"
    );
    if (splitLayout) {
      splitLayout.classList.remove("v2-reader-layout-active");
      splitLayout.classList.add("v2-reader-layout-empty");
    }

    // Reset drawer height and ARIA on mobile
    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
    const sheetBar = this.querySelector<HTMLElement>(".v2-reader-sheet-bar");
    if (dictPanel) {
      dictPanel.classList.remove("v2-drawer-minimized");
      dictPanel.style.removeProperty("--v2-drawer-height");
      sheetBar?.setAttribute("aria-valuenow", "54");
    }
    splitLayout?.style.removeProperty("--v2-drawer-height");

    // Update mobile teaser label
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
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

    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
    if (
      word === this.currentQuery &&
      dictPanel?.classList.contains("v2-drawer-minimized")
    ) {
      this.restoreDrawer();
      return;
    }

    this.currentQuery = word;

    // Update active highlight in the text
    this.setActiveWord(activeAnchor ?? this.findWordElement(word));

    // Update dictionary iframe (filtering by lang=La and forcing inflected search o=1 for Latin text word lookups)
    const iframe = this.querySelector<HTMLIFrameElement>("#v2-dict-frame");
    if (iframe) {
      const targetSrc = `/v2/dicts?q=${encodeURIComponent(
        word
      )}&lang=La&o=1&embedded=1&scale=${this.currentPrefs.dictScale}`;
      if (iframe.getAttribute("src") !== targetSrc) {
        iframe.src = targetSrc;
      }
    }

    // Update split layout class to active (expands mobile sheet)
    const splitLayout = this.querySelector<HTMLElement>(
      ".v2-reader-split-layout"
    );
    if (splitLayout) {
      splitLayout.classList.remove("v2-reader-layout-empty");
      splitLayout.classList.add("v2-reader-layout-active");
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
            window.innerHeight * (1 - (this.preferredDrawerDvh ?? 48) / 100);
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
    const passage = this.querySelector<HTMLElement>("#v2-reader-passage");
    if (!passage) return;

    // Tokenizing rewrites the passage into `.v2-lat-word` spans, so it must
    // happen exactly once. The marker lives in the DOM and therefore survives a
    // disconnect, which is why the listener below cannot be guarded by it.
    if (passage.dataset.enhanced !== "true") {
      passage.dataset.enhanced = "true";

      const targetBlocks = passage.querySelectorAll<HTMLElement>(
        ".v2-reader-section:not(.v2-section-parallel) p.v2-reader-paragraph, " +
          ".v2-reader-section:not(.v2-section-parallel) .v2-reader-line, " +
          ".v2-passage-latin p.v2-reader-paragraph, " +
          ".v2-passage-latin .v2-reader-line"
      );

      for (const block of targetBlocks) {
        this.tokenizeElement(block);
      }
    }

    // Outside the guard: `BaseElement` disposes this on disconnect, and the
    // marker above would otherwise stop it ever being registered again.
    this.listen(passage, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        if (
          e.target instanceof HTMLElement &&
          e.target.classList.contains("v2-lat-word")
        ) {
          e.preventDefault();
          const word =
            e.target.dataset.word || e.target.textContent?.trim() || "";
          if (word) {
            this.lookupWord(word, e.target, true);
          }
        }
      }
    });
  }

  private tokenizeElement(element: HTMLElement) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current: Node | null = walker.nextNode();
    while (current) {
      if (current instanceof Text && current.nodeValue) {
        textNodes.push(current);
      }
      current = walker.nextNode();
    }

    for (const node of textNodes) {
      const text = node.nodeValue || "";
      const fragment = document.createDocumentFragment();

      for (const [token, isWord] of processTokens(text)) {
        const cleanWord = removeDiacritics(token).replaceAll("-", "").trim();
        const isLatinWord =
          isWord &&
          !/\d/.test(token) &&
          /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/.test(cleanWord);

        if (isLatinWord) {
          const span = document.createElement("span");
          span.className = "v2-lat-word";
          span.setAttribute("role", "button");
          span.setAttribute("tabindex", "0");
          span.setAttribute("data-word", token);
          span.textContent = token;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(token));
        }
      }

      node.parentNode?.replaceChild(fragment, node);
    }
  }

  private findWordElement(word: string): HTMLElement | undefined {
    const rawWord = word.trim().toLowerCase();
    const nfcWord = rawWord.normalize("NFC");
    const strippedWord = removeMacrons(rawWord);
    const allWords = this.querySelectorAll<HTMLElement>(
      ".v2-reader-text-panel .v2-lat-word"
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
    if (window.innerWidth > 640) {
      // Desktop: Reset outer dict panel to top
      const dictPanel = this.querySelector<HTMLElement>(
        ".v2-reader-dict-panel"
      );
      if (typeof dictPanel?.scrollTo === "function") {
        dictPanel.scrollTo({ top: 0, behavior: "instant" });
      } else if (dictPanel) {
        dictPanel.scrollTop = 0;
      }
    } else {
      // Mobile: Instant scroll to the semantic content wrapper
      const scrollContainer = this.querySelector<HTMLElement>(
        ".v2-reader-dict-sticky"
      );
      const contentEl = this.querySelector<HTMLElement>(
        ".v2-reader-dict-content"
      );
      if (scrollContainer && contentEl) {
        if (typeof scrollContainer.scrollTo === "function") {
          scrollContainer.scrollTo({
            top: contentEl.offsetTop,
            behavior: "instant",
          });
        } else {
          scrollContainer.scrollTop = contentEl.offsetTop;
        }
      }
    }
  }

  // --- Desktop Panel Resizer ---
  private initDesktopSplitter() {
    const splitter = this.querySelector<HTMLElement>(".v2-reader-splitter");
    const splitLayout = this.querySelector<HTMLElement>(
      ".v2-reader-split-layout"
    );
    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
    if (!splitter || !splitLayout || !dictPanel) return;

    // Restore saved width from localStorage
    try {
      const savedWidth = localStorage.getItem("morcus_v2_reader_dict_width");
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= MIN_SPLIT_WIDTH && parsed <= 900) {
          splitLayout.style.setProperty("--v2-dict-width", `${parsed}px`);
          splitter.setAttribute("aria-valuenow", String(parsed));
        }
      }
    } catch {
      // localStorage may be disabled
    }

    let startWidth = 0;
    let maxWidth = MAX_SPLIT_WIDTH;

    this.addDisposable(
      trackPointerDrag(splitter, {
        handleActiveClass: "v2-is-resizing",
        bodyActiveClass: "v2-resizing-panels",
        /**
         * Both measurements are taken once, here, because `onMove` writes
         * `--v2-dict-width`: reading either one per move would be a
         * read-after-write and would force a synchronous layout of the whole
         * passage on every pointer event.
         *
         * Safe because the container width does not depend on the value being
         * written. At this breakpoint `.v2-reader-split-layout` is a `flex: 1`
         * row whose width comes from its parent, and `--v2-dict-width` only
         * divides space between its children (reader.css). The drag classes
         * applied immediately after this callback are `user-select` / `cursor` /
         * `pointer-events` only, so measuring before them is equivalent.
         */
        onStart: () => {
          startWidth = dictPanel.getBoundingClientRect().width;
          const containerWidth = splitLayout.getBoundingClientRect().width;
          maxWidth = computeMaxSplitWidth(containerWidth);
        },
        onMove: ({ dx }) => {
          const newWidth = Math.round(
            Math.max(MIN_SPLIT_WIDTH, Math.min(maxWidth, startWidth - dx))
          );
          splitLayout.style.setProperty("--v2-dict-width", `${newWidth}px`);
          splitter.setAttribute("aria-valuenow", String(newWidth));
        },
        onEnd: () => {
          const finalWidth = parseInt(
            splitter.getAttribute("aria-valuenow") ||
              String(DEFAULT_SPLIT_WIDTH),
            10
          );
          try {
            localStorage.setItem(
              "morcus_v2_reader_dict_width",
              String(finalWidth)
            );
          } catch {
            // ignore
          }
        },
      })
    );

    const onDblClick = () => {
      splitLayout.style.removeProperty("--v2-dict-width");
      splitter.setAttribute("aria-valuenow", String(DEFAULT_SPLIT_WIDTH));
      try {
        localStorage.removeItem("morcus_v2_reader_dict_width");
      } catch {
        // ignore
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const currentWidth = parseInt(
        splitter.getAttribute("aria-valuenow") || String(DEFAULT_SPLIT_WIDTH),
        10
      );
      const containerWidth = splitLayout.getBoundingClientRect().width;
      const keyMaxWidth = computeMaxSplitWidth(containerWidth);
      let nextWidth: number | null = null;

      if (e.key === "ArrowLeft") {
        nextWidth = Math.min(keyMaxWidth, currentWidth + 24);
      } else if (e.key === "ArrowRight") {
        nextWidth = Math.max(MIN_SPLIT_WIDTH, currentWidth - 24);
      } else if (e.key === "Home") {
        nextWidth = MIN_SPLIT_WIDTH;
      } else if (e.key === "End") {
        nextWidth = keyMaxWidth;
      } else if (e.key === "Enter" || e.key === "Escape") {
        onDblClick();
        return;
      }

      if (nextWidth !== null) {
        e.preventDefault();
        splitLayout.style.setProperty("--v2-dict-width", `${nextWidth}px`);
        splitter.setAttribute("aria-valuenow", String(nextWidth));
        try {
          localStorage.setItem(
            "morcus_v2_reader_dict_width",
            String(nextWidth)
          );
        } catch {
          // ignore
        }
      }
    };

    this.listen(splitter, "dblclick", onDblClick);
    this.listen(splitter, "keydown", onKeyDown);
  }

  // --- Mobile Bottom Drawer Resizer ---
  private initMobileDrawer() {
    const sheetBar = this.querySelector<HTMLElement>(".v2-reader-sheet-bar");
    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
    const splitLayout = this.querySelector<HTMLElement>(
      ".v2-reader-split-layout"
    );
    if (!sheetBar || !dictPanel) return;

    this.drawerController = new DrawerController({
      drawer: dictPanel,
      handle: sheetBar,
      layoutElement: splitLayout,
      minHeight: 54,
      defaultDvh: 48,
      floorDvh: 18,
      expandedDvh: 88,
      preferredDvh: this.preferredDrawerDvh,
      filter: (e) => {
        if (
          e.target instanceof Element &&
          e.target.closest("a.v2-reader-sheet-close, a.v2-drawer-close")
        ) {
          return false;
        }
        return true;
      },
      onMinimize: () => {
        this.setSheetLabel(this.currentQuery, true);
      },
      onRestore: (dvh) => {
        this.preferredDrawerDvh = dvh;
        this.setSheetLabel(this.currentQuery);
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
    if (this.querySelector(".v2-reader-dict-back-to-top")) return;

    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
    if (!dictPanel) return;

    // 2. Create button dynamically (ensures 0 elements in No-JS)
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "v2-reader-dict-back-to-top";
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
      return this.querySelector<HTMLElement>(".v2-reader-dict-sticky");
    };

    let ticking = false;
    const updateVisibility = () => {
      const scroller = getScroller();
      const shouldShow = (scroller?.scrollTop ?? 0) > 300;
      btn.classList.toggle("v2-visible", shouldShow);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateVisibility);
        ticking = true;
      }
    };

    // Listen on both possible scroll containers
    const mobileSticky = this.querySelector<HTMLElement>(
      ".v2-reader-dict-sticky"
    );
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
          ".v2-reader-dict-content"
        );
        const targetTop = contentEl ? contentEl.offsetTop : 0;
        scroller.scrollTo({ top: targetTop, behavior: "instant" });
      }
      btn.classList.remove("v2-visible");
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
    const toast = this.$<HTMLElement>("#v2-reader-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("visible");
    setTimeout(() => {
      toast.classList.remove("visible");
    }, 2200);
  }

  // --- Bibliographical Metadata Modal Dialog ---
  private initBiblioModal() {
    const dialog = this.$<HTMLDialogElement>("#v2-reader-biblio-dialog");
    const infoBtn = this.$<HTMLButtonElement>("#v2-reader-info-btn");
    if (!dialog) return;

    this.addDisposable(
      setupModalDialog(dialog, {
        trigger: infoBtn,
      })
    );
  }

  // --- Reader Preferences & Canvas Styling ---
  private applyMacra(show: boolean) {
    const words = this.$$<HTMLElement>(".v2-reader-passage .v2-lat-word");
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
    const iframe = this.$<HTMLIFrameElement>("#v2-dict-frame");
    try {
      if (iframe?.contentDocument?.documentElement) {
        iframe.contentDocument.documentElement.style.setProperty(
          "--v2-dict-scale",
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
    this.style.setProperty("--v2-reader-font-size", readerRem);
    this.applyDictScale(prefs.dictScale);

    const lhVal =
      prefs.lineHeight === "compact"
        ? "1.6"
        : prefs.lineHeight === "relaxed"
        ? "2.3"
        : "1.95";
    this.style.setProperty("--v2-reader-line-height", lhVal);

    const fontVal =
      prefs.fontFamily === "sans"
        ? "var(--v2-font-sans)"
        : "var(--v2-font-serif)";
    this.style.setProperty("--v2-reader-font", fontVal);

    this.classList.toggle("v2-hide-gutter", !prefs.showGutter);
    this.applyMacra(prefs.showMacra);
  }

  // --- Quick Jump In-Page Smooth Scroll ---
  private initQuickJump() {
    const form = this.$<HTMLFormElement>("#v2-reader-jump-form");
    const input = this.$<HTMLInputElement>("#v2-jump-input");
    if (!form || !input) return;

    this.listen(input, "focus", () => input.select());
    this.listen(input, "click", () => input.select());

    this.listen(form, "submit", (e) => {
      const val = input.value.trim();
      if (!val) {
        e.preventDefault();
        return;
      }

      const currentPage = this.getAttribute("data-page") || "1.1";

      // Check full match (e.g. "1.1.2") or relative match (e.g. "2")
      let targetSecId = val;
      let targetEl = document.getElementById(`sec-${targetSecId}`);
      if (!targetEl && /^\d+$/.test(val)) {
        targetSecId = `${currentPage}.${val}`;
        targetEl = document.getElementById(`sec-${targetSecId}`);
      }

      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        targetEl.classList.add("target-highlight");
        setTimeout(() => targetEl?.classList.remove("target-highlight"), 3000);
        this.showToast(`Jumped to § ${targetSecId}`);
        input.value = targetSecId;
      }
      // If not on current page, standard form submission will navigate
    });
  }

  // --- Keyboard Shortcuts ([ Prev, ] Next, T TOC) ---
  private initKeyboardShortcuts() {
    this.listen(window, "keydown", (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
      }

      if (e.key === "[") {
        const prevBtn = this.$<HTMLAnchorElement>("#v2-pager-prev");
        if (prevBtn && !prevBtn.classList.contains("disabled")) {
          e.preventDefault();
          prevBtn.click();
        }
      } else if (e.key === "]") {
        const nextBtn = this.$<HTMLAnchorElement>("#v2-pager-next");
        if (nextBtn && !nextBtn.classList.contains("disabled")) {
          e.preventDefault();
          nextBtn.click();
        }
      } else if (e.key === "t" || e.key === "T") {
        if (this.tocController) {
          e.preventDefault();
          this.tocController.toggle();
        } else {
          const tocDrawer = this.$<HTMLElement>("#v2-reader-toc-drawer");
          if (tocDrawer) {
            e.preventDefault();
            if (tocDrawer.hasAttribute("hidden")) {
              this.$<HTMLButtonElement>("#v2-reader-toc-btn")?.click();
            } else {
              this.$<HTMLButtonElement>("#v2-reader-toc-close-btn")?.click();
            }
          }
        }
      } else if (e.key === "m" || e.key === "M") {
        const expandBtn = this.$<HTMLButtonElement>("#v2-sticky-expand-btn");
        if (expandBtn) {
          e.preventDefault();
          expandBtn.click();
        }
      }
    });
  }

  // --- Sticky Navigation Bar Expand / Collapse ---
  private initStickyExpand() {
    const expandBtn = this.$<HTMLButtonElement>("#v2-sticky-expand-btn");
    const expandedRow = this.$<HTMLElement>("#v2-sticky-expanded-row");
    if (!expandBtn || !expandedRow) return;

    const chevron = expandBtn.querySelector(".v2-expand-chevron");

    const setExpanded = (expanded: boolean) => {
      expandBtn.setAttribute("aria-expanded", String(expanded));
      expandedRow.hidden = !expanded;
      // The literal glyphs for &utrif; / &dtrif;, which is what reader.server.ts
      // emits, so this can be textContent: no markup, no HTML sink.
      if (chevron) chevron.textContent = expanded ? "▴" : "▾";
      try {
        localStorage.setItem("morcus_sticky_expanded", String(expanded));
      } catch {
        // Ignore storage errors
      }
    };

    // Restore preference if saved
    try {
      const saved = localStorage.getItem("morcus_sticky_expanded");
      if (saved === "true") {
        setExpanded(true);
      }
    } catch {
      // Ignore storage errors
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
