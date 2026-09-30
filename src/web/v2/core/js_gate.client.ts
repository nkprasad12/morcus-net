/**
 * The owner side of the JS gate (see the rule block in `v2-critical.css`).
 *
 * Paint is decided by CSS alone (`@media (scripting)`); this module decides
 * behaviour. An element marked `data-js-only` becomes visible (and usable)
 * once it or an ancestor carries {@link UPGRADED_ATTR}. `BaseElement` marks
 * every custom element after its `onConnect()` returns, so components never
 * call this directly. Global scripts that attach behaviour to a specific
 * element outside any component (for example the back-to-top link) call
 * {@link markUpgraded} on it.
 *
 * {@link JS_FAILED_ATTR} is the opposite: the owner's behaviour could not be
 * attached, so its JS-only controls are dropped and its No-JS fallbacks are
 * painted again.
 */

export const UPGRADED_ATTR = "data-upgraded";
export const JS_FAILED_ATTR = "data-js-failed";

/** Records that `el`'s behaviour is attached, revealing its JS-only UI. */
export function markUpgraded(el: Element): void {
  el.setAttribute(UPGRADED_ATTR, "");
}

/** Reverts {@link markUpgraded}, e.g. when the owner disconnects. */
export function clearUpgraded(el: Element): void {
  el.removeAttribute(UPGRADED_ATTR);
}

/**
 * Records that `el`'s behaviour failed to attach: its JS-only UI is dropped
 * and its No-JS fallbacks come back.
 */
export function markFailed(el: Element): void {
  el.setAttribute(JS_FAILED_ATTR, "");
}

/** Reverts {@link markFailed}, e.g. when the owner disconnects. */
export function clearFailed(el: Element): void {
  el.removeAttribute(JS_FAILED_ATTR);
}

/**
 * Whether every component that could own `el` has upgraded: `el` and each
 * ancestor that is a custom element (a hyphenated tag) carry
 * {@link UPGRADED_ATTR}. `true` when `el` is outside any component.
 *
 * Code that suppresses a native action and hands the replacement to another
 * owner (e.g. the in-page anchor `click` handler's `preventDefault()`, which
 * relies on the target's revealer) checks this first, so an owner that is not
 * running keeps its No-JS behaviour, such as `:target` UI. Global setups run
 * at page ready, after every chunk has executed, so this is false only when:
 *
 * - the owner's route chunk failed to load (flaky network, deploy skew): its
 *   tag is never defined;
 * - its `onConnect` threw (`data-js-failed`);
 * - its definition arrives later (a lazily imported chunk).
 *
 * This is the README rule "before upgrade, a page behaves like the No-JS
 * page", applied to code outside the owner. The `morcus/native-takeover`
 * lint rule requires this guard on every `native-takeover(owner-checked)`
 * call.
 */
export function ownersUpgraded(el: Element): boolean {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (cur.localName.includes("-") && !cur.hasAttribute(UPGRADED_ATTR)) {
      return false;
    }
  }
  return true;
}
