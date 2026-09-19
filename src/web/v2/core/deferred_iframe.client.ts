import type { CleanupFn } from "@/web/v2/core/disposable.client";

/**
 * Generic handler for deferred iframes (`iframe[data-deferred-src]` / `iframe[data-src]`).
 *
 * Iframes with an eager `src` make network requests as soon as they are parsed,
 * even when inside a closed `<details>` or styled `display: none`, because
 * `loading="lazy"` is ignored when scripting is disabled.
 *
 * Emitting `data-deferred-src` instead avoids all eager requests. This utility
 * promotes `data-deferred-src` to `src` when:
 * 1. An enclosing `<details>` disclosure is toggled open.
 * 2. An iframe is outside any closed disclosure upon hydration.
 *
 * Once hydrated, the data attribute is deleted so close/reopen cycles do not
 * re-trigger or refetch.
 */

const DEFERRED_IFRAME_SELECTOR = "iframe[data-deferred-src], iframe[data-src]";

let activeCleanup: CleanupFn | null = null;

export function hydrateIframe(frame: HTMLIFrameElement): void {
  const src = frame.dataset.deferredSrc ?? frame.dataset.src;
  if (!src) {
    return;
  }
  // Delete the attribute first so concurrent or repeated events do not re-run
  delete frame.dataset.deferredSrc;
  delete frame.dataset.src;
  frame.src = src;
}

/**
 * Hydrates all deferred iframes within `root` that are either outside any
 * `<details>` or inside an already-open `<details>`.
 */
export function hydrateDeferredIframes(root: ParentNode = document): void {
  const frames = root.querySelectorAll<HTMLIFrameElement>(
    DEFERRED_IFRAME_SELECTOR
  );
  for (const frame of frames) {
    const details = frame.closest("details");
    if (!details || details.open) {
      hydrateIframe(frame);
    }
  }
}

/**
 * Attaches a capturing `toggle` listener to handle any disclosure opening
 * across the document, and hydrates any currently open or top-level deferred iframes.
 */
export function setupDeferredIframes(doc: Document = document): CleanupFn {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const onToggle = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLDetailsElement && target.open) {
      hydrateDeferredIframes(target);
    }
  };

  // `toggle` does not bubble, but capture intercepts it at the document level
  // for any <details> element, including dynamically swapped partials.
  doc.addEventListener("toggle", onToggle, true);
  hydrateDeferredIframes(doc);

  const unbind = () => {
    doc.removeEventListener("toggle", onToggle, true);
    if (activeCleanup === unbind) {
      activeCleanup = null;
    }
  };

  activeCleanup = unbind;
  return unbind;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setupDeferredIframes());
  } else {
    setupDeferredIframes();
  }
}
