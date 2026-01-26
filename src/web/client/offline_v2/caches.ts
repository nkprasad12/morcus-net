import { getCommitHash } from "@/web/client/define_vars";
import { ClientPaths } from "@/web/client/routing/client_paths";

export const INDEX_CACHE_KEY = "/index.html";
// This is replaced at build time with the correct value.
// @ts-expect-error
const APP_BUNDLES: string[] = "@output-client-bundle-js-files@";
const APP_BUNDLE_FILES = APP_BUNDLES.map((file) => `/${file}`);
const FAVICON = "/public/favicon.ico";
const ALL_CACHED = [...APP_BUNDLE_FILES, INDEX_CACHE_KEY, FAVICON];

const CACHE_NAME = "offlineData/v1/static";

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

function cacheName() {
  return `${CACHE_NAME}/${getCommitHash()}`;
}

export async function returnCachedResource(
  cacheKey: string
): Promise<Response | undefined> {
  const cache = await caches.open(cacheName());
  return cache.match(cacheKey);
}

export async function clearOldCaches(): Promise<unknown> {
  const expectedName = cacheName();
  const cacheNames = await caches.keys();
  const deletions = cacheNames
    .filter((name) => name !== expectedName && name.startsWith(CACHE_NAME))
    .map((name) => caches.delete(name));
  return Promise.all(deletions);
}

export async function populateCache(): Promise<unknown> {
  const cache = await caches.open(cacheName());
  return cache.addAll(ALL_CACHED);
}
