/**
 * Lightweight client-side query-string router for Progressive Enhancement / MPA state.
 */

export interface SyncQueryParamOptions {
  /** Callback fired when the query parameter changes via browser back/forward (popstate). */
  onChange: (value: string) => void;
  /** Optional formatter to update document.title when the query changes. */
  title?: (value: string) => string;
}

export interface QueryParamSync {
  /** Retrieves the current value of the query parameter from window.location. */
  get(): string;
  /** Updates the query parameter and pushes a new browser history entry. */
  push(value: string): void;
  /** Updates the query parameter and replaces the current browser history entry. */
  replace(value: string): void;
  /** Unregisters the popstate listener. */
  dispose(): void;
}

/**
 * Synchronizes a single URL query parameter (e.g. ?q=...) with browser history.
 *
 * - Intercepts popstate back/forward navigation.
 * - Guards against infinite loops and hash-only in-page anchor jumps (#top).
 * - Synchronizes document.title.
 */
export function syncQueryParam(
  paramName: string,
  options: SyncQueryParamOptions
): QueryParamSync {
  let currentSearchPath = window.location.pathname + window.location.search;

  const onPopState = () => {
    const newSearchPath = window.location.pathname + window.location.search;
    if (newSearchPath === currentSearchPath) {
      // In-page hash navigation only (e.g. #top or #card-1) - don't re-trigger route
      return;
    }
    currentSearchPath = newSearchPath;
    const urlParams = new URLSearchParams(window.location.search);
    const value = urlParams.get(paramName) ?? "";

    if (options.title) {
      document.title = options.title(value);
    }
    options.onChange(value);
  };

  window.addEventListener("popstate", onPopState);

  const navigate = (value: string, push: boolean) => {
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(paramName, value);
    } else {
      url.searchParams.delete(paramName);
    }
    const newSearchPath = url.pathname + url.search;
    currentSearchPath = newSearchPath;

    if (push) {
      window.history.pushState({ [paramName]: value }, "", newSearchPath);
    } else {
      window.history.replaceState({ [paramName]: value }, "", newSearchPath);
    }

    if (options.title) {
      document.title = options.title(value);
    }
  };

  return {
    get(): string {
      return new URLSearchParams(window.location.search).get(paramName) ?? "";
    },
    push(value: string) {
      navigate(value, true);
    },
    replace(value: string) {
      navigate(value, false);
    },
    dispose() {
      window.removeEventListener("popstate", onPopState);
    },
  };
}
