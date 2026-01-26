/* istanbul ignore file */

import { ClientPaths } from "@/web/client/routing/client_paths";

export const INDEX_CACHE_KEY = "/index.html";
// This is replaced at build time with the correct value.
// @ts-expect-error
const APP_BUNDLES: string[] = "@output-client-bundle-js-files@";
const APP_BUNDLE_FILES = APP_BUNDLES.map((file) => `/${file}`);
const FAVICON = "/public/favicon.ico";
const ALL_CACHED = [APP_BUNDLE_FILES, INDEX_CACHE_KEY, FAVICON];

const CACHE_NAME = "morcusOfflineData";

function isAppPage(input: string) {
  let key: keyof typeof ClientPaths;
  for (key in ClientPaths) {
    const path = ClientPaths[key];
    if (path.matches(input)) {
      return true;
    }
  }
  return false;
}

/** Resolves the cache key given a `url.pathname`. */
export function cacheKeyForPath(pathname: string): string | undefined {
  if (ALL_CACHED.includes(pathname) || pathname === FAVICON) {
    return pathname;
  }
  return isAppPage(pathname) ? INDEX_CACHE_KEY : undefined;
}

export async function returnCachedResource(
  cacheKey: string
): Promise<Response | undefined> {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(cacheKey);
}

export async function populateCache(): Promise<unknown> {
  const cache = await caches.open(CACHE_NAME);
  return cache.addAll(APP_BUNDLE_FILES);
}
