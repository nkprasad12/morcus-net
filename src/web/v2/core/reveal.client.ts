import type { CleanupFn } from "@/web/v2/core/disposable.client";
import { decodeHashId } from "@/web/v2/core/js_gate.client";

/**
 * The reveal protocol: one way to make a targeted element visible, however it
 * is hidden (a closed `<details>`, a collapsed dictionary card, a drawer, a
 * popover, a tab).
 *
 * Containers that hide content register a {@link Revealer}; anything that
 * targets an element (the initial URL hash, `hashchange`, in-page anchor
 * clicks, find-in-page via `beforematch`) calls {@link revealTarget}, which
 * walks up from the target and asks each container on the way to show it.
 * `core/anchor_scroll.client.ts` does this for the URL hash.
 *
 * Hash handover: a container that is itself opened by a hash link without JS
 * (`<a href="#reader-toc-drawer">` + `:target` CSS) registers with
 * `ownsHash: true`. When the hash names that container, the hash is cleared
 * after revealing, so from then on component state (not `:target`) decides.
 * Scope its `:target` CSS to `:not([data-upgraded] *)` so the two never
 * disagree.
 */

/** Makes `target` (the container itself or a descendant) visible. */
export type Revealer = (target: HTMLElement) => void;

export interface RevealerOptions {
  /**
   * The container is opened by a `#<its id>` link without JS. When the hash
   * names it, {@link revealHashTarget} clears the hash after revealing.
   */
  ownsHash?: boolean;
}

interface Registration {
  reveal: Revealer;
  ownsHash: boolean;
}

const REGISTRY = new WeakMap<Element, Registration>();

/**
 * Registers `reveal` for `container`. Returns a cleanup function; pass it to
 * `this.scope.use()` so the registration ends with the component.
 */
export function registerRevealer(
  container: Element,
  reveal: Revealer,
  options: RevealerOptions = {}
): CleanupFn {
  const registration = { reveal, ownsHash: options.ownsHash ?? false };
  REGISTRY.set(container, registration);
  return () => {
    if (REGISTRY.get(container) === registration) {
      REGISTRY.delete(container);
    }
  };
}

/**
 * Makes `target` visible: opens every closed ancestor `<details>` (and the
 * toggle of an enclosing `.dict-card`), and calls every registered revealer
 * on the way up, innermost first.
 */
export function revealTarget(target: HTMLElement): void {
  let el: HTMLElement | null = target;
  while (el) {
    if (el instanceof HTMLDetailsElement && !el.open) {
      el.open = true;
    }
    if (el.classList?.contains("dict-card")) {
      const toggle = el.querySelector<HTMLDetailsElement>(".dict-toggle");
      if (toggle && !toggle.open) {
        toggle.open = true;
      }
    }
    REGISTRY.get(el)?.reveal(target);
    el = el.parentElement;
  }
}

/**
 * Reveals the element named by the current URL hash, if any, and performs the
 * hash handover for containers registered with `ownsHash`. Returns the target.
 *
 * Callers run after every chunk on the page has upgraded its components
 * (`onPageReady`), so the target's revealers are registered.
 */
export function revealHashTarget(
  doc: Document = document,
  win: Window = window
): HTMLElement | null {
  const hash = win.location.hash;
  if (!hash || hash === "#") return null;
  const target = doc.getElementById(decodeHashId(hash));
  if (!target) return null;

  revealTarget(target);
  if (REGISTRY.get(target)?.ownsHash) {
    // Hash handover. The registered (so upgraded) owner just revealed the
    // target and now holds the state; its `:target` CSS is scoped to
    // un-upgraded owners, so the stale `:target` is inert.
    win.history.replaceState(
      win.history.state,
      "",
      win.location.pathname + win.location.search
    );
  }
  return target;
}
