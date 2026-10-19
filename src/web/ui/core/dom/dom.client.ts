/**
 * The audited HTML sinks for UI V2.
 *
 * Every assignment of markup to the DOM should go through here. Two reasons:
 *
 * 1. The functions take {@link SafeHtml}, so the type system rejects a raw
 *    string. That covers markup produced by a renderer function, which
 *    `eslint-plugin-no-unsanitized` cannot vouch for on its own -- it sees a
 *    call expression and has no way to know the callee escapes its inputs.
 * 2. It concentrates the actual `innerHTML` / `outerHTML` writes into a couple
 *    of reviewed lines instead of scattering lint exemptions across the
 *    codebase.
 */

import { notifyContentSwap } from "@/web/ui/core/dom/base_controller.client";
import { recordDetachedDomWrite } from "@/web/ui/core/dom/dom_invariants.client";
import type { SafeHtml } from "@/web/ui/core/dom/html.common";

/** Replaces the children of `target` with the given markup. */
export function setHtml(target: Element, content: SafeHtml): void {
  assertConnected(target);
  // The audited sink; the `SafeHtml` parameter is the guarantee. The rationale
  // has to sit above the directive rather than after it on the same line:
  // prettier wraps a long trailing `--` description onto a second line, and
  // `disable-next-line` would then apply to that comment instead.
  // eslint-disable-next-line no-unsanitized/property
  target.innerHTML = content;
  notifyContentSwap(target);
}

/** Replaces `target` itself with the given markup. */
export function replaceWithHtml(target: Element, content: SafeHtml): void {
  assertConnected(target);
  const parent = target.parentElement;
  const prevSibling = target.previousElementSibling;
  // The audited sink; the `SafeHtml` parameter is the guarantee.
  // eslint-disable-next-line no-unsanitized/property
  target.outerHTML = content;
  if (parent) {
    const replacement =
      (prevSibling
        ? prevSibling.nextElementSibling
        : parent.firstElementChild) ?? parent;
    notifyContentSwap(replacement);
  }
}

/**
 * Dev-only invariant ensuring DOM writes never target detached elements.
 *
 * When a host element is inside `disconnectedCallback()`, the browser has
 * already detached the host tree from `document` before invoking `onDisconnect()`.
 * Elements still attached to that disconnecting host root are allowed to reset
 * their attributes cleanly, whereas elements orphaned from their host or written
 * while the host is connected log an error.
 */
export function assertConnected(el: Element, hostRoot?: ParentNode): void {
  if (process.env.NODE_ENV === "production") return;
  if (el.isConnected) return;
  if (
    hostRoot instanceof Node &&
    !hostRoot.isConnected &&
    hostRoot.getRootNode() === el.getRootNode()
  ) {
    return;
  }
  const idSuffix = el.id ? `#${el.id}` : "";
  const msg = `[UI V2] DOM write targeting detached element <${el.tagName.toLowerCase()}${idSuffix}>.`;
  console.error(msg);
  if (process.env.NODE_ENV === "test") {
    recordDetachedDomWrite(msg);
  }
}

/**
 * Escapes an element ID for safe use in CSS selector queries.
 */
