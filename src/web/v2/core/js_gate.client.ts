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
 * Whether `el` is (or is inside) an owner that is not running: a
 * `morcus-*` element without {@link UPGRADED_ATTR}, or any element marked
 * {@link JS_FAILED_ATTR} (which also covers failed `BaseController` roots).
 * Only `morcus-*` tags count as components, so SVG / MathML hyphenated tags
 * never block.
 */
function isUnupgradedOwner(el: Element): boolean {
  return (
    el.hasAttribute(JS_FAILED_ATTR) ||
    (el.localName.startsWith("morcus-") && !el.hasAttribute(UPGRADED_ATTR))
  );
}

/**
 * Whether every component that could own `el` is running: no element from
 * `el` up to the root is an un-upgraded `morcus-*` element or carries
 * {@link JS_FAILED_ATTR}. `true` when `el` is outside any component.
 *
 * With `owner` (the component whose code is asking) the walk stops at
 * `owner` when it contains `el`: the caller is itself running, so only
 * components nested below it matter, and a working nested component keeps
 * working inside a failed ancestor, as the CSS gate does. A failed `owner`
 * is always `false`.
 *
 * Code that suppresses a native action and hands the replacement to another
 * owner checks this first, so an owner that is not running keeps its No-JS
 * behaviour, such as `:target` UI. Global setups run at page ready, after
 * every chunk has executed, so this is false only when:
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
export function ownersUpgraded(el: Element, owner?: Element | null): boolean {
  if (owner?.hasAttribute(JS_FAILED_ATTR)) return false;
  const stopAt = owner && owner.contains(el) ? owner : null;
  for (let cur: Element | null = el; cur && cur !== stopAt; ) {
    if (isUnupgradedOwner(cur)) return false;
    cur = cur.parentElement;
  }
  return true;
}

/** Attributes whose value is a space-separated list of element ids. */
const TARGET_ID_ATTRS = [
  "aria-controls",
  "popovertarget",
  "commandfor",
  "form",
] as const;

const WARNED_EVENTS = new WeakSet<Event>();
/**
 * Per-event result of the referenced-target check. It doesn't depend on the
 * listener, and caching it keeps an earlier listener's DOM changes from
 * giving a later listener on the same event a different answer.
 */
const REF_TARGETS_OK = new WeakMap<Event, boolean>();

/** `click`, `submit`, or a `keydown` the browser turns into activation. */
function isActivationEvent(e: Event): boolean {
  if (e.type === "click" || e.type === "submit") return true;
  if (e.type === "keydown" && e instanceof KeyboardEvent) {
    return e.key === "Enter" || e.key === " ";
  }
  return false;
}

function skipEvent(e: Event, reason: string, el: Element): false {
  if (process.env.NODE_ENV !== "production" && !WARNED_EVENTS.has(e)) {
    WARNED_EVENTS.add(e);
    console.warn(`[UI V2] Listener skipped (${reason}):`, el);
  }
  return false;
}

/**
 * The event's element path, innermost first. Uses `composedPath()`, which is
 * fixed before the first listener runs, so a listener that moves or detaches
 * `e.target` doesn't change the answer for later listeners.
 */
function elementPath(e: Event, fallback: Element): Element[] {
  const path = e
    .composedPath()
    .filter((n): n is Element => n instanceof Element);
  if (path.length > 0) return path;
  const out: Element[] = [];
  for (let cur: Element | null = fallback; cur; cur = cur.parentElement) {
    out.push(cur);
  }
  return out;
}

function decodeHashId(hash: string): string {
  const raw = hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Whether every element that a native control on the path points at (an
 * in-page `href="#id"`, or an id-list attribute) has a running owner.
 */
function referencedTargetsOk(
  e: Event,
  path: Element[],
  doc: Document
): boolean {
  const cached = REF_TARGETS_OK.get(e);
  if (cached !== undefined) return cached;
  const result = checkReferencedTargets(e, path, doc);
  REF_TARGETS_OK.set(e, result);
  return result;
}

function checkReferencedTargets(
  e: Event,
  path: Element[],
  doc: Document
): boolean {
  const link = path.find(
    (el): el is HTMLAnchorElement =>
      el instanceof HTMLAnchorElement &&
      (el.getAttribute("href")?.startsWith("#") ?? false)
  );
  if (link && link.hash.length > 1) {
    const hashTarget = doc.getElementById(decodeHashId(link.hash));
    if (hashTarget && !ownersUpgraded(hashTarget)) {
      return skipEvent(e, `hash target ${link.hash} not upgraded`, hashTarget);
    }
  }
  for (const attr of TARGET_ID_ATTRS) {
    const ids = path
      .find((el) => el.hasAttribute(attr))
      ?.getAttribute(attr)
      ?.trim();
    if (!ids) continue;
    for (const id of ids.split(/\s+/)) {
      const refTarget = doc.getElementById(id);
      if (refTarget && !ownersUpgraded(refTarget)) {
        return skipEvent(e, `${attr} #${id} not upgraded`, refTarget);
      }
    }
  }
  return true;
}

/**
 * The activation gate applied by `LifetimeScope.listen()`. Returns `false`
 * (and the listener is skipped) for a native activation event (`click`,
 * `submit`, `keydown` Enter / Space) when:
 *
 * - `owner`, the component the listening scope belongs to, has failed;
 * - `e.target` is inside a component that is not running (checked up to
 *   `owner`, or to the document for scopes without one); or
 * - a native control on the event path points at an element inside a
 *   component that is not running (`href="#id"`, `aria-controls`,
 *   `popovertarget`, `commandfor`, `form`).
 *
 * So a handler can never cancel a native action whose No-JS replacement
 * belongs to an owner that isn't running. Other events always pass.
 */
export function canHandleActivation(e: Event, owner?: Element | null): boolean {
  if (!isActivationEvent(e) || !(e.target instanceof Element)) return true;
  if (owner?.hasAttribute(JS_FAILED_ATTR)) {
    return skipEvent(e, "scope owner failed", owner);
  }
  const path = elementPath(e, e.target);
  const ownerIdx = owner ? path.indexOf(owner) : -1;
  const limit = ownerIdx >= 0 ? ownerIdx : path.length;
  for (let i = 0; i < limit; i++) {
    if (isUnupgradedOwner(path[i])) {
      return skipEvent(e, "event target not upgraded", path[i]);
    }
  }
  return referencedTargetsOk(e, path, e.target.ownerDocument);
}
