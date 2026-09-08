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
export class MorcusReaderView extends HTMLElement {
  private resultsElement: HTMLElement | null = null;
  private currentQuery: string = "";
  private abortController: AbortController | null = null;
  private desktopCleanups: (() => void)[] = [];
  private mobileCleanups: (() => void)[] = [];
  private preferredDrawerDvh: number = 48;

  connectedCallback() {
    this.resultsElement = this.querySelector<HTMLElement>(
      "#v2-reader-dict-results"
    );

    const initialParams = new URLSearchParams(window.location.search);
    this.currentQuery = initialParams.get("q") ?? "";

    this.addEventListener("click", this.handleClick);
    window.addEventListener("popstate", this.handlePopState);

    const form = this.querySelector<HTMLFormElement>(".v2-reader-search-form");
    form?.addEventListener("submit", this.handleSearchSubmit);

    this.initDesktopSplitter();
    this.initMobileDrawer();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
    window.removeEventListener("popstate", this.handlePopState);

    const form = this.querySelector<HTMLFormElement>(".v2-reader-search-form");
    form?.removeEventListener("submit", this.handleSearchSubmit);

    this.desktopCleanups.forEach((fn) => fn());
    this.desktopCleanups = [];

    this.mobileCleanups.forEach((fn) => fn());
    this.mobileCleanups = [];

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private readonly handleSearchSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const input = this.querySelector<HTMLInputElement>(".v2-reader-input");
    const query = input?.value.trim() || "";
    if (!query) return;
    this.lookupWord(query, undefined, true);
  };

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

    // Check if the click is inside the reader text panel (not inside dictionary entries themselves)
    const textPanel = this.querySelector(".v2-reader-text-panel");
    if (!textPanel || !textPanel.contains(wordAnchor)) {
      return;
    }

