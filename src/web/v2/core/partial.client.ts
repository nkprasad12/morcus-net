/**
 * Utilities for safe DOM fragment parsing and progressive enhancement partial swapping.
 */

import { notifyContentSwap } from "@/web/v2/core/base_element.client";
import { assertConnected, escapeId } from "@/web/v2/core/dom.client";
import { SLOT_ATTR } from "@/web/v2/core/slots.common";

/**
 * Parses an HTML string into a contextual DocumentFragment using the browser's
 * Range API.
 *
 * This is the trust boundary for partial swapping, and the one place in V2 that
 * parses markup it did not build itself. The `html` helper cannot protect this:
 * the string arrives from the network, already assembled. What it rests on
 * instead is that the only callers, {@link fetchAndSwapPartial} and
 * {@link swapSlots}, fetch same-origin V2 routes, so the markup is our own SSR
 * output and is escaped server-side. Anything that starts passing third-party markup here needs a
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
  method?: "GET" | "POST";
  body?: BodyInit;
  headers?: Readonly<Record<string, string>>;
  loadingOpacity?: number;
  errorMessage?: string;
}

/**
 * Fetches an HTML partial fragment from `url` and swaps it into `container`.
 * Handles loading opacity, headers, error display, and signal cancellation.
 * The container is `aria-busy` while loading, which also lets CSS show a
 * (delayed) loading indicator.
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
  container.setAttribute("aria-busy", "true");
  const clearLoading = () => {
    if (!options.signal.aborted) {
      container.style.opacity = "";
      container.removeAttribute("aria-busy");
    }
  };

  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      body: options.body,
      headers: {
        "X-Requested-With": "fetch",
        ...(options.headers ?? {}),
      },
      signal: options.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const html = await res.text();
    // Not every fetch stack rejects `text()` on abort, and the owner may have
    // disconnected in between; either way the container is no longer ours.
    if (options.signal.aborted) return false;
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

export interface SwapSlotsOptions {
  /** What cancels this request; see {@link FetchAndSwapOptions.signal}. */
  signal: AbortSignal;
  /**
   * The slots to replace. The response must contain exactly these, and each
   * must match exactly one `[data-slot]` inside the host.
   */
  slots: readonly string[];
  method?: "GET" | "POST";
  body?: BodyInit;
  headers?: Readonly<Record<string, string>>;
  /**
   * The full navigation used when the swap can't be done (HTTP or network
   * error, or a slot mismatch). Defaults to `location.assign(url)`. Pass a
   * `location.replace` variant when the URL is already the current entry
   * (popstate), so the fallback doesn't add a duplicate history entry, or a
   * native form submission callback for POST requests.
   */
  fallback?: (url: string) => void;
  /**
   * Also swap the slots of a non-2xx response that carries them (the
   * server's error view) instead of falling back. Use it when the fallback
   * would repeat an expensive or non-idempotent request, such as a POST.
   */
  swapErrorResponses?: boolean;
}

/** Thrown for a response that doesn't match the requested or live slots. */
class SlotMismatchError extends Error {
  override name = "SlotMismatchError";
}

/**
 * Pairs each requested slot's live element with its replacement, validating
 * everything before anything is touched so a bad response changes nothing.
 */
function matchSlots(
  host: HTMLElement,
  response: DocumentFragment,
  slots: readonly string[]
): Array<{ live: HTMLElement; next: Element }> {
  const templates = new Map<string, HTMLTemplateElement>();
  for (const child of Array.from(response.children)) {
    const name = child.getAttribute(SLOT_ATTR);
    if (!(child instanceof HTMLTemplateElement) || name === null) {
      throw new SlotMismatchError(
        `unexpected <${child.tagName.toLowerCase()}> in slot response`
      );
    }
    if (templates.has(name)) {
      throw new SlotMismatchError(`slot "${name}" appears twice in response`);
    }
    templates.set(name, child);
  }
  const extra = [...templates.keys()].filter((n) => !slots.includes(n));
  if (extra.length > 0) {
    throw new SlotMismatchError(`unrequested slots: ${extra.join(", ")}`);
  }

  return slots.map((name) => {
    const template = templates.get(name);
    if (!template) {
      throw new SlotMismatchError(`slot "${name}" missing from response`);
    }
    const roots = template.content.children;
    const next = roots[0];
    if (roots.length !== 1 || next.getAttribute(SLOT_ATTR) !== name) {
      throw new SlotMismatchError(
        `template "${name}" must hold one element with data-slot="${name}"`
      );
    }
    const matches = host.querySelectorAll<HTMLElement>(
      `[${SLOT_ATTR}="${escapeId(name)}"]`
    );
    if (matches.length !== 1) {
      throw new SlotMismatchError(
        `slot "${name}" matches ${matches.length} live elements`
      );
    }
    return { live: matches[0], next };
  });
}

