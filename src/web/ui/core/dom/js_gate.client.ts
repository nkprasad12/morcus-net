/**
 * The owner side of the JS gate (see the rule block in `critical.css`).
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
 * working inside an ancestor that merely hasn't upgraded yet. A failed
 * ancestor is different: `[data-js-failed] [data-js-only]` hides the JS-only
 * UI of everything below it, running or not, so an `owner` that is failed or
 * sits inside a failed element is always `false` (see {@link ownerFailed}).
 *
 * {@link canHandleActivation} applies this to every activation event a
 * `LifetimeScope` listens for, so an owner that is not running keeps its
 * No-JS behaviour, such as `:target` UI. Global setups run at page ready,
 * after every chunk has executed, so this is false only when:
 *
 * - the owner's route chunk failed to load (flaky network, deploy skew): its
 *   tag is never defined;
 * - its `onConnect` threw (`data-js-failed`);
 * - its definition arrives later (a lazily imported chunk).
 *
 * This is the README rule "before upgrade, a page behaves like the No-JS
 * page", applied to code outside the owner.
 */
export function ownersUpgraded(el: Element, owner?: Element | null): boolean {
  if (ownerFailed(owner)) return false;
  const stopAt = owner && owner.contains(el) ? owner : null;
  for (let cur: Element | null = el; cur && cur !== stopAt; ) {
    if (isUnupgradedOwner(cur)) return false;
    cur = cur.parentElement;
  }
  return true;
}

/**
 * Whether `owner` or any of its ancestors carries {@link JS_FAILED_ATTR}
 * (a component whose `onConnect` threw, or `<html>` when a chunk failed to
 * load). The CSS gate drops `data-js-only` UI anywhere under such an
 * element, so its code must not handle activations there either.
 */
function ownerFailed(owner: Element | null | undefined): boolean {
  return Boolean(owner?.closest(`[${JS_FAILED_ATTR}]`));
}

/**
 * Tag name → element class for `morcus-*` components. Each component module
 * augments this (never the global `HTMLElementTagNameMap`), so raw
 * `querySelector("morcus-x")` / `closest("morcus-x")` return a plain
 * `Element`, and the only typed way to reach a peer's methods is
 * {@link queryUpgraded} / {@link closestUpgraded}, which check that the peer
 * is running.
 *
 * ```ts
 * declare module "@/web/ui/core/dom/js_gate.client" {
 *   interface MorcusElementTagNameMap {
 *     "morcus-x": MorcusX;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MorcusElementTagNameMap {}

function asRunning<K extends keyof MorcusElementTagNameMap>(
  el: Element | null
): MorcusElementTagNameMap[K] | null {
  if (!el?.hasAttribute(UPGRADED_ATTR) || el.hasAttribute(JS_FAILED_ATTR)) {
    return null;
  }
  // Safe: an upgraded element with tag K is an instance of the class that
  // registered K (`BaseElement` marks it after its own `onConnect`).
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return el as unknown as MorcusElementTagNameMap[K];
}

/**
 * The first `tag` element under `root`, or `null` if there is none or it
 * hasn't upgraded (its chunk failed, its `onConnect` threw, or it isn't
 * defined yet). Use this, not `querySelector`, to call a peer's methods.
 */
export function queryUpgraded<K extends keyof MorcusElementTagNameMap>(
  root: ParentNode,
  tag: K
): MorcusElementTagNameMap[K] | null {
  return asRunning<K>(root.querySelector(tag));
}

/** Like {@link queryUpgraded}, for the nearest `tag` ancestor of `el`. */
export function closestUpgraded<K extends keyof MorcusElementTagNameMap>(
  el: Element,
  tag: K
): MorcusElementTagNameMap[K] | null {
  return asRunning<K>(el.closest(tag));
}

/** Attributes whose value is a space-separated list of element ids. */
const TARGET_ID_ATTRS = [
  "aria-controls",
  "popovertarget",
  "commandfor",
  "form",
] as const;

