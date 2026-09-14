/**
 * Floating "Jump to top" button visibility & instant scroll.
 */

let activeCleanup: (() => void) | null = null;

export function setupBackToTop(
  doc: Document = document,
  win: Window = window
): () => void {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const backToTopBtn = doc.querySelector<HTMLAnchorElement>(".v2-back-to-top");
  if (!backToTopBtn) {
    return () => {};
  }

  let ticking = false;
  const updateBackToTop = () => {
    const shouldShow = win.scrollY > 300;
    backToTopBtn.classList.toggle("v2-visible", shouldShow);
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      win.requestAnimationFrame(updateBackToTop);
      ticking = true;
    }
  };

  win.addEventListener("scroll", onScroll, { passive: true });
  updateBackToTop();

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    if (typeof win.scrollTo === "function") {
      win.scrollTo({ top: 0, behavior: "instant" });
    }
    if (win.location.hash) {
      win.history.replaceState(
        null,
        "",
        win.location.pathname + win.location.search
      );
    }
  };

  backToTopBtn.addEventListener("click", onClick);

  const unbind = () => {
    win.removeEventListener("scroll", onScroll);
    backToTopBtn.removeEventListener("click", onClick);
    if (activeCleanup === unbind) {
      activeCleanup = null;
    }
  };
  activeCleanup = unbind;
  return unbind;
}

if (typeof document !== "undefined") {
  setupBackToTop();
}