/** How to find the focused element again after its slot is replaced. */
function focusKey(el: Element): { attr: string; value: string } | null {
  const key = el.getAttribute("data-focus-key");
  if (key) return { attr: "data-focus-key", value: key };
  if (el.id) return { attr: "id", value: el.id };
  return null;
}

function findByKey(
  root: Element,
  key: { attr: string; value: string }
): HTMLElement | null {
  const selector = `[${key.attr}="${escapeId(key.value)}"]`;
  const hit = root.matches(selector) ? root : root.querySelector(selector);
  return hit instanceof HTMLElement ? hit : null;
}

/**
 * Fetches `url` as a slot response and replaces several regions of `host`
 * with one request (see `core/slots.common.ts` for the server side).
 *
 * Use this instead of swapping one container and patching the others by
 * scraping the new markup. Each slot element is replaced whole, so a slot
 * should wrap only markup that changes with the page: stateful controls and
 * iframes stay outside every slot and are never touched.
 *
 * - Live regions: because each slot element is replaced whole, `aria-live`
 *   attributes must sit on a stable parent wrapper (e.g. `liveSlot()` from
 *   `core/slots.common.ts`), not on the `[data-slot]` element itself.
 * - While loading, every live slot is `aria-busy` (style it in CSS).
 * - The response is validated before anything changes. A mismatch is a bug:
 *   it is logged and handled like a failed request.
 * - If focus was inside a slot, it moves to the element with the same
 *   `data-focus-key` (or `id`) in the new markup, else to the new slot
 *   itself, so it never drops to `<body>`.
 * - On an HTTP or network error, or a mismatch, falls back to a full
 *   navigation to `url` and resolves false (with `swapErrorResponses`, an
 *   HTTP error that carries the slots is swapped in instead). Aborting resolves false and
 *   leaves the DOM to whichever request replaced this one.
 */
export async function swapSlots(
  host: HTMLElement,
  url: string,
  options: SwapSlotsOptions
): Promise<boolean> {
  assertConnected(host);
  const busy = options.slots.flatMap((name) =>
    Array.from(
      host.querySelectorAll<HTMLElement>(`[${SLOT_ATTR}="${escapeId(name)}"]`)
    )
  );
  busy.forEach((el) => el.setAttribute("aria-busy", "true"));

  let pairs: Array<{ live: HTMLElement; next: Element }>;
  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      body: options.body,
      headers: {
        "X-Requested-With": "fetch",
        ...(options.headers ?? {}),
      },
      signal: options.signal,
    });
    if (!res.ok && options.swapErrorResponses !== true) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    if (options.signal.aborted) return false;
    pairs = matchSlots(host, createHtmlFragment(text), options.slots);
  } catch (err: unknown) {
    if (options.signal.aborted) return false;
    busy.forEach((el) => el.removeAttribute("aria-busy"));
    console.error("swapSlots failed; falling back to navigation:", err);
    (options.fallback ?? ((u: string) => window.location.assign(u)))(url);
    return false;
  }

  const active = document.activeElement;
  const focusedPair =
    active instanceof Element
      ? pairs.find(({ live }) => live.contains(active))
      : undefined;
  const key = active && focusedPair ? focusKey(active) : null;

  for (const { live, next } of pairs) {
    live.replaceWith(next);
  }
  for (const { next } of pairs) {
    notifyContentSwap(next);
  }

  if (focusedPair && focusedPair.next instanceof HTMLElement) {
    const slot = focusedPair.next;
    let target = key ? findByKey(slot, key) : null;
    if (!target) {
      if (!slot.hasAttribute("tabindex")) slot.setAttribute("tabindex", "-1");
      target = slot;
    }
    target.focus({ preventScroll: true });
  }
  return true;
}
