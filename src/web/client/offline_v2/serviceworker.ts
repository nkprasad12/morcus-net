/* istanbul ignore file */
/// <reference lib="webworker" />

import { clearOldCaches, populateCache } from "@/web/client/offline_v2/caches";

declare const self: ServiceWorkerGlobalScope;

/**
 * Any actions that should happen on the very first install. Note
 * that this does not come into play when e.g. the service worker starts
 * up again after the browser is closed.
 */
function onInitialInstall() {
  return populateCache();
}

function cleanupOldData() {
  return clearOldCaches();
}

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(onInitialInstall());
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  // Activate will only be called when the previous service worker (if any)
  // is no longer controlling clients, so we can safely clear old data.
  event.waitUntil(cleanupOldData());
});
