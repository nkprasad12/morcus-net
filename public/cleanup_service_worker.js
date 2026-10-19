// Served at `/serviceworker.js` (web_server.ts), replacing the retired V1
// offline service worker (`src/web/client/offline*`).
//
// Nothing registers a service worker any more, but browsers that registered
// the V1 one keep running it, and with offline mode on it answered page loads
// from its cache. Browsers re-fetch a registered worker's script on navigation
// (bypassing the HTTP cache), so serving this one is what reaches them; a 404
// would leave the old worker in place. It installs immediately, deletes the V1
// caches and IndexedDB databases, unregisters itself, and reloads the pages it
// controlled so they come from the network.
//
// Served as-is (not bundled), so the names below are copied from the V1 code.
// `externalContent.db` is deliberately kept: the V2 External Reader uses it.
//
// Temporary: removal is tracked in src/web/ui/docs/CODE_HEALTH.md.

"use strict";

const IS_V1_CACHE = (name) =>
  name === "morcusOfflineData" || name.startsWith("offlineData/");
const V1_DBS = [
  "lewisAndShortDict",
  "smithAndHallDict",
  "OfflineModeSettings",
  "SingleItemStore.morceusTables",
  "SingleItemStore.forcedOfflineMode",
  "SingleItemStore./api/library/list",
];
const deleteDb = (name) =>
  new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    // A V1 page holding the database open blocks the delete until the
    // reload below closes it; don't wait for that.
    request.onsuccess = request.onerror = request.onblocked = resolve;
  });

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = (await caches.keys()).filter(IS_V1_CACHE);
        await Promise.allSettled([
          ...names.map((name) => caches.delete(name)),
          ...V1_DBS.map(deleteDb),
        ]);
      } catch {
        // Best effort: unregistering matters more than leftover storage.
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url).catch(() => {});
      }
    })()
  );
});
