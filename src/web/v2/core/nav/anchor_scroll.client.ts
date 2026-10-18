import { LifetimeScope } from "@/web/v2/core/dom/lifetime_scope.client";
import {
  createSingletonSetup,
  type CleanupFn,
} from "@/web/v2/core/dom/disposable.client";
import { flashElement } from "@/web/v2/core/dom/dom.client";
import { decodeHashId } from "@/web/v2/core/dom/js_gate.client";
import {
  revealHashTarget,
  revealTarget,
} from "@/web/v2/core/nav/reveal.client";

/**
 * In-page anchor navigation, smooth scroll, target reveal (see
 * `core/nav/reveal.client.ts`), and target highlight.
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
 * Called from `onPageReady` (`core/dom/page_ready.client.ts`), i.e. after every
 * chunk on the page has upgraded its components, so their revealers are
 * registered by the time the initial hash is handled. That is the hash
 * handover: a panel opened by a hash link before upgrade is adopted by its
 * component here. Until then no handler is installed and in-page links behave
 * natively (`:target`).
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

        // Decoded the same way as the activation gate and the initial hash,
        // so `#caf%C3%A9` finds `id="café"`.
        const targetEl = doc.getElementById(decodeHashId(href));
        // If a component that could own the target isn't running, the
        // activation gate never calls this handler, so the browser's fragment
        // navigation and No-JS `:target` UI stay in charge.
        if (targetEl) {
          e.preventDefault();
          revealTarget(targetEl);

          // Jump pills are for quick navigation across a results page. With
          // many long entries a smooth scroll takes (or feels like) seconds
          // to arrive, so they jump instantly. Keep it that way.
          const isJumpPill =
            anchor.classList.contains("jump-pill") ||
            targetEl.classList.contains("dict-card");
          if (typeof targetEl.scrollIntoView === "function") {
            targetEl.scrollIntoView({
              behavior: isJumpPill ? "instant" : "smooth",
            });
          }
          // Records the fragment without a history entry; the owner (not
          // `:target`) now holds the state.
          win.history.replaceState(null, "", href);
          triggerAnchorHighlight(targetEl);
        }
      };

      const scope = new LifetimeScope(doc);
      scope.listen(doc, "click", onClick);
      // `win` may be a partial mock without `addEventListener` in tests.
      scope.listen(
        typeof win.addEventListener === "function" ? win : null,
        "hashchange",
        onHashChange
      );
      scope.listen(doc, "beforematch", onBeforeMatch, true);
      return () => scope.dispose();
    }
  );
