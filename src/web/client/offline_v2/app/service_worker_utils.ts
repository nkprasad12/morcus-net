/* istanbul ignore file */

/**
 * Registers the service worker for offline mode if needed.
 *
 * Returns after the service worker is ready.
 *
 * @returns -1 if unsupported, 0 is unsuccessful, and 1 if successful.
 */
export async function registerServiceWorker(): Promise<-1 | 0 | 1> {
  if (!("serviceWorker" in navigator)) {
    return -1;
  }
  let reg: ServiceWorkerRegistration | undefined = undefined;
  try {
    reg = await navigator.serviceWorker.getRegistration();
  } catch (e) {
    console.debug(e);
    // Purposely fall through to try to register afresh.
  }
  if (reg === undefined) {
    try {
      reg = await navigator.serviceWorker.register("/serviceworker.js");
    } catch (e) {
      console.debug(e);
      return 0;
    }
  }
  return navigator.serviceWorker.ready.then(
    () => 1,
    () => 0
  );
}