export function escapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(id);
  }
  return id.replace(/([ #;&,.+*~':"!^$[\]()=>|/@])/g, "\\$1");
}

/**
 * Triggers a one-shot CSS keyframe animation by reflow-restarting an active class.
 */
export function flashElement(
  el: HTMLElement,
  className: string = "target-active"
): void {
  el.classList.remove(className);
  // Force a reflow so the browser cleanly restarts the keyframe animation
  void el.offsetWidth;
  el.classList.add(className);
  // A one-shot cleanup; `animationend` isn't an activation event, and this
  // module sits below `base_element` (which imports it).
  // eslint-disable-next-line no-restricted-syntax
  el.addEventListener(
    "animationend",
    () => {
      el.classList.remove(className);
    },
    { once: true }
  );
}

/**
 * Synchronizes the data-theme attribute on an iframe's document to match the parent document theme.
 * When no explicit theme override exists (null), removes `data-theme` so the iframe's own
 * `@media (prefers-color-scheme: dark)` rules apply naturally.
 */
export function syncIframeTheme(
  iframe: HTMLIFrameElement,
  theme?: string | null
): void {
  const currentTheme =
    theme !== undefined
      ? theme
      : document.documentElement.getAttribute("data-theme");
  try {
    const docEl = iframe.contentDocument?.documentElement;
    if (docEl) {
      if (currentTheme) {
        docEl.setAttribute("data-theme", currentTheme);
      } else {
        docEl.removeAttribute("data-theme");
      }
    }
  } catch {
    // Cross-origin barrier safely ignored
  }
}

/**
 * The path and query (`pathname + search`) a same-origin iframe is currently showing.
 *
 * Navigating inside the iframe (a typed dictionary search, a clicked entry word, `pushState` or
 * `replaceState`) moves `contentWindow.location` while leaving the `<iframe>` element's `src`
 * attribute on the initial lookup. Reading `contentWindow.location` first means re-clicking that
 * initial word in the host passage sees that the iframe has moved on and navigates it back.
 * Falls back to `getAttribute("src")` before the frame has loaded a document (e.g. `about:blank`).
 */
export function currentIframeSrc(iframe: HTMLIFrameElement): string | null {
  try {
    const loc = iframe.contentWindow?.location;
    if (loc && loc.pathname.startsWith("/")) {
      return loc.pathname + loc.search;
    }
  } catch {
    // Cross-origin barrier safely ignored
  }
  return iframe.getAttribute("src");
}

/**
 * Navigates a same-origin iframe to `url` by replacing its current session
 * history entry, so the navigation does not push to the top-level joint session
 * history. Before the frame has loaded a document (e.g. `about:blank` while
 * `loading="lazy"` is deferred), or when `contentWindow` is null or throws,
 * assigns `iframe.src` directly so the initial lazy load uses `url`.
 */
export function navigateFrameReplace(
  iframe: HTMLIFrameElement,
  url: string
): void {
  try {
    const win = iframe.contentWindow;
    if (win && win.location.pathname.startsWith("/")) {
      win.location.replace(url);
      return;
    }
  } catch {
    // Cross-origin or sandboxed: fall through
  }
  iframe.src = url;
}

/**
 * Targets where single-key shortcuts must not fire: native and ARIA text /
 * selection controls, contenteditable regions, and overlays. In the reader,
 * the TOC / Appearance popovers are `<div role="dialog">` rather than
 * `<dialog>` or `[popover]`, so `t` and `a` can still close them while their
 * close button or a TOC link holds focus.
 */
const SHORTCUT_BLOCKED_TARGET =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
  '[role="textbox"], [role="searchbox"], [role="combobox"], [role="listbox"], ' +
  'dialog, [role="menu"], [popover], .mobile-menu';

/** Open overlays that block single-key shortcuts even before focus moves inside. */
const SHORTCUT_BLOCKED_OPEN_OVERLAY =
  "dialog[open], .section-action-menu, .mobile-menu[open]";

/**
 * Whether a single-key `keydown` shortcut should be ignored because the event
 * was already handled, is part of IME composition, uses a modifier key
 * (`Ctrl`, `Meta`, `Alt`), originates in an editable or overlay target, or an
 * overlay is currently open.
 */
export function isShortcutBlocked(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.isComposing) return true;
  if (e.ctrlKey || e.metaKey || e.altKey) return true;

  const target =
    e.target instanceof Element ? e.target : document.activeElement;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target?.closest(SHORTCUT_BLOCKED_TARGET)) return true;
  if (document.querySelector(SHORTCUT_BLOCKED_OPEN_OVERLAY)) return true;

  return false;
}

/**
 * Scrolls `targetEl` into view within its own document window, respecting
 * CSS `scroll-margin-top` without propagating scrolling across iframe boundaries
 * to parent browsing contexts.
 *
 * Precondition: `targetEl` must live in the root viewport scroller (`win`), not
 * inside an inner overflow scroll container (e.g. an `overflow-y: auto` pane).
 */
export function scrollToElement(
  targetEl: HTMLElement,
  behavior: ScrollBehavior = "instant",
  win: Window = targetEl.ownerDocument.defaultView ?? window
): void {
  if (typeof win.scrollTo !== "function") return;
  const rawMargin =
    typeof win.getComputedStyle === "function"
      ? parseFloat(win.getComputedStyle(targetEl).scrollMarginTop)
      : 0;
  const margin = Number.isFinite(rawMargin) ? rawMargin : 0;
  const top = Math.max(
    0,
    (win.scrollY || 0) + targetEl.getBoundingClientRect().top - margin
  );
  win.scrollTo({ top, behavior });
}
