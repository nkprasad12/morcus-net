/**
 * Utilities for safe DOM fragment parsing and progressive enhancement partial swapping.
 */

import { notifyContentSwap } from "@/web/v2/core/base_element.client";
import { assertConnected } from "@/web/v2/core/dom.client";

/**
 * Parses an HTML string into a contextual DocumentFragment using the browser's
 * Range API.
 *
 * This is the trust boundary for partial swapping, and the one place in V2 that
 * parses markup it did not build itself. The `html` helper cannot protect this:
 * the string arrives from the network, already assembled. What it rests on
 * instead is that the only caller, {@link fetchAndSwapPartial}, fetches
 * same-origin V2 routes, so the markup is our own SSR output and is escaped
 * server-side. Anything that starts passing third-party markup here needs a
 * sanitizer, not this function.
 */
export function createHtmlFragment(html: string): DocumentFragment {
  const range = document.createRange();
  // Same-origin SSR markup; the escaping happened on the server. See above.
  // eslint-disable-next-line no-unsanitized/method
  return range.createContextualFragment(html);
}

/**
 * Safely replaces all children of `container` with parsed nodes from `html`.
 */
export function swapElementContent(container: HTMLElement, html: string): void {
  assertConnected(container);
  const fragment = createHtmlFragment(html);
  container.replaceChildren(fragment);
  notifyContentSwap(container);
}

export interface FetchAndSwapOptions {
  /**
   * Required so that every call site has to decide what cancels this request.
   * Callers that genuinely want an uncancellable fetch can pass
   * `AbortSignal.timeout` or a never-aborted controller, but they have to say so.
   * Components should normally pass `this.scope.signal` or `this.scope.latest(lane)`.
   */
  signal: AbortSignal;
  loadingOpacity?: number;
  errorMessage?: string;
}

/**
 * Fetches an HTML partial fragment from `url` and swaps it into `container`.
 * Handles loading opacity, headers, error display, and signal cancellation.
 */
export async function fetchAndSwapPartial(
  container: HTMLElement,
  url: string,
  options: FetchAndSwapOptions
): Promise<boolean> {
  // Deliberately not capturing/restoring the previous inline opacity. This
  // helper is the only thing that sets it, so when two requests overlap the
  // "previous" value is just the older request's loading dim. Instead, an
  // aborted request leaves the container alone: whichever request is still
  // live owns it.
  container.style.opacity = String(options.loadingOpacity ?? 0.5);
  const clearLoading = () => {
    if (!options.signal.aborted) {
      container.style.opacity = "";
    }
  };

  try {
    const res = await fetch(url, {
      headers: { "X-Requested-With": "fetch" },
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    swapElementContent(container, html);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return false;
    }
    console.error("fetchAndSwapPartial failed:", err);
    const errorDiv = document.createElement("div");
    errorDiv.className = "no-results";
    const p = document.createElement("p");
    p.textContent = options.errorMessage ?? "Error loading results.";
    errorDiv.appendChild(p);
    container.replaceChildren(errorDiv);
    return false;
  } finally {
    clearLoading();
  }
}
