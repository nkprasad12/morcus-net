/**
 * Utilities for safe DOM fragment parsing and progressive enhancement partial swapping.
 */

/**
 * Parses an HTML string into a contextual DocumentFragment using the browser's Range API.
 */
export function createHtmlFragment(html: string): DocumentFragment {
  const range = document.createRange();
  return range.createContextualFragment(html);
}

/**
 * Safely replaces all children of `container` with parsed nodes from `html`.
 */
export function swapElementContent(container: HTMLElement, html: string): void {
  const fragment = createHtmlFragment(html);
  container.replaceChildren(fragment);
}

export interface FetchAndSwapOptions {
  signal?: AbortSignal;
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
  options?: FetchAndSwapOptions
): Promise<boolean> {
  const originalOpacity = container.style.opacity;
  container.style.opacity = String(options?.loadingOpacity ?? 0.5);

  try {
    const res = await fetch(url, {
      headers: { "X-Requested-With": "fetch" },
      signal: options?.signal,
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
    errorDiv.className = "v2-no-results";
    const p = document.createElement("p");
    p.textContent = options?.errorMessage ?? "Error loading results.";
    errorDiv.appendChild(p);
    container.replaceChildren(errorDiv);
    return false;
  } finally {
    container.style.opacity = originalOpacity || "1";
  }
}
