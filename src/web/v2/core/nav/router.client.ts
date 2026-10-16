/**
 * Lightweight client-side query-string router for Progressive Enhancement / MPA state.
 */

export interface NavigateEvent {
  prevPath: string;
  newPath: string;
  value: string;
}

export interface SyncQueryParamOptions {
  /** Callback fired when the query parameter changes via browser back/forward (popstate). */
  onChange: (value: string) => void;
  /**
   * Optional formatter for document.title, applied on popstate and on every
   * router write. `url` is the URL being shown, for titles that depend on more
   * than the tracked param (e.g. the path).
   */
  title?: (value: string, url: URL) => string;
  /**
   * Optional callback fired on popstate navigation when path or query changes.
   * If provided, caller handles both path transitions and query synchronization.
   */
  onNavigate?: (event: NavigateEvent) => void;
}

export interface UrlNavigateOptions {
  /** Stored as `history.state` (defaults to `null`). */
  state?: unknown;
}

export interface QueryParamSync {
  /** Retrieves the current value of the query parameter from window.location. */
  get(): string;
  /** Updates the query parameter and pushes a new browser history entry. */
  push(value: string): void;
  /** Updates the query parameter and replaces the current browser history entry. */
  replace(value: string): void;
  /** Pushes `url` (path, search, and hash) as a new history entry and adopts it as the tracked path. */
  pushUrl(url: string | URL, options?: UrlNavigateOptions): void;
  /** Replaces the current history entry with `url` (path, search, and hash) and adopts it as the tracked path. */
  replaceUrl(url: string | URL, options?: UrlNavigateOptions): void;
  /** Unregisters the popstate listener. */
  dispose(): void;
}

/**
 * Synchronizes a URL query parameter (e.g. ?q=...) with browser history.
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
    const prevSearchPath = currentSearchPath;
    currentSearchPath = newSearchPath;
    const urlParams = new URLSearchParams(window.location.search);
    const value = urlParams.get(paramName) ?? "";

    if (options.title) {
      document.title = options.title(value, new URL(window.location.href));
    }
    if (options.onNavigate) {
      options.onNavigate({
        prevPath: prevSearchPath,
        newPath: newSearchPath,
        value,
      });
    } else {
      options.onChange(value);
    }
  };

  // `popstate` isn't an activation event, and the returned teardown goes to
  // the caller's scope (`BaseElement.syncQueryParam`).
  // eslint-disable-next-line no-restricted-syntax
  window.addEventListener("popstate", onPopState);

  const commitUrl = (
    input: string | URL,
    state: unknown,
    push: boolean
  ): void => {
    const url = new URL(input, window.location.href);
    currentSearchPath = url.pathname + url.search;
    const href = currentSearchPath + url.hash;

    if (push) {
      // The router owns its URL and writes it without a navigation
      window.history.pushState(state, "", href);
    } else {
      // The router owns its URL and writes it without a navigation
      window.history.replaceState(state, "", href);
    }

    if (options.title) {
      document.title = options.title(
        url.searchParams.get(paramName) ?? "",
        url
      );
    }
  };

  const navigate = (value: string, push: boolean) => {
    const url = new URL(window.location.href);
    if (value) {
      url.searchParams.set(paramName, value);
    } else {
      url.searchParams.delete(paramName);
    }
    url.hash = "";
    commitUrl(url, { [paramName]: value }, push);
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
    pushUrl(url: string | URL, navOptions?: UrlNavigateOptions) {
      commitUrl(url, navOptions?.state ?? null, true);
    },
    replaceUrl(url: string | URL, navOptions?: UrlNavigateOptions) {
      commitUrl(url, navOptions?.state ?? null, false);
    },
    dispose() {
      window.removeEventListener("popstate", onPopState);
    },
  };
}
