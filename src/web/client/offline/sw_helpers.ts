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

/** Requests for notification permissions if needed.  */
export async function requestNotificationPermissions(): Promise<-1 | 0 | 1> {
  if (!("Notification" in window)) {
    return -1;
  }
  if (Notification.permission === "granted") {
    return 1;
  }
  // We need to ask the user for permission
  const permission = await Notification.requestPermission();
  return permission === "granted" ? 1 : 0;
}
