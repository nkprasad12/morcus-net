import {
  BaseElement,
  type QueryParamSync,
  registerElement,
  trackPointerDrag,
} from "@/web/v2/core/index.client";
import { processTokens, removeDiacritics } from "@/common/text_cleaning";

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
 */
export class MorcusReaderView extends BaseElement {
  private currentQuery: string = "";
  private preferredDrawerDvh: number = 48;
  private router: QueryParamSync | null = null;

  protected override onConnect() {
    this.enhancePassage();

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
    this.initTOC();
    this.initBiblioModal();
    this.initSettings();
    this.initStickyExpand();
    this.initQuickJump();
    this.initKeyboardShortcuts();
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
        secEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        secEl.classList.add("target-highlight");
        setTimeout(() => secEl.classList.remove("target-highlight"), 3000);
      }
      this.showToast(`Copied permalink: § ${secId}`);
      return;
    }

    const wordEl = e.target.closest<HTMLElement>(".v2-lat-word");
    if (!wordEl) return;

    e.preventDefault();
    const word =
      wordEl.dataset.word ||
      wordEl.textContent?.trim() ||
      "";
    if (!word) return;

    this.lookupWord(word, wordEl, true);
  };

  private closeDictionary(updateHistory: boolean = true) {
    this.dismissDictionary(updateHistory);
  }

  private minimizeDrawer() {
    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
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
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
    if (sheetLabel && this.currentQuery) {
      sheetLabel.innerHTML = `Definitions for <strong>${this.currentQuery}</strong> &middot; <span style="opacity:0.8;font-weight:400">tap to expand</span>`;
    }
  }

  private restoreDrawer(targetDvh?: number) {
    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
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
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
    if (sheetLabel && this.currentQuery) {
      sheetLabel.innerHTML = `Definitions for <strong>${this.currentQuery}</strong>`;
    }
    this.resetDictScroll();
  }

  private dismissDictionary(updateHistory: boolean = true) {
    this.currentQuery = "";

    // Remove active highlights
    const allWords = this.querySelectorAll<HTMLElement>(
      ".v2-reader-text-panel .v2-lat-word"
    );
    allWords.forEach((el) => el.classList.remove("v2-word-active"));

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

  private async lookupWord(
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
    const allWords = this.querySelectorAll<HTMLElement>(
      ".v2-reader-text-panel .v2-lat-word"
    );
    allWords.forEach((el) => el.classList.remove("v2-word-active"));
    if (activeAnchor) {
      activeAnchor.classList.add("v2-word-active");
    } else {
      const match = this.findWordElement(word);
      if (match) match.classList.add("v2-word-active");
    }

    // Update dictionary iframe (filtering by lang=La for Latin text word lookups)
    const iframe = this.querySelector<HTMLIFrameElement>("#v2-dict-frame");
    if (iframe) {
      const targetSrc = `/v2/dicts?q=${encodeURIComponent(word)}&lang=La&embedded=1`;
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
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
    if (sheetLabel) {
      sheetLabel.innerHTML = `Definitions for <strong>${word}</strong>`;
    }

    // Synchronize browser history and page title
    if (updateHistory) {
      this.router?.push(word);
    }
  }

  private enhancePassage() {
    const passage = this.querySelector<HTMLElement>("#v2-reader-passage");
    if (!passage) return;
    if (passage.dataset.enhanced === "true") return;
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

  private stripMacrons(str: string): string {
    return str
      .normalize("NFD")
      .replace(/[\u0304\u0305]/g, "")
      .normalize("NFC");
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
    const strippedWord = this.stripMacrons(rawWord);
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
      if (this.stripMacrons(val) === strippedWord) {
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
        if (!isNaN(parsed) && parsed >= 300 && parsed <= 900) {
          splitLayout.style.setProperty("--v2-dict-width", `${parsed}px`);
          splitter.setAttribute("aria-valuenow", String(parsed));
        }
      }
    } catch {
      // localStorage may be disabled
    }

    let startWidth = 0;

    this.addDisposable(
      trackPointerDrag(splitter, {
        handleActiveClass: "v2-is-resizing",
        bodyActiveClass: "v2-resizing-panels",
        onStart: () => {
          startWidth = dictPanel.getBoundingClientRect().width;
        },
        onMove: ({ dx }) => {
          const containerWidth = splitLayout.getBoundingClientRect().width;
          const minWidth = 300;
          const maxWidth = Math.max(
            minWidth,
            Math.min(800, containerWidth - 320)
          );
          const newWidth = Math.round(
            Math.max(minWidth, Math.min(maxWidth, startWidth - dx))
          );
          splitLayout.style.setProperty("--v2-dict-width", `${newWidth}px`);
          splitter.setAttribute("aria-valuenow", String(newWidth));
        },
        onEnd: () => {
          const finalWidth = parseInt(
            splitter.getAttribute("aria-valuenow") || "420",
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
      splitter.setAttribute("aria-valuenow", "420");
      try {
        localStorage.removeItem("morcus_v2_reader_dict_width");
      } catch {
        // ignore
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const currentWidth = parseInt(
        splitter.getAttribute("aria-valuenow") || "420",
        10
      );
      const containerWidth = splitLayout.getBoundingClientRect().width;
      const minWidth = 300;
      const maxWidth = Math.max(minWidth, Math.min(800, containerWidth - 320));
      let nextWidth: number | null = null;

      if (e.key === "ArrowLeft") {
        nextWidth = Math.min(maxWidth, currentWidth + 24);
      } else if (e.key === "ArrowRight") {
        nextWidth = Math.max(minWidth, currentWidth - 24);
      } else if (e.key === "Home") {
        nextWidth = minWidth;
      } else if (e.key === "End") {
        nextWidth = maxWidth;
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

    let wasMinimized = false;
    let startHeight = 0;

    this.addDisposable(
      trackPointerDrag(sheetBar, {
        handleActiveClass: "v2-is-dragging",
        bodyActiveClass: "v2-resizing-drawer",
        filter: (e) => {
          if (
            e.target instanceof Element &&
            e.target.closest("a.v2-reader-sheet-close")
          ) {
            return false;
          }
          return true;
        },
        onStart: () => {
          wasMinimized = dictPanel.classList.contains("v2-drawer-minimized");
          startHeight = dictPanel.getBoundingClientRect().height;
          if (wasMinimized) {
            dictPanel.classList.remove("v2-drawer-minimized");
          }
        },
        onMove: ({ dy }) => {
          const minHeight = 54;
          const maxHeight = Math.round(window.innerHeight * 0.88);
          const newHeight = Math.max(
            minHeight,
            Math.min(maxHeight, startHeight - dy)
          );
          dictPanel.style.setProperty("--v2-drawer-height", `${newHeight}px`);
          splitLayout?.style.setProperty(
            "--v2-drawer-height",
            `${newHeight}px`
          );
          const percent = Math.round((newHeight / window.innerHeight) * 100);
          sheetBar.setAttribute("aria-valuenow", String(percent));
        },
        onEnd: ({ dy, elapsedMs, velocityY }) => {
          const currentHeight = dictPanel.getBoundingClientRect().height;
          const currentDvh = Math.round(
            (currentHeight / window.innerHeight) * 100
          );

          // Handle simple tap (minimal movement)
          if (Math.abs(dy) < 6 && elapsedMs < 350) {
            if (wasMinimized) {
              this.restoreDrawer();
            }
            return;
          }

          // Fast flick down detection:
          const vhPerSec = (dy / window.innerHeight) * (1000 / elapsedMs);
          const isFastFlickDown =
            dy > 35 && (velocityY > 0.75 || vhPerSec > 1.1);

          // Dragged into the floor threshold (< 18dvh or < 110px)
          const isDraggedToFloor = currentDvh < 18 || currentHeight < 110;

          if (isFastFlickDown || isDraggedToFloor) {
            this.minimizeDrawer();
            return;
          }

          const clampedDvh = Math.min(88, Math.max(18, currentDvh));
          this.restoreDrawer(clampedDvh);
        },
      })
    );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (dictPanel.classList.contains("v2-drawer-minimized")) {
          this.restoreDrawer(48);
        } else {
          this.restoreDrawer(88);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentHeight = dictPanel.getBoundingClientRect().height;
        if (currentHeight > window.innerHeight * 0.6) {
          this.restoreDrawer(48);
        } else {
          this.minimizeDrawer();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.dismissDictionary(true);
      }
    };

    this.listen(sheetBar, "keydown", onKeyDown);
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
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"></path></svg>`;

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

  // --- Table of Contents (TOC) Modal/Drawer ---
  private initTOC() {
    const tocDrawer = this.$<HTMLElement>("#v2-reader-toc-drawer");
    const tocBtn = this.$<HTMLButtonElement>("#v2-reader-toc-btn");
    const breadcrumbBtn = this.$<HTMLButtonElement>(
      "#v2-reader-breadcrumb-btn"
    );
    const closeBtn = this.$<HTMLButtonElement>("#v2-reader-toc-close-btn");
    const backBtn = this.$<HTMLButtonElement>("#v2-reader-toc-back-btn");
    const filterInput = this.$<HTMLInputElement>("#v2-reader-toc-filter");
    if (!tocDrawer) return;

    const openTOC = () => {
      tocDrawer.removeAttribute("hidden");
      tocBtn?.setAttribute("aria-expanded", "true");
      filterInput?.focus();
    };

    const closeTOC = () => {
      tocDrawer.setAttribute("hidden", "");
      tocBtn?.setAttribute("aria-expanded", "false");
    };

    if (tocBtn) this.listen(tocBtn, "click", openTOC);
    if (breadcrumbBtn) this.listen(breadcrumbBtn, "click", openTOC);
    if (closeBtn) this.listen(closeBtn, "click", closeTOC);
    if (backBtn) this.listen(backBtn, "click", closeTOC);

    // Filter items in TOC list
    if (filterInput) {
      this.listen(filterInput, "input", () => {
        const term = filterInput.value.trim().toLowerCase();
        const items = this.$$<HTMLElement>(".v2-reader-toc-item");
        for (const item of items) {
          const text = item.textContent?.toLowerCase() || "";
          item.style.display = term && !text.includes(term) ? "none" : "";
        }
      });
    }

    // Dismiss on outside click
    this.listen(document, "click", (e) => {
      if (!tocDrawer.hasAttribute("hidden") && e.target instanceof Node) {
        if (
          !tocDrawer.contains(e.target) &&
          !tocBtn?.contains(e.target) &&
          !breadcrumbBtn?.contains(e.target)
        ) {
          closeTOC();
        }
      }
    });
  }

  // --- Bibliographical Metadata Modal Dialog ---
  private initBiblioModal() {
    const dialog = this.$<HTMLDialogElement>("#v2-reader-biblio-dialog");
    const infoBtn = this.$<HTMLButtonElement>("#v2-reader-info-btn");
    const closeBtn = this.$<HTMLButtonElement>("#v2-reader-biblio-close-btn");
    const okBtn = this.$<HTMLButtonElement>("#v2-reader-biblio-ok-btn");
    if (!dialog) return;

    if (infoBtn) {
      this.listen(infoBtn, "click", () => {
        dialog.showModal();
      });
    }

    const closeDialog = () => dialog.close();
    if (closeBtn) this.listen(closeBtn, "click", closeDialog);
    if (okBtn) this.listen(okBtn, "click", closeDialog);

    // Dismiss on backdrop click
    this.listen(dialog, "click", (e) => {
      const rect = dialog.getBoundingClientRect();
      const inDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!inDialog) {
        dialog.close();
      }
    });
  }

  // --- Reader Settings & Appearance Modal ---
  private initSettings() {
    const dialog = this.$<HTMLDialogElement>("#v2-reader-settings-dialog");
    const settingsBtn = this.$<HTMLButtonElement>("#v2-reader-settings-btn");
    const closeBtn = this.$<HTMLButtonElement>("#v2-reader-settings-close-btn");
    const doneBtn = this.$<HTMLButtonElement>("#v2-reader-settings-done-btn");
    const resetBtn = this.$<HTMLButtonElement>("#v2-reader-settings-reset-btn");

    const readerSizeDec = this.$<HTMLButtonElement>("#v2-reader-size-dec");
    const readerSizeInc = this.$<HTMLButtonElement>("#v2-reader-size-inc");
    const readerSizeLabel = this.$<HTMLElement>("#v2-reader-size-label");

    const dictSizeDec = this.$<HTMLButtonElement>("#v2-dict-size-dec");
    const dictSizeInc = this.$<HTMLButtonElement>("#v2-dict-size-inc");
    const dictSizeLabel = this.$<HTMLElement>("#v2-dict-size-label");

    const toggleMacra = this.$<HTMLInputElement>("#v2-toggle-macra");
    const toggleGutter = this.$<HTMLInputElement>("#v2-toggle-gutter");
    const fontSelect = this.$<HTMLSelectElement>("#v2-font-select");
    const lineHeightSelect = this.$<HTMLSelectElement>(
      "#v2-line-height-select"
    );

    if (!dialog) return;

    interface ReaderPreferences {
      readerScale: number;
      dictScale: number;
      showMacra: boolean;
      showGutter: boolean;
      fontFamily: "serif" | "sans";
      lineHeight: "compact" | "normal" | "relaxed";
    }

    const DEFAULT_PREFS: ReaderPreferences = {
      readerScale: 100,
      dictScale: 100,
      showMacra: true,
      showGutter: true,
      fontFamily: "serif",
      lineHeight: "normal",
    };

    let currentPrefs: ReaderPreferences = { ...DEFAULT_PREFS };

    try {
      const stored = localStorage.getItem("morcus_reader_settings");
      if (stored) {
        currentPrefs = { ...DEFAULT_PREFS, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore storage errors
    }

    const applyMacra = (show: boolean) => {
      const words = this.$$<HTMLElement>(
        ".v2-reader-passage .v2-lat-word"
      );
      for (const w of words) {
        if (!w.hasAttribute("data-original-text")) {
          w.setAttribute("data-original-text", w.textContent || "");
        }
        const orig = w.getAttribute("data-original-text") || "";
        w.textContent = show ? orig : this.stripMacrons(orig);
      }
    };

    const applyPreferences = (prefs: ReaderPreferences) => {
      // Font sizes
      const readerRem = `${((1.25 * prefs.readerScale) / 100).toFixed(3)}rem`;
      this.style.setProperty("--v2-reader-font-size", readerRem);
      if (readerSizeLabel)
        readerSizeLabel.textContent = `${prefs.readerScale}%`;

      const dictRem = `${((0.9375 * prefs.dictScale) / 100).toFixed(3)}rem`;
      this.style.setProperty("--v2-dict-font-size", dictRem);
      if (dictSizeLabel) dictSizeLabel.textContent = `${prefs.dictScale}%`;

      // Line height
      const lhVal =
        prefs.lineHeight === "compact"
          ? "1.6"
          : prefs.lineHeight === "relaxed"
          ? "2.3"
          : "1.95";
      this.style.setProperty("--v2-reader-line-height", lhVal);
      if (lineHeightSelect) lineHeightSelect.value = prefs.lineHeight;

      // Font family
      const fontVal =
        prefs.fontFamily === "sans"
          ? "var(--v2-font-sans)"
          : "var(--v2-font-serif)";
      this.style.setProperty("--v2-reader-font", fontVal);
      if (fontSelect) fontSelect.value = prefs.fontFamily;

      // Section gutter
      this.classList.toggle("v2-hide-gutter", !prefs.showGutter);
      if (toggleGutter) toggleGutter.checked = prefs.showGutter;

      // Macra
      applyMacra(prefs.showMacra);
      if (toggleMacra) toggleMacra.checked = prefs.showMacra;

      try {
        localStorage.setItem("morcus_reader_settings", JSON.stringify(prefs));
      } catch {
        // Ignore storage errors
      }
    };

    // Apply on load
    applyPreferences(currentPrefs);

    if (settingsBtn) {
      this.listen(settingsBtn, "click", () => {
        dialog.showModal();
        settingsBtn.setAttribute("aria-expanded", "true");
      });
    }

    const closeDialog = () => {
      dialog.close();
      settingsBtn?.setAttribute("aria-expanded", "false");
    };

    if (closeBtn) this.listen(closeBtn, "click", closeDialog);
    if (doneBtn) this.listen(doneBtn, "click", closeDialog);

    this.listen(dialog, "click", (e) => {
      const rect = dialog.getBoundingClientRect();
      const inDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!inDialog) {
        closeDialog();
      }
    });

    // Steppers
    if (readerSizeDec) {
      this.listen(readerSizeDec, "click", () => {
        currentPrefs.readerScale = Math.max(70, currentPrefs.readerScale - 10);
        applyPreferences(currentPrefs);
      });
    }
    if (readerSizeInc) {
      this.listen(readerSizeInc, "click", () => {
        currentPrefs.readerScale = Math.min(160, currentPrefs.readerScale + 10);
        applyPreferences(currentPrefs);
      });
    }

    if (dictSizeDec) {
      this.listen(dictSizeDec, "click", () => {
        currentPrefs.dictScale = Math.max(70, currentPrefs.dictScale - 10);
        applyPreferences(currentPrefs);
      });
    }
    if (dictSizeInc) {
      this.listen(dictSizeInc, "click", () => {
        currentPrefs.dictScale = Math.min(140, currentPrefs.dictScale + 10);
        applyPreferences(currentPrefs);
      });
    }

    // Toggles
    if (toggleMacra) {
      this.listen(toggleMacra, "change", () => {
        currentPrefs.showMacra = toggleMacra.checked;
        applyPreferences(currentPrefs);
      });
    }
    if (toggleGutter) {
      this.listen(toggleGutter, "change", () => {
        currentPrefs.showGutter = toggleGutter.checked;
        applyPreferences(currentPrefs);
      });
    }
    if (fontSelect) {
      this.listen(fontSelect, "change", () => {
        currentPrefs.fontFamily =
          fontSelect.value === "sans" ? "sans" : "serif";
        applyPreferences(currentPrefs);
      });
    }
    if (lineHeightSelect) {
      this.listen(lineHeightSelect, "change", () => {
        const val = lineHeightSelect.value;
        currentPrefs.lineHeight =
          val === "compact" || val === "relaxed" ? val : "normal";
        applyPreferences(currentPrefs);
      });
    }

    if (resetBtn) {
      this.listen(resetBtn, "click", () => {
        currentPrefs = { ...DEFAULT_PREFS };
        applyPreferences(currentPrefs);
      });
    }
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
        targetEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
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
        const tocDrawer = this.$<HTMLElement>("#v2-reader-toc-drawer");
        if (tocDrawer) {
          e.preventDefault();
          if (tocDrawer.hasAttribute("hidden")) {
            this.$<HTMLButtonElement>("#v2-reader-toc-btn")?.click();
          } else {
            this.$<HTMLButtonElement>("#v2-reader-toc-close-btn")?.click();
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
      if (chevron) chevron.innerHTML = expanded ? "&utrif;" : "&dtrif;";
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
