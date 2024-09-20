/**
 * Whether persistent storage is enabled.
 *
 * @returns -1 if unsupported, 0 is false, and 1 if true.
 */
export async function hasPersistedStorage(): Promise<-1 | 0 | 1> {
  if (navigator?.storage?.persisted === undefined) {
    return -1;
  }
  try {
    const enabled = await navigator.storage.persisted();
    return enabled ? 1 : 0;
  } catch (e) {
    console.debug(e);
    return 0;
  }
}

/**
 * Requests perstent storage if needed.
 *
 * @returns -1 if unsupported, 0 is unsuccessful, and 1 if successful.
 */
export async function requestPersistedStorage(): Promise<-1 | 0 | 1> {
  if ((await hasPersistedStorage()) === 1) {
    return 1;
  }
  if (navigator?.storage?.persist === undefined) {
    return -1;
  }
  try {
    const enabled = await navigator.storage.persist();
    return enabled ? 1 : 0;
  } catch (e) {
    console.debug(e);
    return 0;
  }
}

/**
 * Registers the service worker for offline mode if needed.
 *
 * @returns -1 if unsupported, 0 is unsuccessful, and 1 if successful.
 */
export async function registerServiceWorker(): Promise<-1 | 0 | 1> {
  if (!("serviceWorker" in navigator)) {
    return -1;
  }
  try {
    const registered = await navigator.serviceWorker.getRegistration();
    if (registered !== undefined) {
      return 1;
    }
  } catch (e) {
    console.debug(e);
    // Continue since we might still be able to register.
  }
  return navigator.serviceWorker.register("/serviceworker.js").then(
    () => 1,
    () => 0
  );
}