const WARNED_EVENTS = new WeakSet<Event>();

/** Why a listener was skipped, for the development warning. */
interface SkipReason {
  reason: string;
  el: Element;
}

/**
 * Per-event result of the referenced-target check. It doesn't depend on the
 * listener, and caching it keeps an earlier listener's DOM changes from
 * giving a later listener on the same event a different answer.
 */
const REF_TARGETS_BLOCKED = new WeakMap<Event, SkipReason | null>();

/** `click`, `submit`, or a `keydown` the browser turns into activation. */
function isActivationEvent(e: Event): boolean {
  if (e.type === "click" || e.type === "submit") return true;
  if (e.type === "keydown" && e instanceof KeyboardEvent) {
    return e.key === "Enter" || e.key === " ";
  }
  return false;
}

/**
 * Records a skipped listener. In development, warns once per event, but only
 * for component scopes: a standalone scope (`owner == null`, e.g. the
 * document-level anchor-scroll setup) skipping a click into an owner that
 * isn't running is the designed outcome, not a bug worth flagging.
 */
function skipEvent(
  e: Event,
  { reason, el }: SkipReason,
  owner: Element | null | undefined
): false {
  if (process.env.NODE_ENV !== "production" && owner && !WARNED_EVENTS.has(e)) {
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

/**
 * The element id named by a URL fragment: `hash` includes the leading `#`
 * (an `href` value or `location.hash`), and is percent-decoded, falling back
 * to the raw text when malformed. Not for id-reference attributes such as
 * `aria-controls`, whose values are literal ids.
 */
export function decodeHashId(hash: string): string {
  const raw = hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Why, if at all, a native control on the path points at an element (an
 * in-page `href="#id"`, or an id-list attribute) without a running owner.
 * `null` when every referenced target is fine.
 */
function referencedTargetsBlocked(
  e: Event,
  path: Element[],
  doc: Document
): SkipReason | null {
  const cached = REF_TARGETS_BLOCKED.get(e);
  if (cached !== undefined) return cached;
  const result = checkReferencedTargets(path, doc);
  REF_TARGETS_BLOCKED.set(e, result);
  return result;
}

function checkReferencedTargets(
  path: Element[],
  doc: Document
): SkipReason | null {
  const link = path.find(
    (el): el is HTMLAnchorElement =>
      el instanceof HTMLAnchorElement &&
      (el.getAttribute("href")?.startsWith("#") ?? false)
  );
  if (link && link.hash.length > 1) {
    const hashTarget = doc.getElementById(decodeHashId(link.hash));
    if (hashTarget && !ownersUpgraded(hashTarget)) {
      return {
        reason: `hash target ${link.hash} not upgraded`,
        el: hashTarget,
      };
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
        return { reason: `${attr} #${id} not upgraded`, el: refTarget };
      }
    }
  }
  return null;
}

/**
 * The activation gate applied by `LifetimeScope.listen()`. Returns `false`
 * (and the listener is not called at all) for a native activation event
 * (`click`, `submit`, `keydown` Enter / Space) when:
 *
 * - `owner`, the component the listening scope belongs to, has failed or is
 *   inside a failed element (including `<html>` after a chunk failed);
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
  if (owner && ownerFailed(owner)) {
    return skipEvent(
      e,
      { reason: "scope owner or an ancestor failed", el: owner },
      owner
    );
  }
  const path = elementPath(e, e.target);
  const ownerIdx = owner ? path.indexOf(owner) : -1;
  const limit = ownerIdx >= 0 ? ownerIdx : path.length;
  for (let i = 0; i < limit; i++) {
    if (isUnupgradedOwner(path[i])) {
      return skipEvent(
        e,
        { reason: "event target not upgraded", el: path[i] },
        owner
      );
    }
  }
  const blocked = referencedTargetsBlocked(e, path, e.target.ownerDocument);
  return blocked ? skipEvent(e, blocked, owner) : true;
}
