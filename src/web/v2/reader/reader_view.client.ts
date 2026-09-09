import {
  BaseElement,
  fetchAndSwapPartial,
  LatestTask,
  type QueryParamSync,
  registerElement,
  trackPointerDrag,
} from "@/web/v2/core/index.client";

/**
 * Progressively enhanced Reader View with embedded dictionary lookup using Light DOM.
 *
 * Without JS:
 * - Each Latin word is an HTML <a> link pointing to /v2/reader?q=word#v2-reader-dict.
 * - Clicking a word triggers a native standard HTTP GET request.
 * - The server re-renders the reader page with the chosen word's dictionary entry in the sidebar.
 *
 * With JS:
 * - Intercepts word clicks via event delegation.
 * - Fetches partial HTML fragments from /v2/dicts?q=word&format=partial.
 * - Swaps the dictionary panel contents instantaneously with replaceChildren(fragment).
 * - Synchronizes the active word visual indicator, browser URL bar, and history state.
 */
export class MorcusReaderView extends BaseElement {
  private resultsElement: HTMLElement | null = null;
  private currentQuery: string = "";
  private readonly task = new LatestTask();
  private preferredDrawerDvh: number = 48;
  private router: QueryParamSync | null = null;

  protected override onConnect() {
    this.resultsElement = this.$<HTMLElement>("#v2-reader-dict-results");

    this.router = this.syncQueryParam("q", {
      onChange: (q) => {
        if (!q) {
          this.closeDictionary(false);
          return;
        }
        this.lookupWord(q, this.findAnchorForWord(q), false);
      },
      title: (q) =>
        q
          ? `${q} - Latin Reader - Morcus Latin Tools`
          : "Latin Reader - Morcus Latin Tools",
    });

    this.currentQuery = this.router.get();

    this.listen(this, "click", this.handleClick);

    this.hijackForm(".v2-reader-search-form", ({ q }) => {
      if (q) {
        this.lookupWord(q, undefined, true);
      }
    });

    this.initDesktopSplitter();
    this.initMobileDrawer();
    this.initBackToTop();
  }

  protected override onDisconnect() {
    this.task.cancel();
  }

