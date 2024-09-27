import { ClientPaths } from "@/web/client/routing/client_paths";

// This is replaced at build time with the correct value.
const APP_BUNDLE = "/@bundle-with-hash-placeholder.js@";
const INDEX = "/index.html";
const FAVICON = "/public/favicon.ico";
const ALL_CACHED = [APP_BUNDLE, INDEX, FAVICON];

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
  return pathname === APP_BUNDLE
    ? APP_BUNDLE
    : pathname === FAVICON
    ? FAVICON
    : isAppPage(pathname)
    ? INDEX
    : undefined;
}

export async function returnCachedResource(
  cacheKey: string
): Promise<Response | undefined> {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(cacheKey);
}

export async function populateCache(): Promise<unknown> {
  const cache = await caches.open(CACHE_NAME);
  return cache.addAll(ALL_CACHED);
}
