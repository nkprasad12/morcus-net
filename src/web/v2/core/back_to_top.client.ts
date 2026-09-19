import {
  createSingletonSetup,
  type CleanupFn,
} from "@/web/v2/core/disposable.client";

/**
 * Floating "Jump to top" button visibility & instant scroll.
 */
export const setupBackToTop: (doc?: Document, win?: Window) => CleanupFn =
  createSingletonSetup(
    (doc: Document = document, win: Window = window): CleanupFn => {
      const backToTopBtn = doc.querySelector<HTMLAnchorElement>(".back-to-top");
      if (!backToTopBtn) {
        return () => {};
      }

      let ticking = false;
      const updateBackToTop = () => {
        const shouldShow = win.scrollY > 300;
        backToTopBtn.classList.toggle("visible", shouldShow);
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

      return () => {
        win.removeEventListener("scroll", onScroll);
        backToTopBtn.removeEventListener("click", onClick);
      };
    }
  );

if (typeof document !== "undefined") {
  setupBackToTop();
}