  private findAnchorForWord(word: string): HTMLElement | undefined {
    const allAnchors = this.$$<HTMLAnchorElement>(
      ".v2-reader-text-panel a.v2-lat-word"
    );
    for (const a of allAnchors) {
      const aHref = a.getAttribute("href") || "";
      if (aHref.includes(`q=${encodeURIComponent(word)}`)) {
        return a;
      }
    }
    return undefined;
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

    const wordAnchor = e.target.closest<HTMLAnchorElement>("a.v2-lat-word");
    if (!wordAnchor) return;

    e.preventDefault();
    const href = wordAnchor.getAttribute("href") || "";
    const urlMatch = href.match(/[?&]q=([^&#]+)/);
    const word = urlMatch
      ? decodeURIComponent(urlMatch[1])
      : wordAnchor.textContent?.trim() || "";
    if (!word) return;

    // Distinguish clicks in the reading passage from clicks within dictionary entries
    const textPanel = this.querySelector(".v2-reader-text-panel");
    const isTextPanel = Boolean(textPanel && textPanel.contains(wordAnchor));

    this.lookupWord(word, isTextPanel ? wordAnchor : undefined, true);
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
    this.task.cancel();

    // Remove active highlights
    const allWords = this.querySelectorAll<HTMLAnchorElement>(
      ".v2-reader-text-panel a.v2-lat-word"
    );
    allWords.forEach((el) => el.classList.remove("v2-word-active"));

    // Clear search input
    const readerInput =
      this.querySelector<HTMLInputElement>(".v2-reader-input");
    if (readerInput) {
      readerInput.value = "";
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

    // Remove close button from teaser if present
    const teaserClose = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-teaser .v2-reader-sheet-close"
    );
    if (teaserClose) {
      teaserClose.remove();
    }

    // Show empty state in results
    if (this.resultsElement) {
      this.resultsElement.innerHTML = `
        <div class="v2-reader-empty-state">
          <p class="v2-reader-empty-title">Select a word to view definitions</p>
          <p class="v2-reader-empty-desc">
            Click or tap any word in the text on the left to inspect its lexical entries,
            inflections, and translations.
          </p>
        </div>
      `;
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
    // If tapping the already loaded word while drawer is minimized, restore instantly with 0 fetch
    if (
      word === this.currentQuery &&
      dictPanel?.classList.contains("v2-drawer-minimized")
    ) {
      this.restoreDrawer();
      this.resetDictScroll();
      return;
    }

    this.currentQuery = word;

    // Update active highlight in the text
    const allWords = this.querySelectorAll<HTMLAnchorElement>(
      ".v2-reader-text-panel a.v2-lat-word"
    );
    allWords.forEach((el) => el.classList.remove("v2-word-active"));
    if (activeAnchor) {
      activeAnchor.classList.add("v2-word-active");
    } else {
      for (const a of allWords) {
        const aHref = a.getAttribute("href") || "";
        if (aHref.includes(`q=${encodeURIComponent(word)}`)) {
          a.classList.add("v2-word-active");
          break;
        }
      }
    }

    // Update reader search input value
    const readerInput =
      this.querySelector<HTMLInputElement>(".v2-reader-input");
    if (readerInput && readerInput.value !== word) {
      readerInput.value = word;
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
    if (window.innerWidth <= 960) {
      const targetEl =
        activeAnchor ||
        this.querySelector<HTMLElement>(
          ".v2-reader-text-panel a.v2-word-active"
        );
      if (targetEl) {
        requestAnimationFrame(() => {
          const rect = targetEl.getBoundingClientRect();
          const drawerTop =
            dictPanel?.getBoundingClientRect().top ??
            window.innerHeight * (1 - (this.preferredDrawerDvh ?? 48) / 100);
          // If word is occluded or within 24px of drawer header
          if (rect.bottom > drawerTop - 24) {
            targetEl.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
        });
      }
    }

    // Update mobile teaser bar label and ensure close button is present
    const sheetLabel = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-label"
    );
    if (sheetLabel) {
      sheetLabel.innerHTML = `Definitions for <strong>${word}</strong>`;
    }
    const sheetTeaser = this.querySelector<HTMLElement>(
      ".v2-reader-sheet-teaser"
    );
    if (sheetTeaser && !sheetTeaser.querySelector(".v2-reader-sheet-close")) {
      const closeBtn = document.createElement("a");
      closeBtn.href = "/v2/reader";
      closeBtn.className = "v2-reader-sheet-close";
      closeBtn.setAttribute("aria-label", "Close dictionary panel");
      closeBtn.title = "Close";
      closeBtn.textContent = "✕";
      sheetTeaser.appendChild(closeBtn);
    }

    // Synchronize browser history and page title
    if (updateHistory) {
      this.router?.push(word);
    }

    if (!this.resultsElement) return;

    const signal = this.task.start();
    const url = `/v2/dicts?q=${encodeURIComponent(word)}&format=partial`;
    const ok = await fetchAndSwapPartial(this.resultsElement, url, {
      signal,
      loadingOpacity: 0.45,
      errorMessage: `Error loading dictionary entry for "${word}".`,
    });

    if (ok) {
      this.resetDictScroll();
    }
  }

  private resetDictScroll() {
    if (window.innerWidth > 960) {
      // Desktop: Reset outer dict panel to top
      const dictPanel = this.querySelector<HTMLElement>(
        ".v2-reader-dict-panel"
      );
      dictPanel?.scrollTo({ top: 0, behavior: "instant" });
    } else {
      // Mobile: Instant scroll to the semantic content wrapper
      const scrollContainer = this.querySelector<HTMLElement>(
        ".v2-reader-dict-sticky"
      );
      const contentEl = this.querySelector<HTMLElement>(
        ".v2-reader-dict-content"
      );
      if (scrollContainer && contentEl) {
        scrollContainer.scrollTo({
          top: contentEl.offsetTop,
          behavior: "instant",
        });
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
      if (window.innerWidth > 960) {
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

      if (window.innerWidth > 960) {
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
}

registerElement("morcus-reader-view", MorcusReaderView);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-reader-view": MorcusReaderView;
  }
}