    e.preventDefault();
    const href = wordAnchor.getAttribute("href") || "";
    const urlMatch = href.match(/[?&]q=([^&#]+)/);
    const word = urlMatch
      ? decodeURIComponent(urlMatch[1])
      : wordAnchor.textContent?.trim() || "";
    if (!word) return;

    this.lookupWord(word, wordAnchor, true);
  };

  private readonly handlePopState = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get("q") ?? "";
    if (q === this.currentQuery) return;

    if (!q) {
      this.closeDictionary(false);
      return;
    }

    this.currentQuery = q;
    let matchingAnchor: HTMLElement | undefined;
    const allAnchors = this.querySelectorAll<HTMLAnchorElement>(
      ".v2-reader-text-panel a.v2-lat-word"
    );
    for (const a of allAnchors) {
      const aHref = a.getAttribute("href") || "";
      if (aHref.includes(`q=${encodeURIComponent(q)}`)) {
        matchingAnchor = a;
        break;
      }
    }
    this.lookupWord(q, matchingAnchor, false);
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
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

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
      window.history.pushState({}, "", "/v2/reader");
      document.title = "Latin Reader - Morcus Latin Tools";
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
      const newUrl = `/v2/reader?q=${encodeURIComponent(word)}`;
      window.history.pushState({ q: word }, "", newUrl);
      document.title = `${word} - Latin Reader - Morcus Latin Tools`;
    }

    if (!this.resultsElement) return;

    // Cancel in-flight requests
    if (this.abortController) {
      this.abortController.abort();
    }
    const controller = new AbortController();
    this.abortController = controller;

    this.resultsElement.style.opacity = "0.45";

    try {
      const url = `/v2/dicts?q=${encodeURIComponent(word)}&format=partial`;
      const res = await fetch(url, {
        headers: { "X-Requested-With": "fetch" },
        signal: controller.signal,
      });

      if (res.ok) {
        const partialHtml = await res.text();
        const range = document.createRange();
        range.selectNodeContents(this.resultsElement);
        const fragment = range.createContextualFragment(partialHtml);
        this.resultsElement.replaceChildren(fragment);

        this.resetDictScroll();
      } else {
        const errorDiv = document.createElement("div");
        errorDiv.className = "v2-no-results";
        const p = document.createElement("p");
        p.textContent = `Error loading dictionary entry for "${word}".`;
        errorDiv.appendChild(p);
        this.resultsElement.replaceChildren(errorDiv);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        console.error("Failed to load reader dictionary entry:", e);
        const errorDiv = document.createElement("div");
        errorDiv.className = "v2-no-results";
        const p = document.createElement("p");
        p.textContent = "Network error loading dictionary results.";
        errorDiv.appendChild(p);
        this.resultsElement?.replaceChildren(errorDiv);
      }
    } finally {
      if (this.resultsElement) {
        this.resultsElement.style.opacity = "1";
      }
      if (this.abortController === controller) {
        this.abortController = null;
      }
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
      // Mobile: Reset inner scroll container to right past the search bar
      const scrollContainer = this.querySelector<HTMLElement>(
        ".v2-reader-dict-sticky"
      );
      const searchHeader = this.querySelector<HTMLElement>(
        ".v2-reader-dict-header"
      );
      if (scrollContainer) {
        const offset = searchHeader ? searchHeader.offsetHeight + 10 : 0;
        scrollContainer.scrollTo({ top: offset, behavior: "instant" });
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

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // Only primary mouse button / touch
      isDragging = true;
      startX = e.clientX;
      startWidth = dictPanel.getBoundingClientRect().width;

      splitter.setPointerCapture(e.pointerId);
      splitter.classList.add("v2-is-resizing");
      document.body.classList.add("v2-resizing-panels");
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = startX - e.clientX;
      const containerWidth = splitLayout.getBoundingClientRect().width;
      const minWidth = 300;
      const maxWidth = Math.max(minWidth, Math.min(800, containerWidth - 320));
      const newWidth = Math.round(
        Math.max(minWidth, Math.min(maxWidth, startWidth + dx))
      );

      splitLayout.style.setProperty("--v2-dict-width", `${newWidth}px`);
      splitter.setAttribute("aria-valuenow", String(newWidth));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      splitter.releasePointerCapture(e.pointerId);
      splitter.classList.remove("v2-is-resizing");
      document.body.classList.remove("v2-resizing-panels");

      const finalWidth = parseInt(
        splitter.getAttribute("aria-valuenow") || "420",
        10
      );
      try {
        localStorage.setItem("morcus_v2_reader_dict_width", String(finalWidth));
      } catch {
        // ignore
      }
    };

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

    splitter.addEventListener("pointerdown", onPointerDown);
    splitter.addEventListener("pointermove", onPointerMove);
    splitter.addEventListener("pointerup", onPointerUp);
    splitter.addEventListener("pointercancel", onPointerUp);
    splitter.addEventListener("dblclick", onDblClick);
    splitter.addEventListener("keydown", onKeyDown);

    this.desktopCleanups.push(() => {
      splitter.removeEventListener("pointerdown", onPointerDown);
      splitter.removeEventListener("pointermove", onPointerMove);
      splitter.removeEventListener("pointerup", onPointerUp);
      splitter.removeEventListener("pointercancel", onPointerUp);
      splitter.removeEventListener("dblclick", onDblClick);
      splitter.removeEventListener("keydown", onKeyDown);
    });
  }

  // --- Mobile Bottom Drawer Resizer ---
  private initMobileDrawer() {
    const sheetBar = this.querySelector<HTMLElement>(".v2-reader-sheet-bar");
    const dictPanel = this.querySelector<HTMLElement>(".v2-reader-dict-panel");
    if (!sheetBar || !dictPanel) return;

    let isDragging = false;
    let wasMinimized = false;
    let startY = 0;
    let startHeight = 0;
    let startTime = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (
        e.target instanceof Element &&
        e.target.closest("a.v2-reader-sheet-close")
      ) {
        return; // Don't drag when tapping close button
      }
      isDragging = true;
      wasMinimized = dictPanel.classList.contains("v2-drawer-minimized");
      startY = e.clientY;
      startHeight = dictPanel.getBoundingClientRect().height;
      startTime = performance.now();

      sheetBar.setPointerCapture(e.pointerId);
      sheetBar.classList.add("v2-is-dragging");
      dictPanel.classList.add("v2-is-dragging");
      document.body.classList.add("v2-resizing-drawer");

      if (wasMinimized) {
        dictPanel.classList.remove("v2-drawer-minimized");
      }
    };

    const splitLayout = this.querySelector<HTMLElement>(
      ".v2-reader-split-layout"
    );

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dy = startY - e.clientY; // Upward drag increases drawer height
      const minHeight = 54;
      const maxHeight = Math.round(window.innerHeight * 0.88);
      const newHeight = Math.max(
        minHeight,
        Math.min(maxHeight, startHeight + dy)
      );

      dictPanel.style.setProperty("--v2-drawer-height", `${newHeight}px`);
      splitLayout?.style.setProperty("--v2-drawer-height", `${newHeight}px`);
      const percent = Math.round((newHeight / window.innerHeight) * 100);
      sheetBar.setAttribute("aria-valuenow", String(percent));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      sheetBar.releasePointerCapture(e.pointerId);
      sheetBar.classList.remove("v2-is-dragging");
      dictPanel.classList.remove("v2-is-dragging");
      document.body.classList.remove("v2-resizing-drawer");

      const totalDy = e.clientY - startY; // Positive = dragged down, Negative = dragged up
      const elapsed = Math.max(1, performance.now() - startTime);
      const velocityPxPerMs = totalDy / elapsed; // px/ms
      const currentHeight = dictPanel.getBoundingClientRect().height;
      const currentDvh = Math.round((currentHeight / window.innerHeight) * 100);

      // Handle simple tap (minimal movement)
      if (Math.abs(totalDy) < 6 && elapsed < 350) {
        if (wasMinimized) {
          this.restoreDrawer();
        }
        return;
      }

      // Fast flick down detection:
      // 1. Requires deliberate downward displacement (totalDy > 35px)
      // 2. High velocity (> 0.75 px/ms or > 1.1 viewport-heights per second)
      const vhPerSec = (totalDy / window.innerHeight) * (1000 / elapsed);
      const isFastFlickDown =
        totalDy > 35 && (velocityPxPerMs > 0.75 || vhPerSec > 1.1);

      // Dragged into the floor threshold (< 18dvh or < 110px)
      const isDraggedToFloor = currentDvh < 18 || currentHeight < 110;

      if (isFastFlickDown || isDraggedToFloor) {
        this.minimizeDrawer();
        return;
      }

      // For all other releases (deliberate drag down or any upward movement):
      // No snap-to-full; always commit the exact release position as % of dvh.
      const clampedDvh = Math.min(88, Math.max(18, currentDvh));
      this.restoreDrawer(clampedDvh);
    };

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

    sheetBar.addEventListener("pointerdown", onPointerDown);
    sheetBar.addEventListener("pointermove", onPointerMove);
    sheetBar.addEventListener("pointerup", onPointerUp);
    sheetBar.addEventListener("pointercancel", onPointerUp);
    sheetBar.addEventListener("keydown", onKeyDown);

    this.mobileCleanups.push(() => {
      sheetBar.removeEventListener("pointerdown", onPointerDown);
      sheetBar.removeEventListener("pointermove", onPointerMove);
      sheetBar.removeEventListener("pointerup", onPointerUp);
      sheetBar.removeEventListener("pointercancel", onPointerUp);
      sheetBar.removeEventListener("keydown", onKeyDown);
    });
  }
}

if (!customElements.get("morcus-reader-view")) {
  customElements.define("morcus-reader-view", MorcusReaderView);
}

declare global {
  interface HTMLElementTagNameMap {
    "morcus-reader-view": MorcusReaderView;
  }
}
