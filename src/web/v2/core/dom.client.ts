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

import { notifyContentSwap } from "@/web/v2/core/base_element.client";
import { recordDetachedDomWrite } from "@/web/v2/core/dom_invariants.client";
import type { SafeHtml } from "@/web/v2/core/html.common";

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
  el.addEventListener(
    "animationend",
    () => {
      el.classList.remove(className);
    },
    { once: true }
  );
}

/**
 * Returns true if a mouse event is a primary (left) click without modifier keys (Ctrl, Meta, Shift, Alt).
 */
export function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * Synchronizes the data-theme attribute on an iframe's document to match the parent document theme.
 */
export function syncIframeTheme(
  iframe: HTMLIFrameElement,
  theme?: string
): void {
  const currentTheme =
    theme ?? document.documentElement.getAttribute("data-theme") ?? "light";
  try {
    if (iframe.contentDocument?.documentElement) {
      iframe.contentDocument.documentElement.setAttribute(
        "data-theme",
        currentTheme
      );
    }
  } catch {
    // Cross-origin barrier safely ignored
  }
}
