/**
 * The owner side of the JS gate (see the rule block in `v2-critical.css`).
 *
 * An element marked `data-js-only` is revealed, and one marked
 * `data-nojs-only` is hidden, once it or an ancestor carries
 * {@link UPGRADED_ATTR}. `BaseElement` marks every custom element after its
 * `onConnect()` returns, so components never call this directly. Global
 * scripts that attach behaviour to a specific element outside any component
 * (for example the back-to-top link) call {@link markUpgraded} on it.
 */

export const UPGRADED_ATTR = "data-upgraded";

/** Records that `el`'s behaviour is attached, revealing its JS-only UI. */
export function markUpgraded(el: Element): void {
  el.setAttribute(UPGRADED_ATTR, "");
}

/** Reverts {@link markUpgraded}, e.g. when the owner disconnects. */
export function clearUpgraded(el: Element): void {
  el.removeAttribute(UPGRADED_ATTR);
}
