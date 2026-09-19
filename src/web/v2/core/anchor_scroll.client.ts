import {
  createSingletonSetup,
  type CleanupFn,
} from "@/web/v2/core/disposable.client";
import { flashElement } from "@/web/v2/core/dom.client";

/**
 * In-page anchor navigation, smooth scroll, disclosure auto-expansion, and target highlight.
 */

export function triggerAnchorHighlight(targetEl: HTMLElement): void {
  if (targetEl.id === "top" || targetEl.classList.contains("dict-card")) {
    return;
  }
  flashElement(targetEl, "target-active");
}

export function expandAncestorDisclosures(targetEl: HTMLElement): void {
  let parent: HTMLElement | null = targetEl;
  while (parent) {
    if (parent instanceof HTMLDetailsElement && !parent.open) {
      parent.open = true;
    }
    if (parent.classList?.contains("dict-card")) {
      const toggle = parent.querySelector<HTMLDetailsElement>(".dict-toggle");
      if (toggle && !toggle.open) {
        toggle.open = true;
      }
    }
    parent = parent.parentElement;
  }
}

/**
 * Initializes anchor scroll and deep-link expansion. Returns a cleanup function.
 */
export const setupAnchorScroll: (doc?: Document, win?: Window) => CleanupFn =
  createSingletonSetup(
    (doc: Document = document, win: Window = window): CleanupFn => {
      // Expand any ancestor <details> if initial page load has a hash
      if (win.location.hash) {
        const initialTarget = doc.getElementById(win.location.hash.slice(1));
        if (initialTarget) {
          expandAncestorDisclosures(initialTarget);
        }
      }

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
          expandAncestorDisclosures(targetEl);

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
      return () => {
        doc.removeEventListener("click", onClick);
      };
    }
  );

if (typeof document !== "undefined") {
  setupAnchorScroll();
}
