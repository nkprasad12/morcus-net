/**
 * Build-versioned URLs for background fetches (`?v=<version>`).
 *
 * The server stamps its build version on `<html data-version>` (see
 * `renderPageShell`) and answers a request carrying the current version with
 * an immutable `Cache-Control` (`setVersionedCacheControl` in
 * `core/server/build_version.server.ts`), so repeats never leave the browser.
 * A new build is a new version, so nothing goes stale.
 */

/** The build this page was rendered by; `undefined` if it has none. */
export function getPageBuildVersion(): string | undefined {
  return document.documentElement.dataset.version || undefined;
}

/**
 * Adds `v=<build version>` to `url` for a GET whose response depends on
 * nothing but its URL (no cookies). Returns `url` unchanged when the page has
 * no build version.
 *
 * Only for the `fetch` call: never put the result in the address bar, in
 * history, or in a navigation fallback. User-visible URLs stay unversioned.
 */
export function withBuildVersion(url: string): string {
  const version = getPageBuildVersion();
  if (version === undefined) return url;
  const parsed = new URL(url, window.location.href);
  parsed.searchParams.set("v", version);
  // Same-origin input stays relative, so callers and tests see the path they
  // passed in.
  return parsed.origin === window.location.origin
    ? `${parsed.pathname}${parsed.search}${parsed.hash}`
    : parsed.href;
}
