import {
  createSingletonSetup,
  type CleanupFn,
} from "@/web/v2/core/disposable.client";
import { flashElement } from "@/web/v2/core/dom.client";
import { revealHashTarget, revealTarget } from "@/web/v2/core/reveal.client";

/**
 * In-page anchor navigation, smooth scroll, target reveal (see
 * `core/reveal.client.ts`), and target highlight.
 */

export function triggerAnchorHighlight(targetEl: HTMLElement): void {
  if (targetEl.id === "top" || targetEl.classList.contains("dict-card")) {
    return;
  }
  flashElement(targetEl, "target-active");
}

/**
 * Initializes anchor scroll and deep-link reveal. Returns a cleanup function.
 *
 * Runs after `v2_elements.client.ts` has upgraded every component, so their
 * revealers are registered by the time the initial hash is handled. That is
 * the hash handover: a panel opened by a hash link before upgrade is adopted
 * by its component here.
 */
export const setupAnchorScroll: (doc?: Document, win?: Window) => CleanupFn =
  createSingletonSetup(
    (doc: Document = document, win: Window = window): CleanupFn => {
      revealHashTarget(doc, win);

      // Back/forward and manual hash edits.
      const onHashChange = () => revealHashTarget(doc, win);
      // Find-in-page on `hidden="until-found"` content, where supported.
      const onBeforeMatch = (e: Event) => {
        if (e.target instanceof HTMLElement) revealTarget(e.target);
      };

      // Smooth scroll, auto-expand parent cards, and animate highlight on in-page anchor links
      const onClick = (e: MouseEvent) => {
        // A feature handler bound closer to the target (e.g. dictionary permalink
        // copying) may have already consumed this click. Without this guard the
        // default-suppressed anchor would still be scrolled to.
        if (e.defaultPrevented) return;
        if (!(e.target instanceof Element)) return;
        const anchor = e.target.closest<HTMLAnchorElement>("a[href^='#']");
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (
          !href ||
          href === "#" ||
          href === "#top" ||
          anchor.classList.contains("back-to-top")
        ) {
          return;
        }

        const targetId = href.slice(1);
        const targetEl = doc.getElementById(targetId);
        if (targetEl) {
          e.preventDefault();
          revealTarget(targetEl);

          const isJumpPill =
            anchor.classList.contains("jump-pill") ||
            targetEl.classList.contains("dict-card");
          if (typeof targetEl.scrollIntoView === "function") {
            targetEl.scrollIntoView({
              behavior: isJumpPill ? "instant" : "smooth",
            });
          }
          win.history.replaceState(null, "", href);
          triggerAnchorHighlight(targetEl);
        }
      };

      doc.addEventListener("click", onClick);
      win.addEventListener?.("hashchange", onHashChange);
      doc.addEventListener("beforematch", onBeforeMatch, true);
      return () => {
        doc.removeEventListener("click", onClick);
        win.removeEventListener?.("hashchange", onHashChange);
        doc.removeEventListener("beforematch", onBeforeMatch, true);
      };
    }
  );

if (typeof document !== "undefined") {
  setupAnchorScroll();
}
