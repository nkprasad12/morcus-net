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

export async function returnCachedResource(pathname: string) {
  const cache = await caches.open(CACHE_NAME);
  if (pathname === APP_BUNDLE) {
    return cache.match(APP_BUNDLE);
  }
  if (pathname === FAVICON) {
    return cache.match(FAVICON);
  }
  if (isAppPage(pathname)) {
    return cache.match(INDEX);
  }
  return undefined;
}

export async function populateCache(): Promise<unknown> {
  const cache = await caches.open(CACHE_NAME);
  return cache.addAll(ALL_CACHED);
}
